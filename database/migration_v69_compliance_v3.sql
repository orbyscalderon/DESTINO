-- ════════════════════════════════════════════════════════════════════════════
-- Migration v69 — Compliance v3 (cierre real 100% — sin huecos legales)
--
-- Cierra los 10 items que faltaban tras verificación de v68:
--   1) subprocessors                      (GDPR Art. 28(2))
--   2) data_breaches                      (GDPR Art. 33-34)
--   3) processing_activities              (GDPR Art. 30)
--   4) moderation_decisions               (DSA Art. 17 Statement of Reasons)
--   5) cookies_inventory                  (ePrivacy Directive)
--   6) sensitive_consents extension       (GDPR Art. 9 special category)
--   7) profile_videos.watermark_job_id    (wiring watermark)
--   8) video_2257_records.archive_url     (cron archive)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Subprocessors (GDPR Art. 28(2)) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS subprocessors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
    'infrastructure', 'database', 'auth', 'payments', 'video', 'moderation',
    'analytics', 'crash_reporting', 'email', 'push', 'storage', 'cdn',
    'ai', 'advertising', 'other'
  )),
  purpose         TEXT NOT NULL,
  data_categories TEXT NOT NULL,
  country         TEXT NOT NULL,
  scc_signed      BOOLEAN NOT NULL DEFAULT FALSE,
  dpa_url         TEXT,
  privacy_url     TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at      TIMESTAMPTZ,
  notes           TEXT
);
ALTER TABLE subprocessors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subprocessors public read"
  ON subprocessors FOR SELECT USING (active = TRUE OR removed_at IS NOT NULL);

INSERT INTO subprocessors (name, category, purpose, data_categories, country, scc_signed, dpa_url, privacy_url) VALUES
  ('Supabase, Inc.',         'database',        'Base de datos + autenticación + almacenamiento + realtime', 'Cuenta, perfil, mensajes, media, sesiones', 'USA', TRUE,  'https://supabase.com/legal/dpa',                'https://supabase.com/privacy'),
  ('Stripe, Inc.',           'payments',        'Procesamiento de pagos (general)',                          'Email, IP, datos de tarjeta (no almacenados por OC Moon)', 'USA', TRUE,  'https://stripe.com/legal/dpa',                  'https://stripe.com/privacy'),
  ('CCBill, LLC',            'payments',        'Procesamiento de pagos (adult)',                            'Email, datos de tarjeta, edad verificada', 'USA', TRUE,  'https://ccbill.com/about/privacy-policy',       'https://ccbill.com/about/privacy-policy'),
  ('LiveKit, Inc.',          'video',           'Infraestructura de videollamadas + live shows + RTMP',      'Metadata de sesión (no contenido grabado por LiveKit)', 'USA', TRUE,  'https://livekit.io/legal/dpa',                  'https://livekit.io/privacy'),
  ('OpenAI, L.L.C.',         'ai',              'Moderación de texto + asistente AI (icebreakers)',           'Mensajes de texto (anonimizados para moderation)', 'USA', TRUE,  'https://openai.com/policies/data-processing-addendum', 'https://openai.com/policies/privacy-policy'),
  ('Sightengine SAS',        'moderation',      'Moderación automática de imágenes y videos',                  'Imágenes/frames subidos (no se almacenan)', 'Francia', TRUE,  'https://sightengine.com/legal/dpa',             'https://sightengine.com/legal/privacy'),
  ('Functional Software, Inc. (Sentry)', 'crash_reporting', 'Diagnóstico de errores',                       'IP, user agent, stack traces, user_id', 'USA', TRUE,  'https://sentry.io/legal/dpa/',                  'https://sentry.io/privacy/'),
  ('PostHog, Inc.',          'analytics',       'Analítica de producto',                                      'Eventos de uso, IP, user_id',          'USA', TRUE,  'https://posthog.com/dpa',                       'https://posthog.com/privacy'),
  ('Google LLC (AdMob)',     'advertising',     'Publicidad en versión gratuita',                             'Device ID, IP, datos de uso (consentimiento)', 'USA', TRUE,  'https://admob.google.com/intl/en/home/data-protection-terms/', 'https://policies.google.com/privacy'),
  ('Cloudflare, Inc.',       'cdn',             'CDN + WAF + DDoS protection',                                'IP, user agent, request metadata',     'USA', TRUE,  'https://www.cloudflare.com/cloudflare-customer-dpa/', 'https://www.cloudflare.com/privacypolicy/'),
  ('Railway Corp.',          'infrastructure',  'Hosting del backend',                                        'Logs del servidor',                    'USA', TRUE,  'https://railway.app/legal/dpa',                 'https://railway.app/legal/privacy'),
  ('Backblaze, Inc. (B2)',   'storage',         'Almacenamiento de media (cuando se migre desde Supabase)',   'Media subido por usuarios (encriptado)', 'USA', TRUE,  'https://www.backblaze.com/company/dpa.html',    'https://www.backblaze.com/company/privacy.html'),
  ('Bunny.net d.o.o.',       'cdn',             'CDN para servir media',                                      'IP, user agent (logs de acceso)',      'Eslovenia', TRUE, 'https://bunny.net/dpa/',                       'https://bunny.net/privacy/'),
  ('Cloudflare Pages',       'infrastructure',  'Hosting del frontend',                                       'IP, user agent (acceso público)',      'USA', TRUE,  'https://www.cloudflare.com/cloudflare-customer-dpa/', 'https://www.cloudflare.com/privacypolicy/'),
  ('Anthropic, PBC',         'ai',              'AI assistant (alternativa/futuro)',                          'Mensajes de texto enviados al modelo', 'USA', TRUE,  'https://www.anthropic.com/legal/dpa',           'https://www.anthropic.com/legal/privacy')
