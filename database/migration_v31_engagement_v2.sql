-- ────────────────────────────────────────────────────────────────────────────
-- Migration v31 — Engagement v2
-- 1. Tip menu / wishlist por creador (vs OnlyFans)
-- 2. PPV broadcast: extender creator_blasts y messages para mass DM con pago
-- 3. Big gift animations: threshold + asset_url en regalos custom
-- 4. Live captions: flag en live_shows
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) TIP MENU / WISHLIST ──────────────────────────────────────────────────
-- Los creadores definen "qué pueden comprarles" con precios sugeridos.
-- Ej: "💋 Beso enviado por video — 50 coins", "📞 5min llamada privada — 300"
CREATE TABLE IF NOT EXISTS creator_tip_menu (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,                -- "Beso", "Llamada 5min", etc.
  description  TEXT,                          -- texto adicional opcional
  emoji        TEXT,                          -- "💋", "📞"
  price_coins  INT NOT NULL,                  -- precio sugerido
  position     INT DEFAULT 0,                 -- orden de display
  is_active    BOOLEAN DEFAULT TRUE,
  redemptions_count INT DEFAULT 0,            -- cuántas veces fue "comprado"
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CHECK (price_coins > 0 AND price_coins <= 99999)
);
CREATE INDEX IF NOT EXISTS idx_tip_menu_creator
  ON creator_tip_menu (creator_id, position)
  WHERE is_active = TRUE;

-- ─── 2) BIG GIFT ANIMATIONS ──────────────────────────────────────────────────
-- Threshold de coins que dispara animación full-screen.
-- También permite custom_gifts tener un animation_url propio.
ALTER TABLE creator_gifts
  ADD COLUMN IF NOT EXISTS animation_url      TEXT,    -- lottie .json o video corto
  ADD COLUMN IF NOT EXISTS is_premium         BOOLEAN DEFAULT FALSE;

-- Threshold globals (admin-controllable después). Por defecto 200 coins ($10).
-- Lo dejamos como constante en código por ahora.

-- ─── 3) LIVE CAPTIONS ────────────────────────────────────────────────────────
ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS captions_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS captions_lang    TEXT;     -- ISO 639-1: 'es', 'en'

-- (No persistimos cada caption — viajan por Supabase realtime broadcast)

-- ─── 4) PPV mass DM ──────────────────────────────────────────────────────────
-- Extender messages para que un broadcast pueda ser PPV
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_broadcast       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS broadcast_batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_messages_broadcast_batch
  ON messages (broadcast_batch_id)
  WHERE broadcast_batch_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE creator_tip_menu ENABLE ROW LEVEL SECURITY;

-- Tip menu: público (cualquiera puede ver los menús de creadores)
CREATE POLICY "tip_menu public read" ON creator_tip_menu FOR SELECT USING (is_active = TRUE OR auth.uid() = creator_id);
-- Escrituras: solo desde backend con service key

-- ─── Seed: tip menu default para creadores existentes (opcional, no idempotente sin check) ──
-- (no seed automático — cada creador configura el suyo)
