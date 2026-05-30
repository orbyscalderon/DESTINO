-- Migration v25: Regalos personalizados por creador
-- Permite al creador crear su propio catálogo de regalos con emoji o imagen

CREATE TABLE IF NOT EXISTS creator_gifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,                       -- emoji unicode (opcional si hay image)
  image_url TEXT,                   -- URL a imagen custom (opcional si hay emoji)
  coins INTEGER NOT NULL CHECK (coins >= 1 AND coins <= 99999),
  active BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (emoji IS NOT NULL OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_creator_gifts_creator ON creator_gifts(creator_id) WHERE active = TRUE;

-- Referencia opcional al gift custom en show_gifts (si gift_type es 'custom:UUID')
-- No se cambia la columna gift_type — sigue siendo TEXT
-- En backend, gift_type puede ser 'rose'/'heart'/'diamond'/'crown' o 'custom:{gift_id}'

ALTER TABLE show_gifts ADD COLUMN IF NOT EXISTS custom_gift_id UUID REFERENCES creator_gifts(id) ON DELETE SET NULL;