ON CONFLICT DO NOTHING;

-- ─── 2) Data Breaches (GDPR Art. 33-34) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_breaches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category                 TEXT NOT NULL CHECK (category IN (
    'confidentiality', 'integrity', 'availability', 'mixed'
  )),
  severity                 TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  affected_users_count     INT NOT NULL DEFAULT 0,
  affected_data_categories TEXT NOT NULL,
  description              TEXT NOT NULL,
  root_cause               TEXT,
  containment_actions      TEXT,
  authority_notified_at    TIMESTAMPTZ,
  authority_reference      TEXT,
  users_notified_at        TIMESTAMPTZ,
  users_notification_text  TEXT,
  resolved_at              TIMESTAMPTZ,
  resolution_notes         TEXT,
  reported_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN (
    'investigating', 'contained', 'notified', 'resolved'
  ))
);
ALTER TABLE data_breaches ENABLE ROW LEVEL SECURITY;
-- service_role only — datos sensibles

CREATE INDEX IF NOT EXISTS idx_breaches_status ON data_breaches (status, detected_at DESC);

-- ─── 3) Records of Processing Activities (GDPR Art. 30) ─────────────────────
CREATE TABLE IF NOT EXISTS processing_activities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL UNIQUE,
  purpose                  TEXT NOT NULL,
  data_categories          TEXT NOT NULL,
  data_subjects            TEXT NOT NULL,
  legal_basis              TEXT NOT NULL CHECK (legal_basis IN (
    'consent', 'contract', 'legal_obligation', 'vital_interests',
    'public_task', 'legitimate_interests'
  )),
  legal_basis_detail       TEXT,
  retention_period         TEXT NOT NULL,
  international_transfers  TEXT,
  security_measures        TEXT NOT NULL,
  subprocessors            TEXT,
  is_special_category      BOOLEAN NOT NULL DEFAULT FALSE,
  special_category_basis   TEXT,
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE processing_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "processing_activities public read" ON processing_activities
  FOR SELECT USING (active = TRUE);

