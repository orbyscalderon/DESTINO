-- ════════════════════════════════════════════════════════════════════════════
-- Migration v70 — Adult monetization stack (14 features)
--
-- Cierra paridad con OnlyFans/Fansly/Chaturbate:
--   1)  Sexting / pay-per-message DM (creator define precio por DM recibido)
--   2)  Content vault del creator (biblioteca privada)
--   3)  Discreet billing descriptor (en compliance_config)
--   4)  Photo collections / sets (PPV de N fotos)
--   5)  Scheduled posts/reels (publish_at)
--   6)  DM paywall (fan paga por enviar DM)
--   7)  Geo-block per content
--   8)  Promo codes / discounts
--   9)  Spy mode en private shows
--   10) Auto-reply templates
--   11) Fan loyalty badges + top spenders
--   12) Pay to skip queue
--   13) AI persona chat del creator
--   14) VR/360 video metadata
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Sexting / pay-per-message DM ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_dm_pricing (
  creator_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Modo "paywall": el fan paga X coins por enviar UN mensaje al creator
  paywall_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  paywall_price_coins   INT NOT NULL DEFAULT 0,
  -- Modo "sexting": cada N mensajes intercambiados, fan paga Y coins
  sexting_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  sexting_price_coins   INT NOT NULL DEFAULT 0,
  -- Exenciones: subs activos del creator no pagan
  exempt_active_subs    BOOLEAN NOT NULL DEFAULT TRUE,
  exempt_tier_min       INT,  -- tier mínimo exento (1, 2, 3 o NULL)
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracking de DMs pagados (cada vez que un fan paga por DM)
CREATE TABLE IF NOT EXISTS dm_paywall_charges (
  id            BIGSERIAL PRIMARY KEY,
  match_id      UUID NOT NULL,
  payer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id    UUID,
  price_coins   INT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('paywall', 'sexting')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_paywall_payer ON dm_paywall_charges (payer_id, created_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS dm_paywall_charged BOOLEAN DEFAULT FALSE;

-- ─── 2) Content vault del creator ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_vault_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('photo', 'video', 'audio', 'text', 'gif')),
  title           TEXT,
  description     TEXT,
  storage_path    TEXT,
  url             TEXT,
  thumbnail_url   TEXT,
  duration_seconds INT,
  size_bytes      BIGINT,
  is_adult        BOOLEAN NOT NULL DEFAULT FALSE,
  tags            TEXT[],
  -- Para reuso rápido: cuántas veces se ha enviado/publicado
  use_count       INT NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_creator ON creator_vault_items (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_creator_type ON creator_vault_items (creator_id, type);
ALTER TABLE creator_vault_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault own" ON creator_vault_items FOR ALL USING (auth.uid() = creator_id);

-- ─── 3) Photo collections / sets ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_collections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_url       TEXT,
  price_coins     INT NOT NULL CHECK (price_coins >= 0),
  is_adult        BOOLEAN NOT NULL DEFAULT FALSE,
  items_count     INT NOT NULL DEFAULT 0,
  purchases_count INT NOT NULL DEFAULT 0,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_collections_creator ON photo_collections (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS photo_collection_items (
  id              BIGSERIAL PRIMARY KEY,
  collection_id   UUID NOT NULL REFERENCES photo_collections(id) ON DELETE CASCADE,
  vault_item_id   UUID REFERENCES creator_vault_items(id) ON DELETE CASCADE,
  position        INT NOT NULL DEFAULT 0,
  url             TEXT NOT NULL,
  thumbnail_url   TEXT
);
CREATE INDEX IF NOT EXISTS idx_collection_items ON photo_collection_items (collection_id, position);

CREATE TABLE IF NOT EXISTS photo_collection_purchases (
  id              BIGSERIAL PRIMARY KEY,
  collection_id   UUID NOT NULL REFERENCES photo_collections(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid      INT NOT NULL,
  purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_purchases_buyer ON photo_collection_purchases (buyer_id, purchased_at DESC);

ALTER TABLE photo_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_collection_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections public read" ON photo_collections FOR SELECT USING (is_published = TRUE);
CREATE POLICY "collections own" ON photo_collections FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "collection_purchases own" ON photo_collection_purchases FOR SELECT USING (auth.uid() = buyer_id);

-- Trigger para mantener items_count actualizado
CREATE OR REPLACE FUNCTION update_collection_items_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE photo_collections SET items_count = items_count + 1 WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE photo_collections SET items_count = GREATEST(0, items_count - 1) WHERE id = OLD.collection_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_collection_items_count ON photo_collection_items;
CREATE TRIGGER trg_collection_items_count
  AFTER INSERT OR DELETE ON photo_collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_items_count();

-- ─── 5) Scheduled posts/reels ───────────────────────────────────────────────
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMPTZ;

ALTER TABLE reels
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_scheduled
  ON posts (scheduled_for) WHERE scheduled_for IS NOT NULL AND published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reels_scheduled
  ON reels (scheduled_for) WHERE scheduled_for IS NOT NULL AND published_at IS NULL;

-- ─── 7) Geo-block per content ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_geo_blocks (
  id              BIGSERIAL PRIMARY KEY,
  content_type    TEXT NOT NULL CHECK (content_type IN ('post', 'reel', 'video', 'photo', 'show', 'collection', 'profile')),
  content_id      UUID NOT NULL,
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_codes   TEXT[] NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_geo_creator ON content_geo_blocks (creator_id);
CREATE INDEX IF NOT EXISTS idx_content_geo_lookup ON content_geo_blocks (content_type, content_id);

-- ─── 8) Promo codes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  creator_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('subscription', 'collection', 'tip', 'platform')),
  discount_pct    INT CHECK (discount_pct BETWEEN 1 AND 100),
  discount_coins  INT CHECK (discount_coins >= 0),
  applies_to_id   UUID,
  max_uses        INT,
  uses_count      INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_promo_codes_creator ON promo_codes (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id              BIGSERIAL PRIMARY KEY,
  promo_id        UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_id, user_id)
);

