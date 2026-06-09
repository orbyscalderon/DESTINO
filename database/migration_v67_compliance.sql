-- ════════════════════════════════════════════════════════════════════════════
-- Migration v67 — Compliance hardening
--
-- Cierra todos los gaps detectados en la auditoría:
--   1) compliance_config — singleton key/value para entidad legal, DPO, DMCA
--      agent, custodian 2257. Editable desde admin sin redeploy.
--   2) user_consents — consentimiento granular GDPR/LGPD (analytics,
--      marketing, advertising, etc.) con audit trail.
--   3) trusted_flaggers + trusted_flag_reports — DSA Art. 22 (EU).
--   4) transparency_reports — DSA Art. 15/24 snapshot trimestral público.
--   5) geo_blocks — seed extendido: bloqueo total adult fuera de LATAM hasta
--      que custodian USA + UK Online Safety Act estén resueltos.
--   6) gov_requests — log de requerimientos de autoridades (DSA req).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) compliance_config ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE compliance_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_config public read" ON compliance_config
  FOR SELECT USING (TRUE);

INSERT INTO compliance_config (key, value, description) VALUES
  ('entity_name',              'OC Moon Group LLC',                 'Razón social operadora'),
  ('entity_brand',             'Destino TV',                        'Marca comercial'),
  ('entity_jurisdiction',      'Estados Unidos — estado por confirmar', 'País + estado de formación de la LLC'),
  ('entity_address',           'Pendiente',                         'Domicilio fiscal registrado'),
  ('entity_tax_id',            'Pendiente — EIN',                   'EIN (Employer Identification Number)'),
  ('dpo_name',                 'Orbys (interim)',                   'Data Protection Officer'),
  ('dpo_email',                'dpo@destino.app',                   'Email del DPO'),
  ('legal_email',              'legal@destino.app',                 'Buzón legal'),
  ('support_email',            'soporte@destino.app',               'Soporte usuario'),
  ('dmca_email',               'dmca@destino.app',                  'Buzón DMCA'),
  ('dmca_agent_name',          'Pendiente de designación',          'DMCA Designated Agent — 17 USC 512(c)(2)'),
  ('dmca_agent_address',       'Pendiente',                         'Dirección física del agente'),
  ('dmca_agent_email',         'dmca@destino.app',                  'Email del agente'),
  ('dmca_agent_phone',         'Pendiente',                         'Teléfono del agente'),
  ('dmca_agent_registered_at', 'Pendiente',                         'Fecha de registro en US Copyright Office'),
  ('custodian_name',           'Pendiente — Solo USA',              '2257 Custodian of Records — 18 USC 2257'),
  ('custodian_address',        'N/A — Fase 1 LATAM, USA geo-bloqueado', 'Dirección física del custodian'),
  ('custodian_email',          'records@destino.app',               'Email del custodian'),
  ('custodian_hours',          'L-V 9-17 hrs (timezone TBD)',       'Horario de inspección'),
  ('eu_representative_name',   'N/A — EU no abierto en Fase 1',     'GDPR Art. 27 representative'),
  ('eu_representative_address','N/A',                               'Dirección del representante UE'),
  ('eu_representative_email',  'eu-rep@destino.app',                'Email del representante UE'),
  ('governing_law',            'México',                            'Ley aplicable'),
  ('arbitration_venue',        'CDMX, México',                      'Sede arbitral'),
  ('phase',                    '1-latam',                           'Fase de despliegue: 1-latam | 2-spain | 3-global')
ON CONFLICT (key) DO NOTHING;

-- ─── 2) user_consents (GDPR/LGPD granular) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN (
    'analytics', 'marketing', 'personalization', 'advertising', 'thirdparty_share'
  )),
  granted      BOOLEAN NOT NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  ip           INET,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_consents_lookup
  ON user_consents (user_id, purpose, granted_at DESC);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents own read"  ON user_consents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "consents own write" ON user_consents FOR INSERT WITH CHECK (auth.uid() = user_id);

-- View con el estado vigente por usuario+purpose (el último insert)
CREATE OR REPLACE VIEW user_consents_current AS
SELECT DISTINCT ON (user_id, purpose)
  user_id, purpose, granted, granted_at
FROM user_consents
ORDER BY user_id, purpose, granted_at DESC;

-- ─── 3) trusted_flaggers (DSA Art. 22) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS trusted_flaggers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name     TEXT NOT NULL,
  contact_name          TEXT,
  contact_email         TEXT NOT NULL UNIQUE,
  country_code          TEXT NOT NULL,
  designation_authority TEXT,
  api_key_hash          TEXT UNIQUE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  designated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                 TEXT
);