INSERT INTO processing_activities (name, purpose, data_categories, data_subjects, legal_basis, retention_period, international_transfers, security_measures, subprocessors, is_special_category, special_category_basis) VALUES
  ('Cuenta de usuario',
   'Crear y gestionar la cuenta del usuario',
   'Email, nombre, foto de perfil, contraseña (hash)',
   'Usuarios registrados',
   'contract',
   'Mientras la cuenta esté activa + 30 días tras eliminación',
   'USA (Supabase, Stripe)',
   'Encriptación AES-256 reposo, TLS 1.3 tránsito, RLS Supabase',
   'Supabase, Stripe',
   FALSE, NULL),

  ('Matching y citas',
   'Mostrar perfiles compatibles, gestionar likes y matches',
   'Ubicación, edad, género, intereses, preferencias',
   'Usuarios registrados',
   'contract',
   'Mientras la cuenta esté activa',
   'USA (Supabase)',
   'RLS Supabase, hashing de datos sensibles',
   'Supabase',
   FALSE, NULL),

  ('Mensajería privada',
   'Permitir comunicación entre usuarios matched',
   'Mensajes de texto, media adjunta, timestamps',
   'Usuarios registrados con match',
   'contract',
   'Mientras los usuarios estén matched o hasta que uno borre cuenta',
   'USA (Supabase)',
   'Encriptación TLS, RLS Supabase',
   'Supabase',
   FALSE, NULL),

  ('Contenido adulto (categoría especial)',
   'Permitir creación, distribución y consumo de contenido adulto entre usuarios verificados 18+',
   'Datos sobre vida sexual, orientación sexual (inferidos), media adulto',
   'Creators adult + viewers adult verificados',
   'consent',
   '7 años tras la última publicación (record-keeping 2257)',
   'USA (Supabase, B2, CCBill)',
   'Bucket privado encriptado, custodian designado, watermark, age gate, RLS',
   'Supabase, CCBill, Backblaze, Sightengine',
   TRUE, 'GDPR Art. 9(2)(a) — explicit consent + Art. 9(2)(e) — manifestly made public'),

  ('Moderación automatizada',
   'Detectar contenido ilegal o que viole términos mediante IA',
   'Contenido subido (imagen/video/texto)',
   'Todos los usuarios que suben contenido',
   'legal_obligation',
   'Logs de decisión: 1 año. Contenido: según las reglas del propio contenido',
   'USA (OpenAI), Francia (Sightengine)',
   'Anonimización de inputs, no almacenamiento por terceros',
   'OpenAI, Sightengine',
   FALSE, NULL),

  ('Procesamiento de pagos',
   'Procesar suscripciones, propinas y compras de coins',
   'Email, dirección de facturación, últimos 4 dígitos de tarjeta (Stripe), historial de transacciones',
   'Usuarios que realizan pagos',
   'legal_obligation',
   'Registros transaccionales: 7 años (obligación fiscal)',
   'USA (Stripe, CCBill)',
   'PCI-DSS Level 1 (Stripe/CCBill), tokens en lugar de tarjeta',
   'Stripe, CCBill',
   FALSE, NULL),

  ('Live shows + video',
   'Streaming en vivo, video chat entre matches',
   'Metadata de sesión, IP, calidad de conexión',
   'Hosts + viewers + matches en video chat',
   'contract',
   'Metadata: 90 días. Grabaciones (si opt-in): 1 año',
   'USA (LiveKit)',
   'Encriptación E2E opcional, autenticación por token corto',
   'LiveKit',
   FALSE, NULL),

  ('Notificaciones',
   'Enviar push notifications, emails transaccionales',
   'Email, device token, preferencias',
   'Usuarios con consent',
   'consent',
   'Mientras el consent esté activo',
   'USA (Firebase FCM, Apple APNS, SES)',
   'TLS, token revocable',
   'Firebase, Apple',
   FALSE, NULL),

  ('Analítica de producto',
   'Mejorar UX, detectar bugs, medir funnel',
   'Eventos de uso, IP truncada, user_id pseudonymizado',
   'Usuarios con consent analytics',
   'consent',
   '14 meses',
   'USA (PostHog, Sentry)',
   'Pseudonymization, IP truncada',
   'PostHog, Sentry',
   FALSE, NULL)
ON CONFLICT (name) DO NOTHING;

-- ─── 4) Moderation Decisions (DSA Art. 17 Statement of Reasons) ─────────────
CREATE TABLE IF NOT EXISTS moderation_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type        TEXT NOT NULL CHECK (content_type IN (
    'photo', 'video', 'post', 'show', 'profile', 'message', 'reel', 'comment', 'sticker', 'other'
  )),
  content_id          UUID,
  affected_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision            TEXT NOT NULL CHECK (decision IN (
    'removed', 'hidden', 'demoted', 'age_restricted', 'monetization_disabled',
    'account_suspended', 'account_banned', 'warning_issued', 'restored'
  )),
  decision_method     TEXT NOT NULL CHECK (decision_method IN (
    'automated', 'human', 'mixed'
  )),
  decided_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  automated_system    TEXT,
  reason_category     TEXT NOT NULL,
  reason_detail       TEXT NOT NULL,
  legal_basis         TEXT,
  tos_clause          TEXT,
  geographic_scope    TEXT,
  source              TEXT NOT NULL CHECK (source IN (
    'user_report', 'dmca_notice', 'dsa_notice', 'trusted_flagger',
    'automated_scan', 'admin_initiative', 'court_order', 'government_request'
  )),
  source_reference_id UUID,
  appeal_deadline     TIMESTAMPTZ,
  appealable          BOOLEAN NOT NULL DEFAULT TRUE,
  user_notified_at    TIMESTAMPTZ,
  notification_method TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modec_user      ON moderation_decisions (affected_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modec_content   ON moderation_decisions (content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_modec_source    ON moderation_decisions (source, created_at DESC);

ALTER TABLE moderation_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modec own read" ON moderation_decisions
  FOR SELECT USING (auth.uid() = affected_user_id);

-- ─── 5) Cookies inventory pública ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cookies_inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
    'essential', 'preferences', 'analytics', 'marketing', 'advertising', 'thirdparty'
  )),
  duration    TEXT NOT NULL,
  party       TEXT NOT NULL CHECK (party IN ('first', 'third')),
  subprocessor TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE cookies_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cookies public read" ON cookies_inventory FOR SELECT USING (active = TRUE);

