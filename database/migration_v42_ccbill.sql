-- ────────────────────────────────────────────────────────────────────────────
-- Migration v42 — CCBill payment processor para adult creators
--
-- Stripe rechaza creators adultos en muchos países. CCBill (y Segpay,
-- RocketGate) son los procesadores estándar de la industria adulta.
-- Esta migración añade el soporte multi-processor para que cada creator
-- pueda elegir cómo cobra.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) profiles: preferencia de processor + cuentas externas
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_processor TEXT
    CHECK (preferred_processor IN ('stripe', 'ccbill', 'segpay') OR preferred_processor IS NULL),
  -- CCBill: cada creator/sub-account tiene su sub-account ID + form ID
  ADD COLUMN IF NOT EXISTS ccbill_sub_account_id TEXT,
  ADD COLUMN IF NOT EXISTS ccbill_recurring_form_id TEXT,
  ADD COLUMN IF NOT EXISTS ccbill_account_status TEXT
    CHECK (ccbill_account_status IN ('pending', 'active', 'suspended') OR ccbill_account_status IS NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 2) ccbill_subscriptions — mapeo CCBill subscription ↔ creator_subscriptions
--    CCBill maneja su propia suscripción remota, esta tabla nos da
--    la conexión bidireccional para procesar webhooks.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ccbill_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier_id                  UUID REFERENCES creator_tiers(id) ON DELETE SET NULL,
  -- CCBill identifiers
  ccbill_subscription_id   TEXT UNIQUE NOT NULL,
  ccbill_sub_account_id    TEXT NOT NULL,
  -- Financial
  amount_usd               NUMERIC(10,2) NOT NULL,
  currency                 TEXT DEFAULT 'USD',
  recurring_period_days    INT DEFAULT 30,
  -- Status
  status                   TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'canceled', 'chargeback', 'declined')),
  current_period_end       TIMESTAMPTZ,
  last_renewed_at          TIMESTAMPTZ,
  canceled_at              TIMESTAMPTZ,
  -- Audit
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subscriber_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_ccbill_subs_subscriber ON ccbill_subscriptions (subscriber_id, status);
CREATE INDEX IF NOT EXISTS idx_ccbill_subs_creator    ON ccbill_subscriptions (creator_id, status);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) ccbill_events: idempotency log para webhooks
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ccbill_events (
  event_id       TEXT PRIMARY KEY,
  event_type     TEXT NOT NULL,        -- 'NewSaleSuccess', 'Renewal', 'Cancellation', 'Chargeback'
  processed_at   TIMESTAMPTZ DEFAULT NOW(),
  payload        JSONB
);

CREATE INDEX IF NOT EXISTS idx_ccbill_events_type
  ON ccbill_events (event_type, processed_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE ccbill_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ccbill_events        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ccbill sub own read"      ON ccbill_subscriptions;
DROP POLICY IF EXISTS "ccbill sub creator read"  ON ccbill_subscriptions;

CREATE POLICY "ccbill sub own read"
  ON ccbill_subscriptions FOR SELECT
  USING (auth.uid() = subscriber_id);

CREATE POLICY "ccbill sub creator read"
  ON ccbill_subscriptions FOR SELECT
  USING (auth.uid() = creator_id);

-- Eventos solo accesibles vía service_role (backend)
