-- ────────────────────────────────────────────────────────────────────────────
-- Migration v32 — Tier-based subscriptions + sub gifting
--
-- 1. creator_tiers          — un creador define hasta 3 tiers (Bronze/Silver/Gold)
-- 2. creator_subscriptions  — añade tier_id + is_gift + gifted_by + gift_message
-- 3. Backward compat: si un creador no tiene tiers definidos, sigue funcionando
--    con creator_subscription_price (precio único legacy).
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) CREATOR_TIERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier_level          INT  NOT NULL CHECK (tier_level BETWEEN 1 AND 3), -- 1=Bronze, 2=Silver, 3=Gold
  name                TEXT NOT NULL,                       -- "Fan", "VIP", "Top Fan", o lo que quiera
  price               NUMERIC(10,2) NOT NULL CHECK (price > 0),
  badge_color         TEXT DEFAULT '#CD7F32',              -- hex color del badge
  badge_emoji         TEXT DEFAULT '🥉',                   -- emoji para el badge
  perks               JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- estructura perks sugerida:
  -- {
  --   "discount_pct_ppv": 0,         -- % descuento en PPV (0-100)
  --   "discount_pct_tips": 0,        -- % bonus en tip (visual al fan)
  --   "free_messages_per_day": 0,    -- mensajes gratis fan→creator/día
  --   "exclusive_content": false,    -- acceso a posts marcados como exclusivo tier+
  --   "exclusive_shows": false,      -- entra gratis a shows pagados del creator
  --   "priority_dm": false,          -- mensajes destacados con badge
  --   "custom_emoji": false          -- chat shows con emoji especial
  -- }
  description         TEXT,                                 -- texto público que ve el fan
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (creator_id, tier_level)
);

CREATE INDEX IF NOT EXISTS idx_tiers_creator
  ON creator_tiers (creator_id, tier_level)
  WHERE is_active = TRUE;

-- ─── 2) EXTENDER CREATOR_SUBSCRIPTIONS ───────────────────────────────────────
ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS tier_id       UUID REFERENCES creator_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_gift       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gifted_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_message  TEXT,
  ADD COLUMN IF NOT EXISTS free_messages_used_today INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_messages_reset_at   DATE;

CREATE INDEX IF NOT EXISTS idx_subs_tier      ON creator_subscriptions (tier_id);
CREATE INDEX IF NOT EXISTS idx_subs_gifted_by ON creator_subscriptions (gifted_by) WHERE is_gift = TRUE;

-- ─── 3) POSTS MARCADOS POR TIER MINIMO ───────────────────────────────────────
-- 0 = visible para cualquier suscriptor activo (legacy is_subscribers_only)
-- 1+= requiere ese tier_level (e.g. min_tier_level=2 → solo Silver y Gold)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS min_tier_level INT DEFAULT 0;

-- ─── 4) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE creator_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiers public read"     ON creator_tiers;
DROP POLICY IF EXISTS "tiers creator manage"  ON creator_tiers;

CREATE POLICY "tiers public read"
  ON creator_tiers FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "tiers creator manage"
  ON creator_tiers FOR ALL
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- ─── 5) COIN_TRANSACTIONS.type: añadir tipos para gifting + sincronizar tipos en uso ─
-- v12 dejó la constraint con solo {purchase, tip_sent, tip_received, ppv_spent,
-- ppv_received, refund, bonus, boost} pero el código ya inserta tipos nuevos
-- (gift_sent, gift_received, post_sale, etc.). Esto reescribe el CHECK con
-- TODOS los tipos válidos actuales + los nuevos de tiers.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_type_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN (
    'purchase', 'bonus', 'refund', 'boost',
    'tip_sent', 'tip_received',
    'ppv_spent', 'ppv_received',
    'gift_sent', 'gift_received',
    'post_sale', 'post_purchase',
    'video_sale', 'video_purchase',
    'video_request_escrow', 'video_request_refund', 'video_request_sale',
    'private_show', 'private_show_earning',
    'completion_reward',
    'gift_subscription', 'subscription_gift_received',
    'sub_renewal', 'sub_renewal_received',
    'video_call_minute', 'video_call_earning'
  ));

-- ─── 6) TRIGGER updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_creator_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creator_tiers_updated_at ON creator_tiers;
CREATE TRIGGER trg_creator_tiers_updated_at
  BEFORE UPDATE ON creator_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_tiers_updated_at();
