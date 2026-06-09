-- ════════════════════════════════════════════════════════════════════════════
-- Migration v68 — Compliance v2 (cierre 100%)
--
-- Cierra todos los items técnicos pendientes de la auditoría:
--   1) DSA Art. 16 Notice and Action mechanism (separado del DMCA)
--   2) Creator Welcome Messages (auto DM al subscribirse)
--   3) Mass DM con PPV (broadcast a todos los subs / tier)
--   4) Watermark queue server-side (FFmpeg burn-in)
--   5) 2257 expiration tracking (7 años)
--   6) CCPA opt-out (purpose adicional en user_consents)
--   7) COPPA gate (dob verificada)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) DSA Notice and Action (Art. 16 + Art. 22) ───────────────────────────
CREATE TABLE IF NOT EXISTS dsa_notices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notifier_name            TEXT NOT NULL,
  notifier_email           TEXT NOT NULL,
  notifier_country         TEXT,
  is_trusted_flagger       BOOLEAN DEFAULT FALSE,
  trusted_flagger_id       UUID REFERENCES trusted_flaggers(id) ON DELETE SET NULL,
  content_type             TEXT NOT NULL CHECK (content_type IN (
    'photo', 'video', 'post', 'show', 'profile', 'message', 'reel', 'other'
  )),
  content_id               UUID,
  content_url              TEXT,
  reason_category          TEXT NOT NULL CHECK (reason_category IN (
    'illegal_content', 'csam', 'terrorism', 'hate_speech', 'harassment',
    'copyright', 'trademark', 'privacy_violation', 'non_consensual',
    'minor_protection', 'consumer_protection', 'other'
  )),
  reason_text              TEXT NOT NULL,
  alleged_illegality_basis TEXT,
  good_faith_statement     BOOLEAN NOT NULL DEFAULT FALSE,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'acknowledged', 'reviewed', 'actioned', 'dismissed'
  )),
  acknowledged_at          TIMESTAMPTZ,
  reviewed_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  resolution               TEXT,
  resolution_notes         TEXT,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip                       INET,
  user_agent               TEXT
);
CREATE INDEX IF NOT EXISTS idx_dsa_notices_status ON dsa_notices (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsa_notices_category ON dsa_notices (reason_category, submitted_at DESC);
ALTER TABLE dsa_notices ENABLE ROW LEVEL SECURITY;
-- service_role only

-- ─── 2) Creator Welcome Messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_welcome_messages (
  creator_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  message_text  TEXT NOT NULL,
  ppv_media_url TEXT,
  ppv_price     INT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_creator_subs_welcome_pending
  ON creator_subscriptions (creator_id, subscriber_id)
  WHERE welcome_sent_at IS NULL;

-- ─── 3) Mass DM Broadcasts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_dm_broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_filter    TEXT NOT NULL CHECK (target_filter IN (
    'all_subs', 'tier_1_plus', 'tier_2_plus', 'tier_3'
  )),
  message_text     TEXT,
  ppv_media_url    TEXT,
  ppv_price        INT,
  recipients_count INT NOT NULL DEFAULT 0,
  sent_count       INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'completed', 'failed')),
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mass_dm_creator ON mass_dm_broadcasts (creator_id, created_at DESC);

-- Optional column en messages para tracking
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES mass_dm_broadcasts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_welcome BOOLEAN DEFAULT FALSE;

-- ─── 4) Watermark FFmpeg Queue ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watermark_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video_id  UUID,
  source_url       TEXT NOT NULL,
  watermark_text   TEXT NOT NULL,
  output_url       TEXT,
  output_path      TEXT,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'processing', 'done', 'failed'
  )),
  worker_id        TEXT,
  error            TEXT,
  retries          INT NOT NULL DEFAULT 0,
  priority         INT NOT NULL DEFAULT 5,
  enqueued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wm_jobs_queue
  ON watermark_jobs (priority DESC, enqueued_at)
  WHERE status = 'queued';

-- ─── 5) 2257 Records expiration tracking ────────────────────────────────────
ALTER TABLE video_2257_records
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_url TEXT;

-- Set expires_at on existing records (7 años desde consent_signed_at)
UPDATE video_2257_records
  SET expires_at = consent_signed_at + INTERVAL '7 years'
  WHERE expires_at IS NULL AND consent_signed_at IS NOT NULL;

-- Trigger para auto-set en futuros records
CREATE OR REPLACE FUNCTION set_2257_expiration() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.consent_signed_at + INTERVAL '7 years';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_2257_expiration ON video_2257_records;
CREATE TRIGGER trg_2257_expiration
  BEFORE INSERT ON video_2257_records
  FOR EACH ROW EXECUTE FUNCTION set_2257_expiration();

-- ─── 6) CCPA opt-out + COPPA gate ───────────────────────────────────────────
-- Extender purposes en user_consents check constraint
ALTER TABLE user_consents
  DROP CONSTRAINT IF EXISTS user_consents_purpose_check;

ALTER TABLE user_consents
  ADD CONSTRAINT user_consents_purpose_check CHECK (purpose IN (
    'analytics', 'marketing', 'personalization', 'advertising',
    'thirdparty_share', 'ccpa_optout', 'data_sale'
  ));

-- COPPA: profile.dob_verified_at marca cuando el user pasó age gate explícito
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dob_verified_at TIMESTAMPTZ;

-- ─── 7) Compliance config: nuevas claves ────────────────────────────────────
INSERT INTO compliance_config (key, value, description) VALUES
  ('ccpa_notice_url',          '/privacy/ccpa',              'CCPA "Do Not Sell or Share My Information" page URL'),
  ('dsa_notice_url',           '/dsa-notice',                'DSA Art. 16 Notice and Action page URL'),
  ('age_minimum',              '18',                         'Edad mínima global'),
  ('watermark_enabled_adult',  'true',                       'Si watermark FFmpeg server-side está activo para adult'),
  ('coppa_gate_strict',        'true',                       'Si el age gate de registro es estricto (DOB obligatoria)'),
  ('scc_module',               'Module Two (Controller to Processor) — 2021/914', 'Standard Contractual Clauses module'),
  ('avms_country_establishment','Pendiente',                  'AVMS country of establishment para servicio EU adult')
ON CONFLICT (key) DO NOTHING;

COMMIT;
