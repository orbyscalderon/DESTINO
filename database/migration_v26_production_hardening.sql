-- ────────────────────────────────────────────────────────────────────────────
-- Migration v26 — Production hardening
-- 1. Renovación automática de suscripciones a creadores
-- 2. DMCA takedown requests
-- 3. Account lockout (intentos de login fallidos)
-- 4. GDPR: data export requests + deletion log
-- 5. Auto payouts (Stripe Connect) — cola de payouts automáticos
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) RENOVACIÓN AUTOMÁTICA DE SUSCRIPCIONES A CREADORES ──────────────────
-- Guardamos el método de pago para cobrar off-session cuando vence el período.
ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_renew               BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_renewal_attempt     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_renewal_count     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canceled_at              TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_creator_subs_renewal
  ON creator_subscriptions (current_period_end)
  WHERE status = 'active' AND auto_renew = TRUE;

-- ─── 2) DMCA TAKEDOWN REQUESTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dmca_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quien reclama (puede ser anónimo / no registrado)
  claimant_name      TEXT NOT NULL,
  claimant_email     TEXT NOT NULL,
  claimant_address   TEXT,
  claimant_phone     TEXT,
  copyright_owner    TEXT NOT NULL,
  original_work_url  TEXT,
  -- Contenido reportado
  infringing_url     TEXT NOT NULL,
  content_type       TEXT,         -- 'photo' | 'video' | 'post' | 'show' | 'other'
  content_id         UUID,         -- nullable: puede ser referencia a otra tabla
  reported_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Declaraciones legales requeridas por DMCA
  good_faith_statement      BOOLEAN NOT NULL,
  accuracy_statement        BOOLEAN NOT NULL,
  perjury_acknowledgment    BOOLEAN NOT NULL,
  signature                 TEXT NOT NULL,
  -- Estado
  status         TEXT DEFAULT 'pending', -- pending | reviewing | accepted | rejected | counter_notice
  admin_notes    TEXT,
  reviewed_by    UUID REFERENCES auth.users(id),
  reviewed_at    TIMESTAMPTZ,
  resolution     TEXT, -- 'content_removed' | 'no_action' | 'counter_received'
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dmca_status  ON dmca_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dmca_user    ON dmca_requests (reported_user_id);

-- ─── 3) ACCOUNT LOCKOUT ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  ip_address   TEXT,
  user_agent   TEXT,
  success      BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
  ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON login_attempts (ip_address, created_at DESC);

-- Bloqueos activos
CREATE TABLE IF NOT EXISTS account_lockouts (
  email          TEXT PRIMARY KEY,
  locked_until   TIMESTAMPTZ NOT NULL,
  reason         TEXT DEFAULT 'too_many_failed_attempts',
  attempt_count  INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4) GDPR DATA EXPORT REQUESTS + DELETION LOG ─────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_export_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'pending', -- pending | processing | ready | downloaded | expired
  download_url TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gdpr_user ON gdpr_export_requests (user_id, created_at DESC);

-- Log de cuentas borradas (para auditoría)
CREATE TABLE IF NOT EXISTS deletion_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  email           TEXT,
  reason          TEXT, -- 'user_request' | 'admin_action' | 'tos_violation'
  deleted_by      UUID, -- admin id si fue admin_action
  deleted_at      TIMESTAMPTZ DEFAULT NOW(),
  data_purge_status TEXT DEFAULT 'pending' -- pending | completed
);

-- ─── 5) AUTO PAYOUTS (Stripe Connect) ────────────────────────────────────────
-- Cola para procesar payouts automáticos sin aprobación manual cuando el
-- creador tenga Stripe Connect activo y haya alcanzado el umbral mínimo.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_payout_enabled        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_payout_min_usd        NUMERIC(10,2) DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS last_auto_payout_at        TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auto_payouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd            NUMERIC(10,2) NOT NULL,
  stripe_transfer_id    TEXT,
  stripe_payout_id      TEXT,
  status                TEXT DEFAULT 'pending', -- pending | sent | failed
  error_message         TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auto_payouts_creator
  ON auto_payouts (creator_id, created_at DESC);

-- ─── 6) RLS POLICIES (las que aplican) ───────────────────────────────────────
ALTER TABLE dmca_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_lockouts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_payouts         ENABLE ROW LEVEL SECURITY;

-- Solo backend (service_role) tiene acceso completo; ningún policy abierto.
-- Los endpoints del backend usan supabase service key, así que las RLS
-- estrictas son seguras.

-- Usuarios pueden ver sus propios export requests
CREATE POLICY "users see own export requests"
  ON gdpr_export_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Cualquiera puede insertar un DMCA request (es un form público)
-- → manejamos esto desde el backend con anon key, no necesita policy de SELECT