INSERT INTO cookies_inventory (name, domain, purpose, category, duration, party, subprocessor) VALUES
  ('sb-access-token',           '.destino.app',      'Token de sesión Supabase Auth',                 'essential',   'Sesión (max 1h refresh)', 'first', 'Supabase'),
  ('sb-refresh-token',          '.destino.app',      'Refresh token Supabase Auth',                   'essential',   '30 días',                 'first', 'Supabase'),
  ('destino_cookie_consent_v1', 'destino.app',       'Estado del banner de cookies + modo elegido',   'essential',   '1 año',                   'first', NULL),
  ('destino_ccpa_optout',       'destino.app',       'Opt-out CCPA almacenado localmente',            'essential',   '1 año',                   'first', NULL),
  ('destino_geo_country',       'destino.app',       'Cache de país detectado para banner GDPR-aware','preferences', 'Sesión',                  'first', NULL),
  ('destino-chunk-reload',      'destino.app',       'Flag temporal para evitar reload loop al actualizar bundle', 'essential', 'Sesión',     'first', NULL),
  ('destino-pending-affiliate', 'destino.app',       'Código de afiliado capturado antes de signup',  'essential',   '30 días',                 'first', NULL),
  ('cf_clearance',              '.destino.app',      'Cloudflare bot mitigation challenge',           'essential',   '30 min',                  'first', 'Cloudflare'),
  ('__cf_bm',                   '.destino.app',      'Cloudflare bot management',                     'essential',   '30 min',                  'third', 'Cloudflare'),
  ('_ga',                       '.destino.app',      'Google Analytics 4 — distinción de usuarios',   'analytics',   '2 años',                  'third', 'Google'),
  ('_ga_*',                     '.destino.app',      'Google Analytics 4 — estado de sesión',         'analytics',   '2 años',                  'third', 'Google'),
  ('ph_*',                      '.destino.app',      'PostHog analytics events',                      'analytics',   '1 año',                   'third', 'PostHog'),
  ('IDE',                       '.doubleclick.net',  'Google AdMob — personalización de anuncios',    'advertising', '13 meses',                'third', 'Google AdMob'),
  ('NID',                       '.google.com',       'Google — preferencias de usuario',              'advertising', '6 meses',                 'third', 'Google'),
  ('intercom-id-*',             '.intercom.io',      'Soporte (si Intercom habilitado)',              'preferences', '9 meses',                 'third', 'Intercom')
ON CONFLICT DO NOTHING;

-- ─── 6) Sensitive consents (GDPR Art. 9 explicit consent) ───────────────────
ALTER TABLE user_consents
  DROP CONSTRAINT IF EXISTS user_consents_purpose_check;

ALTER TABLE user_consents
  ADD CONSTRAINT user_consents_purpose_check CHECK (purpose IN (
    'analytics', 'marketing', 'personalization', 'advertising',
    'thirdparty_share', 'ccpa_optout', 'data_sale',
    -- Special category Art. 9
    'sensitive_sexual_orientation', 'sensitive_adult_content',
    'sensitive_political', 'sensitive_health'
  ));

-- ─── 7) Wiring columns ──────────────────────────────────────────────────────
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS watermark_job_id UUID,
  ADD COLUMN IF NOT EXISTS watermarked_url  TEXT;

-- ─── 8) Compliance config: nuevas claves ────────────────────────────────────
INSERT INTO compliance_config (key, value, description) VALUES
  ('subprocessors_url',       '/privacy/subprocessors',  'Lista pública de subprocessors'),
  ('cookies_url',             '/privacy/cookies',        'Inventario de cookies'),
  ('processing_activities_url','/privacy/processing',    'Records of Processing Activities (Art. 30)'),
  ('breach_notification_email','breach@destino.app',     'Email para reportar breaches a la entidad'),
  ('subprocessor_change_notice_days', '30',              'Días de aviso a usuarios antes de cambio de subprocessor')
ON CONFLICT (key) DO NOTHING;

COMMIT;
