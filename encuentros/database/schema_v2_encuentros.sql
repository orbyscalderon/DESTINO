-- encuentros — schema v2 (incremental sobre v1)
--
-- Agrega: publishers (auth), payments, age_verifications, geo_blocks,
-- favorites, blocked_users, audit_log, admin_users, mail_log,
-- + funciones RPC, triggers, RLS policies.
--
-- Asume que schema_v1_encuentros.sql ya fue aplicado.
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE en todo.

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- PUBLISHERS — auth de los que publican anuncios
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_publishers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE,
  email_verified_at   timestamptz,
  phone               text,
  full_name           text,
  -- Identity verification (NO se reutiliza el age_verified del listing —
  -- el publisher puede crear varios listings pero solo verifica su ID 1x).
  identity_verified   boolean DEFAULT false,
  identity_method     text,         -- 'onfido','jumio','manual'
  identity_verified_at timestamptz,
  identity_doc_url    text,         -- encriptado en storage (acceso solo super-admin)
  -- Status
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'banned', 'pending_verification', 'deleted')),
  banned_reason       text,
  banned_at           timestamptz,
  -- Anti-abuse
  ip_at_signup        inet,
  ua_at_signup        text,
  last_login_at       timestamptz,
  last_login_ip       inet,
  -- Compliance
  accepted_tos_version int DEFAULT 1,
  accepted_tos_at     timestamptz DEFAULT now(),
  accepted_2257_at    timestamptz,
  -- GDPR
  data_export_requested_at  timestamptz,
  deletion_requested_at     timestamptz,
  scheduled_deletion_at     timestamptz,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_pub_email ON encuentros_publishers (lower(email));
CREATE INDEX IF NOT EXISTS idx_enc_pub_status ON encuentros_publishers (status, created_at DESC);

-- FK del listing al publisher (nullable durante migración v1→v2)
ALTER TABLE encuentros_listings
  ADD COLUMN IF NOT EXISTS publisher_id uuid REFERENCES encuentros_publishers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_enc_listings_publisher ON encuentros_listings (publisher_id);

