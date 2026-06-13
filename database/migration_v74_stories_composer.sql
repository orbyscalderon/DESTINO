-- migration_v74_stories_composer.sql — Story creator tier-2
--
-- Añade soporte para caption + CTA en stories. Compatible con stories
-- existentes (defaults a NULL).
--
-- Caption: texto overlay max 280 chars (Twitter-like).
-- CTA: link + label opcional (ej. "Comprar tickets", "Ver mi nuevo video").
-- Cover frame: para stories de video, timestamp (segundos) que sirve como
--   poster/thumbnail al renderizar StoryRing.

BEGIN;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS caption       text  CHECK (length(caption) <= 280),
  ADD COLUMN IF NOT EXISTS cta_url       text  CHECK (length(cta_url) <= 500),
  ADD COLUMN IF NOT EXISTS cta_label     text  CHECK (length(cta_label) <= 30),
  ADD COLUMN IF NOT EXISTS cover_frame_s real  CHECK (cover_frame_s IS NULL OR cover_frame_s >= 0);

-- Index parcial para stories con CTA (analytics: cuántos creators usan CTA)
CREATE INDEX IF NOT EXISTS idx_stories_cta_url ON stories (created_at DESC)
  WHERE cta_url IS NOT NULL;

COMMIT;

-- Rollback:
-- ALTER TABLE stories
--   DROP COLUMN IF EXISTS caption,
--   DROP COLUMN IF EXISTS cta_url,
--   DROP COLUMN IF EXISTS cta_label,
--   DROP COLUMN IF EXISTS cover_frame_s;
