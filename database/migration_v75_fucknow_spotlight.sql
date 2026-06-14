-- migration_v75_fucknow_spotlight.sql
--
-- Modelo "Fuck Now Spotlight" — usuarios pagan suscripción para aparecer
-- en el directorio /adult?tab=ahora. Adult dating con publicación premium,
-- estilo AdultFriendFinder/Pure, NO escort directory.
--
-- ToS automático al activar: el publisher acepta que no publicará:
-- tarifas por servicios físicos, contacto externo, ni menú de servicios
-- sexuales explícitos. El backend además aplica regex de moderación
-- server-side para hacer cumplir esto.

BEGIN;

-- Columnas en profiles para el Spotlight
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fucknow_publisher       boolean      DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS fucknow_published_at    timestamptz,
  ADD COLUMN IF NOT EXISTS fucknow_expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS fucknow_bio             text         CHECK (length(fucknow_bio) <= 600),
  ADD COLUMN IF NOT EXISTS fucknow_looking_for     text         CHECK (length(fucknow_looking_for) <= 200),
  ADD COLUMN IF NOT EXISTS fucknow_availability    jsonb,        -- { days: [...], hours_from, hours_to }
  ADD COLUMN IF NOT EXISTS fucknow_intent          text         CHECK (fucknow_intent IN ('casual','fwb','date','fun','open')),
  ADD COLUMN IF NOT EXISTS fucknow_city            text         CHECK (length(fucknow_city) <= 80),
  ADD COLUMN IF NOT EXISTS fucknow_interests       text[],      -- array de intereses libres
  ADD COLUMN IF NOT EXISTS fucknow_tos_accepted_at timestamptz;

-- Skokka-style demographics (opcionales — render condicional en card)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS height_cm    int   CHECK (height_cm IS NULL OR (height_cm BETWEEN 100 AND 230)),
  ADD COLUMN IF NOT EXISTS body_type    text  CHECK (body_type IS NULL OR body_type IN ('delgada','atletica','curvy','plus','fitness')),
  ADD COLUMN IF NOT EXISTS ethnicity    text  CHECK (ethnicity IS NULL OR ethnicity IN ('latina','caucasica','afro','asiatica','mixta')),
  ADD COLUMN IF NOT EXISTS languages    text[];  -- ['es','en','pt']

-- Índice parcial para queries del directorio — solo publishers activos
CREATE INDEX IF NOT EXISTS idx_profiles_fucknow_active
  ON profiles (fucknow_published_at DESC)
  WHERE fucknow_publisher = true
    AND fucknow_expires_at > now();

-- Índice geográfico para filtrar por ciudad en el directorio
CREATE INDEX IF NOT EXISTS idx_profiles_fucknow_city
  ON profiles (lower(fucknow_city))
  WHERE fucknow_publisher = true AND fucknow_expires_at > now();

-- Log de moderación: cada vez que un publisher edita su bio/looking_for,
-- registramos si pasó/falló y por qué regla, para auditoría y métricas.
CREATE TABLE IF NOT EXISTS fucknow_moderation_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field        text NOT NULL CHECK (field IN ('bio','looking_for')),
  raw_value    text NOT NULL,
  outcome      text NOT NULL CHECK (outcome IN ('accepted','rejected')),
  rule_matched text,             -- 'money_rate' | 'external_contact' | 'address' | NULL si accepted
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fucknow_modlog_user_created
  ON fucknow_moderation_log (user_id, created_at DESC);

COMMIT;

-- Rollback (manual, no auto):
-- DROP TABLE fucknow_moderation_log;
-- ALTER TABLE profiles
--   DROP COLUMN fucknow_publisher,
--   DROP COLUMN fucknow_published_at,
--   DROP COLUMN fucknow_expires_at,
--   DROP COLUMN fucknow_bio,
--   DROP COLUMN fucknow_looking_for,
--   DROP COLUMN fucknow_availability,
--   DROP COLUMN fucknow_intent,
--   DROP COLUMN fucknow_city,
--   DROP COLUMN fucknow_interests,
--   DROP COLUMN fucknow_tos_accepted_at,
--   DROP COLUMN height_cm,
--   DROP COLUMN body_type,
--   DROP COLUMN ethnicity,
--   DROP COLUMN languages;