-- ════════════════════════════════════════════════════════════════════
-- MAGIC LINK SESSIONS — auth via email token (sin password)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_magic_links (
  token_hash    text PRIMARY KEY,    -- sha256 del token enviado por email
  publisher_id  uuid REFERENCES encuentros_publishers(id) ON DELETE CASCADE,
  email         text NOT NULL,        -- para login antes de existir publisher
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  ip            inet,
  ua            text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_magic_expires ON encuentros_magic_links (expires_at);

CREATE TABLE IF NOT EXISTS encuentros_sessions (
  token_hash    text PRIMARY KEY,    -- sha256 del session token (NUNCA plain en DB)
  publisher_id  uuid REFERENCES encuentros_publishers(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  ip            inet,
  ua            text,
  last_used_at  timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_sessions_publisher ON encuentros_sessions (publisher_id);
CREATE INDEX IF NOT EXISTS idx_enc_sessions_expires ON encuentros_sessions (expires_at);

-- ════════════════════════════════════════════════════════════════════
-- AGE VERIFICATIONS — historial de verificaciones (audit-friendly)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_age_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    uuid REFERENCES encuentros_publishers(id) ON DELETE CASCADE,
  listing_id      uuid REFERENCES encuentros_listings(id) ON DELETE SET NULL,
  provider        text NOT NULL CHECK (provider IN ('onfido','jumio','veriff','manual','document_only')),
  provider_check_id text,            -- el ID del check externo (idempotency)
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','clear','consider','rejected','manual_review')),
  document_type   text,              -- 'passport','drivers_license','national_id'
  document_country text,
  -- Sin almacenar foto del documento aquí — solo URL al storage cifrado
  -- accesible únicamente por super-admin via signed URL.
  document_url    text,
  selfie_url      text,
  raw_provider_response jsonb,
  reviewer_notes  text,
  created_at      timestamptz DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_enc_av_publisher ON encuentros_age_verifications (publisher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_av_pending ON encuentros_age_verifications (status, created_at DESC) WHERE status IN ('pending', 'manual_review');

-- ════════════════════════════════════════════════════════════════════
-- PAYMENTS / INVOICES — webhook trail de processors
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id      uuid REFERENCES encuentros_publishers(id) ON DELETE SET NULL,
  listing_id        uuid REFERENCES encuentros_listings(id) ON DELETE SET NULL,
  subscription_id   uuid REFERENCES encuentros_subscriptions(id) ON DELETE SET NULL,
  processor         text NOT NULL CHECK (processor IN ('verotel','mobiuspay','segpay','ccbill_safetynet')),
  processor_txn_id  text NOT NULL,    -- IDEMPOTENCY KEY del webhook
  event_type        text NOT NULL,    -- 'initial','rebill','refund','chargeback','cancellation'
  amount_usd        numeric(10,2) NOT NULL,
  currency          text DEFAULT 'USD',
  status            text NOT NULL CHECK (status IN ('succeeded','failed','refunded','chargeback')),
  raw_webhook       jsonb,
  ip                inet,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (processor, processor_txn_id, event_type)  -- previene duplicados
);
CREATE INDEX IF NOT EXISTS idx_enc_payments_publisher ON encuentros_payments (publisher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_payments_listing ON encuentros_payments (listing_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- GEO BLOCKS — bloqueo por país que un listing puede setear sobre sí mismo
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_geo_blocks (
  listing_id      uuid PRIMARY KEY REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  blocked_countries text[] NOT NULL DEFAULT '{}',  -- ej. ['US','CA']
  reason          text,
  updated_at      timestamptz DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════
-- FAVORITES — favoritos guardados por device fingerprint (sin auth)
-- ════════════════════════════════════════════════════════════════════
-- Esto está client-side mayormente, pero opcionalmente backend lo persiste
-- via fingerprint anónimo (para que sobreviva limpieza de localStorage).
CREATE TABLE IF NOT EXISTS encuentros_favorites (
  fingerprint     text NOT NULL,       -- hash del fingerprint del browser
  listing_id      uuid REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  PRIMARY KEY (fingerprint, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_enc_fav_fp ON encuentros_favorites (fingerprint);

-- ════════════════════════════════════════════════════════════════════
-- BLOCKED CONTACTS — emails/IPs blocked por admins
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_blocklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL CHECK (type IN ('email','ip','phone','device')),
  value           text NOT NULL,
  reason          text,
  blocked_by      text,
  expires_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_block_lookup ON encuentros_blocklist (type, value);

-- ════════════════════════════════════════════════════════════════════
-- ADMIN USERS — quién puede operar el dashboard de moderación
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  role            text NOT NULL DEFAULT 'moderator'
                  CHECK (role IN ('super_admin','admin','moderator','viewer')),
  permissions     jsonb DEFAULT '{}'::jsonb,
  -- Status
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  -- 2FA
  totp_secret     text,
  totp_enabled    boolean DEFAULT false,
  -- Audit
  last_login_at   timestamptz,
  last_login_ip   inet,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_admins_email ON encuentros_admins (lower(email));

-- ════════════════════════════════════════════════════════════════════
-- MAIL LOG — auditable de qué emails se mandaron a quién
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_mail_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        text NOT NULL,
  template        text NOT NULL,
  subject         text,
  provider        text,        -- 'resend','sendgrid','postmark'
  provider_msg_id text,
  status          text CHECK (status IN ('queued','sent','failed','bounced')),
  error           text,
  metadata        jsonb,
  sent_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_mail_to ON encuentros_mail_log (lower(to_email), sent_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- AUDIT LOG — todo cambio sensible que un admin hace
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type      text NOT NULL CHECK (actor_type IN ('admin','publisher','system','public')),
  actor_id        text,
  action          text NOT NULL,           -- 'listing.approve', 'listing.reject', 'publisher.ban', ...
  target_type     text,                    -- 'listing','publisher','report'
  target_id       text,
  before_state    jsonb,
  after_state     jsonb,
  ip              inet,
  ua              text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_audit_action ON encuentros_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enc_audit_target ON encuentros_audit_log (target_type, target_id);

-- ════════════════════════════════════════════════════════════════════
-- LISTING PHOTOS — separado para gestión de orden + verificación
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS encuentros_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  url             text NOT NULL,
  thumbnail_url   text,
  position        int NOT NULL DEFAULT 0,
  is_verified     boolean DEFAULT false,    -- foto con cartel + ID en mano
  is_cover        boolean DEFAULT false,
  -- Moderación: cada foto pasa por revisión (manual o IA)
  moderation_status text NOT NULL DEFAULT 'pending'
                  CHECK (moderation_status IN ('pending','approved','rejected')),
  moderation_reason text,
  moderation_score numeric(3,2),            -- 0.00 a 1.00 si IA
  -- Compliance
  uploaded_ip     inet,
  exif_stripped   boolean DEFAULT false,    -- el backend debe hacer esto antes de servir
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enc_photos_listing ON encuentros_photos (listing_id, position);
CREATE INDEX IF NOT EXISTS idx_enc_photos_mod ON encuentros_photos (moderation_status, created_at DESC) WHERE moderation_status = 'pending';

-- ════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS — increment counters atómicos
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_listing_views(p_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE encuentros_listings
  SET views_count = views_count + 1
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION increment_listing_contacts(p_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE encuentros_listings
  SET contacts_count = contacts_count + 1
  WHERE id = p_id;
$$;

-- ════════════════════════════════════════════════════════════════════
-- TRIGGERS — auto updated_at
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enc_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enc_listings_set_updated_at ON encuentros_listings;
CREATE TRIGGER enc_listings_set_updated_at
  BEFORE UPDATE ON encuentros_listings
  FOR EACH ROW EXECUTE FUNCTION enc_set_updated_at();

DROP TRIGGER IF EXISTS enc_subs_set_updated_at ON encuentros_subscriptions;
CREATE TRIGGER enc_subs_set_updated_at
  BEFORE UPDATE ON encuentros_subscriptions
  FOR EACH ROW EXECUTE FUNCTION enc_set_updated_at();

DROP TRIGGER IF EXISTS enc_publishers_set_updated_at ON encuentros_publishers;
CREATE TRIGGER enc_publishers_set_updated_at
  BEFORE UPDATE ON encuentros_publishers
  FOR EACH ROW EXECUTE FUNCTION enc_set_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- FUNCTION: expire_old_listings
-- Cron diario corre esto. Marca status='expired' y notifica al publisher.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION expire_old_listings()
RETURNS TABLE(expired_id uuid, publisher_email text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE encuentros_listings l
  SET status = 'expired'
  WHERE l.status = 'active' AND l.expires_at < now()
  RETURNING l.id, l.publisher_email;
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- FUNCTION: listings_expiring_soon
-- Notifica al publisher 3 días antes de expirar.
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION listings_expiring_soon()
RETURNS TABLE(listing_id uuid, publisher_email text, expires_at timestamptz, display_name text)
LANGUAGE sql
AS $$
  SELECT id, publisher_email, expires_at, display_name
  FROM encuentros_listings
  WHERE status = 'active'
    AND expires_at BETWEEN now() AND (now() + interval '3 days');
$$;

-- ════════════════════════════════════════════════════════════════════
-- RLS — habilitada en tablas con datos sensibles
-- (los endpoints REST usan service_role, no anon, así RLS es defensa
-- en profundidad si algún día se expone anon key)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE encuentros_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuentros_age_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuentros_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuentros_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuentros_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuentros_audit_log ENABLE ROW LEVEL SECURITY;

-- Por default deny-all (service_role bypassa RLS, los endpoints usan
-- service_role pero la app pública NUNCA debe llegar a estas tablas vía
-- anon key).
CREATE POLICY "deny all by default" ON encuentros_publishers FOR ALL TO authenticated USING (false);
CREATE POLICY "deny all by default" ON encuentros_age_verifications FOR ALL TO authenticated USING (false);
CREATE POLICY "deny all by default" ON encuentros_sessions FOR ALL TO authenticated USING (false);
CREATE POLICY "deny all by default" ON encuentros_payments FOR ALL TO authenticated USING (false);
CREATE POLICY "deny all by default" ON encuentros_admins FOR ALL TO authenticated USING (false);
CREATE POLICY "deny all by default" ON encuentros_audit_log FOR ALL TO authenticated USING (false);

COMMIT;