CREATE TABLE IF NOT EXISTS trusted_flag_reports (
  id               BIGSERIAL PRIMARY KEY,
  flagger_id       UUID NOT NULL REFERENCES trusted_flaggers(id) ON DELETE CASCADE,
  content_type     TEXT NOT NULL CHECK (content_type IN (
    'photo', 'video', 'post', 'show', 'profile', 'message', 'reel', 'other'
  )),
  content_id       UUID,
  content_url      TEXT,
  reason           TEXT NOT NULL,
  illegality_basis TEXT,
  priority         TEXT NOT NULL DEFAULT 'high',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewed', 'actioned', 'dismissed'
  )),
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  resolution       TEXT,
  resolution_notes TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tfr_status ON trusted_flag_reports (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tfr_flagger ON trusted_flag_reports (flagger_id, submitted_at DESC);

ALTER TABLE trusted_flaggers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_flag_reports ENABLE ROW LEVEL SECURITY;
-- backend service_role only — sin policies de lectura pública

-- ─── 4) transparency_reports (DSA Art. 15/24) ───────────────────────────────
CREATE TABLE IF NOT EXISTS transparency_reports (
  id                              BIGSERIAL PRIMARY KEY,
  period                          TEXT NOT NULL UNIQUE,
  period_start                    DATE NOT NULL,
  period_end                      DATE NOT NULL,
  total_users                     INT NOT NULL DEFAULT 0,
  total_creators                  INT NOT NULL DEFAULT 0,
  total_reports_received          INT NOT NULL DEFAULT 0,
  total_reports_actioned          INT NOT NULL DEFAULT 0,
  total_content_removed           INT NOT NULL DEFAULT 0,
  total_accounts_banned           INT NOT NULL DEFAULT 0,
  total_dmca_received             INT NOT NULL DEFAULT 0,
  total_dmca_accepted             INT NOT NULL DEFAULT 0,
  total_trusted_flagger_reports   INT NOT NULL DEFAULT 0,
  total_government_requests       INT NOT NULL DEFAULT 0,
  total_appeals_received          INT NOT NULL DEFAULT 0,
  total_appeals_upheld            INT NOT NULL DEFAULT 0,
  median_response_hours           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                           TEXT,
  is_published                    BOOLEAN NOT NULL DEFAULT FALSE,
  published_at                    TIMESTAMPTZ
);

ALTER TABLE transparency_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transparency public read" ON transparency_reports
  FOR SELECT USING (is_published = TRUE);

-- RPC: generar un transparency_report a partir de las tablas actuales.
-- Idempotente (UPSERT por period).
CREATE OR REPLACE FUNCTION generate_transparency_report(
  p_period TEXT,
  p_start  DATE,
  p_end    DATE
) RETURNS transparency_reports AS $$
DECLARE
  rec transparency_reports;
BEGIN
  INSERT INTO transparency_reports (
    period, period_start, period_end,
    total_users, total_creators,
    total_reports_received, total_reports_actioned,
    total_content_removed, total_accounts_banned,
    total_dmca_received, total_dmca_accepted,
    total_trusted_flagger_reports, total_government_requests
  ) VALUES (
    p_period, p_start, p_end,
    (SELECT COUNT(*) FROM profiles WHERE created_at <= p_end),
    (SELECT COUNT(*) FROM profiles WHERE created_at <= p_end AND is_creator = TRUE),
    (SELECT COUNT(*) FROM reports WHERE created_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM reports WHERE status = 'reviewed' AND created_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM profile_videos WHERE dmca_taken_down = TRUE AND created_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM profiles WHERE is_banned = TRUE AND banned_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM dmca_requests WHERE created_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM dmca_requests WHERE status = 'accepted' AND created_at BETWEEN p_start AND p_end),
    (SELECT COUNT(*) FROM trusted_flag_reports WHERE submitted_at BETWEEN p_start AND p_end),
    0
  )
  ON CONFLICT (period) DO UPDATE SET
    total_users                     = EXCLUDED.total_users,
    total_creators                  = EXCLUDED.total_creators,
    total_reports_received          = EXCLUDED.total_reports_received,
    total_reports_actioned          = EXCLUDED.total_reports_actioned,
    total_content_removed           = EXCLUDED.total_content_removed,
    total_accounts_banned           = EXCLUDED.total_accounts_banned,
    total_dmca_received             = EXCLUDED.total_dmca_received,
    total_dmca_accepted             = EXCLUDED.total_dmca_accepted,
    total_trusted_flagger_reports   = EXCLUDED.total_trusted_flagger_reports
  RETURNING * INTO rec;
  RETURN rec;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5) government_requests (DSA + legal hold log) ──────────────────────────
CREATE TABLE IF NOT EXISTS government_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority     TEXT NOT NULL,
  country_code  TEXT NOT NULL,
  request_type  TEXT NOT NULL CHECK (request_type IN (
    'data_disclosure', 'content_removal', 'user_identification', 'legal_hold', 'other'
  )),
  subject_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  legal_basis      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'complied', 'partially_complied', 'rejected', 'challenged'
  )),
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMPTZ,
  response_notes   TEXT,
  evidence_url     TEXT,
  handled_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_govreq_status ON government_requests (status, received_at DESC);
ALTER TABLE government_requests ENABLE ROW LEVEL SECURITY;
-- backend service_role only

