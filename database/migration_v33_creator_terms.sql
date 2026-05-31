-- ────────────────────────────────────────────────────────────────────────────
-- Migration v33 — Creator terms acceptance + adult onboarding metadata
--
-- 1. Timestamps de aceptación de términos (creator general y adult)
-- 2. Helpers para identificar el tipo de creador y su estado de onboarding
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS creator_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adult_terms_accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_terms_version     TEXT DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS adult_terms_version       TEXT;

-- Index para auditoría futura (filtrar creators que aceptaron / no)
CREATE INDEX IF NOT EXISTS idx_profiles_creator_terms
  ON profiles (creator_terms_accepted_at)
  WHERE is_creator = TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_adult_terms
  ON profiles (adult_terms_accepted_at)
  WHERE is_adult_creator = TRUE;