-- ─── 9) Spy mode ────────────────────────────────────────────────────────────
ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS spy_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spy_mode_price_coins INT;

CREATE TABLE IF NOT EXISTS show_spy_sessions (
  id              BIGSERIAL PRIMARY KEY,
  show_id         UUID NOT NULL,
  viewer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid      INT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- ─── 10) Auto-reply templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_auto_replies (
  creator_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  away_message    TEXT,
  trigger_mode    TEXT NOT NULL DEFAULT 'offline' CHECK (trigger_mode IN ('offline', 'always', 'after_hours')),
  business_hours_start TIME,
  business_hours_end   TIME,
  business_hours_tz    TEXT DEFAULT 'America/Santo_Domingo',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_quick_replies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut        TEXT NOT NULL,
  message         TEXT NOT NULL,
  uses_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, shortcut)
);

-- ─── 11) Fan loyalty / top spenders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fan_stats (
  fan_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_spent_coins  INT NOT NULL DEFAULT 0,
  tips_count         INT NOT NULL DEFAULT 0,
  ppv_purchases      INT NOT NULL DEFAULT 0,
  subscription_months INT NOT NULL DEFAULT 0,
  first_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at  TIMESTAMPTZ DEFAULT NOW(),
  badges          TEXT[] DEFAULT '{}',
  PRIMARY KEY (fan_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_fan_stats_creator_top ON fan_stats (creator_id, total_spent_coins DESC);

-- Vista leaderboard top spenders por creator (top 100 del mes)
CREATE OR REPLACE VIEW top_spenders_monthly AS
SELECT
  fs.creator_id, fs.fan_id, fs.total_spent_coins, fs.badges,
  ROW_NUMBER() OVER (PARTITION BY fs.creator_id ORDER BY fs.total_spent_coins DESC) AS rank
FROM fan_stats fs
WHERE fs.last_interaction_at > NOW() - INTERVAL '30 days';

-- ─── 12) Pay to skip queue (cuando hay private show pendiente) ──────────────
CREATE TABLE IF NOT EXISTS show_queue_skips (
  id              BIGSERIAL PRIMARY KEY,
  show_id         UUID NOT NULL,
  viewer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skip_price      INT NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at     TIMESTAMPTZ
);

-- ─── 13) AI persona chat del creator ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_ai_persona (
  creator_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  persona_name    TEXT,
  tone            TEXT,
  personality_prompt TEXT,
  banned_topics   TEXT[] DEFAULT '{}',
  trigger_after_min INT NOT NULL DEFAULT 30,
  max_replies_per_day_per_fan INT NOT NULL DEFAULT 10,
  disclosure_text TEXT NOT NULL DEFAULT '🤖 Esta respuesta fue generada por mi asistente IA mientras estoy offline. Te responderé personalmente pronto.',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_persona_messages (
  id              BIGSERIAL PRIMARY KEY,
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fan_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id      UUID,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_creator BOOLEAN DEFAULT FALSE,
  approved        BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_ai_persona_msgs_lookup ON ai_persona_messages (creator_id, fan_id, generated_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_ai_persona BOOLEAN DEFAULT FALSE;

-- ─── 14) VR/360 video metadata ──────────────────────────────────────────────
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS is_vr BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vr_format TEXT CHECK (vr_format IS NULL OR vr_format IN ('mono_360', 'stereo_180_sbs', 'stereo_360_tb', 'flat_180_sbs')),
  ADD COLUMN IF NOT EXISTS resolution_w INT,
  ADD COLUMN IF NOT EXISTS resolution_h INT;

CREATE INDEX IF NOT EXISTS idx_videos_vr ON profile_videos (is_vr) WHERE is_vr = TRUE;

-- ─── compliance_config: discreet billing descriptor + nuevas claves ─────────
INSERT INTO compliance_config (key, value, description) VALUES
  ('billing_descriptor_general', 'DESTINO TV',       'Descriptor que aparece en estados de cuenta para Stripe (general)'),
  ('billing_descriptor_adult',   'DT-MEDIA INTL',    'Descriptor discreto para CCBill (adult). NO menciona "adult" ni la marca real'),
  ('ai_persona_disclosure_required', 'true',         'EU AI Act: revelar al fan cuando habla con persona IA'),
  ('platform_promo_max_discount_pct', '50',          'Tope de descuento que la plataforma permite en promo codes')
ON CONFLICT (key) DO NOTHING;

COMMIT;