-- ─── 6) geo_blocks — Fase 1 LATAM-only adult policy ─────────────────────────
-- Bloquea adult fuera de LATAM hasta cerrar:
--   - Custodian USA físico (2257)
--   - UK Online Safety Act age verification
--   - DSA / AVMS compliance EU
-- UNIQUE INDEX antes del INSERT para que ON CONFLICT respete idempotencia.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_geo_blocks_country_region
  ON geo_blocks (country_code, COALESCE(region_code, ''));

INSERT INTO geo_blocks (country_code, region_code, reason) VALUES
  ('US', NULL, 'Pendiente custodian 2257 físico designado en USA'),
  ('GB', NULL, 'UK Online Safety Act 2023 — age verification con doc requerida'),
  ('CA', NULL, 'Bill C-11 + provincial regulation'),
  ('AU', NULL, 'AU Online Safety Act 2021'),
  ('NZ', NULL, 'NZ Films Videos Publications Act'),
  ('JP', NULL, 'Pendiente revisión legal'),
  ('KR', NULL, 'KR Information Communications Network Act'),
  ('IN', NULL, 'India IT Rules 2021 — block obligatorio'),
  ('PK', NULL, 'Adult content prohibido'),
  ('BD', NULL, 'Adult content prohibido'),
  ('TR', NULL, 'Turkey Law 5651'),
  ('EG', NULL, 'Adult content prohibido'),
  ('MA', NULL, 'Adult content prohibido'),
  ('TN', NULL, 'Adult content prohibido'),
  ('DZ', NULL, 'Adult content prohibido'),
  ('LY', NULL, 'Adult content prohibido'),
  ('SD', NULL, 'Adult content prohibido'),
  ('QA', NULL, 'Adult content prohibido'),
  ('KW', NULL, 'Adult content prohibido'),
  ('BH', NULL, 'Adult content prohibido'),
  ('OM', NULL, 'Adult content prohibido'),
  ('YE', NULL, 'Adult content prohibido'),
  ('JO', NULL, 'Adult content prohibido'),
  ('LB', NULL, 'Adult content prohibido'),
  ('SY', NULL, 'Adult content prohibido'),
  ('IQ', NULL, 'Adult content prohibido'),
  ('AF', NULL, 'Adult content prohibido'),
  ('VN', NULL, 'Vietnam adult restrictions'),
  ('TH', NULL, 'TH Computer Crime Act'),
  ('MY', NULL, 'Malaysia adult restrictions'),
  ('ID', NULL, 'Indonesia adult restrictions'),
  ('PH', NULL, 'Pendiente revisión legal'),
  ('SG', NULL, 'Singapore IMDA'),
  -- EU/EEA bloqueado en Fase 1 hasta DSA + AVMS compliance
  ('AT', NULL, 'EU AVMS Directive — Fase 2'),
  ('BE', NULL, 'EU AVMS Directive — Fase 2'),
  ('BG', NULL, 'EU AVMS Directive — Fase 2'),
  ('HR', NULL, 'EU AVMS Directive — Fase 2'),
  ('CY', NULL, 'EU AVMS Directive — Fase 2'),
  ('CZ', NULL, 'EU AVMS Directive — Fase 2'),
  ('DK', NULL, 'EU AVMS Directive — Fase 2'),
  ('EE', NULL, 'EU AVMS Directive — Fase 2'),
  ('FI', NULL, 'EU AVMS Directive — Fase 2'),
  ('FR', NULL, 'EU AVMS Directive — Fase 2'),
  ('DE', NULL, 'EU AVMS Directive — Fase 2'),
  ('GR', NULL, 'EU AVMS Directive — Fase 2'),
  ('HU', NULL, 'EU AVMS Directive — Fase 2'),
  ('IE', NULL, 'EU AVMS Directive — Fase 2'),
  ('IT', NULL, 'EU AVMS Directive — Fase 2'),
  ('LV', NULL, 'EU AVMS Directive — Fase 2'),
  ('LT', NULL, 'EU AVMS Directive — Fase 2'),
  ('LU', NULL, 'EU AVMS Directive — Fase 2'),
  ('MT', NULL, 'EU AVMS Directive — Fase 2'),
  ('NL', NULL, 'EU AVMS Directive — Fase 2'),
  ('PL', NULL, 'EU AVMS Directive — Fase 2'),
  ('PT', NULL, 'EU AVMS Directive — Fase 2'),
  ('RO', NULL, 'EU AVMS Directive — Fase 2'),
  ('SK', NULL, 'EU AVMS Directive — Fase 2'),
  ('SI', NULL, 'EU AVMS Directive — Fase 2'),
  ('ES', NULL, 'EU AVMS Directive — Fase 2 (mercado prioritario)'),
  ('SE', NULL, 'EU AVMS Directive — Fase 2'),
  ('NO', NULL, 'EEA — Fase 2'),
  ('IS', NULL, 'EEA — Fase 2'),
  ('LI', NULL, 'EEA — Fase 2'),
  ('CH', NULL, 'Pendiente revisión')
ON CONFLICT DO NOTHING;

COMMIT;
