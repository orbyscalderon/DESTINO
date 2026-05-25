-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Columnas faltantes en posts
-- postController usa is_paid, price y moderation_notes
-- Seguro re-ejecutar: usa IF NOT EXISTS en todo
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_paid           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_notes  text;

NOTIFY pgrst, 'reload schema';
