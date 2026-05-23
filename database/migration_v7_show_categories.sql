-- Migration v7: Categorías de shows en vivo
-- Ejecutar en Supabase > SQL Editor

ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'chat';

-- Índice para filtrar por categoría eficientemente
CREATE INDEX IF NOT EXISTS idx_live_shows_category ON live_shows(category);

-- Actualizar shows existentes sin categoría explícita a 'chat'
UPDATE live_shows SET category = 'chat' WHERE category IS NULL;
