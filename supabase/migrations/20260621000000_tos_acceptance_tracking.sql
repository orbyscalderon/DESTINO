-- Tracking de aceptación de Terms/Privacy en profiles.
-- Cumple GDPR Art. 7 (consent debe ser auditable) + CCPA + DSA Art. 14.
-- Antes solo había accepted_tos_at en raw_user_meta_data (no auditable, no queryable).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accepted_tos_version  int,
  ADD COLUMN IF NOT EXISTS accepted_tos_at       timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_tos_ip       inet,
  ADD COLUMN IF NOT EXISTS confirmed_age_at      timestamptz;

-- Index para queries de "users que no han aceptado la nueva versión" (cuando
-- bumpeamos TOS_VERSION y queremos prompt de re-aceptación).
CREATE INDEX IF NOT EXISTS idx_profiles_tos_version
  ON profiles (accepted_tos_version)
  WHERE accepted_tos_version IS NOT NULL;

-- Backfill: marcar a TODOS los usuarios existentes como version=0 (legacy).
-- Cuando bumpeemos a version=1, el siguiente login les pedirá aceptar.
UPDATE profiles
  SET accepted_tos_version = 0
  WHERE accepted_tos_version IS NULL;
