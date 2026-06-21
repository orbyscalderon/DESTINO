-- Columnas de perfiles que pueden faltar en bases de datos creadas con el schema v1
-- Seguro re-ejecutar (usa ADD COLUMN IF NOT EXISTS)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS interests                  text[]        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_creator                 boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_bio                text,
  ADD COLUMN IF NOT EXISTS creator_subscription_price numeric(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_adult_creator           boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_views              integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boosted_until              timestamptz,
  ADD COLUMN IF NOT EXISTS is_incognito               boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS coins_balance              integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS age_verified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS streak_count               integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reward_date           date,
  ADD COLUMN IF NOT EXISTS referral_code              text          UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by                uuid;

-- Índice para boost
CREATE INDEX IF NOT EXISTS idx_profiles_boosted_until ON profiles(boosted_until)
  WHERE boosted_until IS NOT NULL;

-- Asegurar que profile_photos siempre tenga columna `position`
-- (algunas versiones del schema la llaman order_index)
ALTER TABLE profile_photos ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;
ALTER TABLE profile_photos ADD COLUMN IF NOT EXISTS is_paid  boolean DEFAULT false;
ALTER TABLE profile_photos ADD COLUMN IF NOT EXISTS price    integer DEFAULT 0;
-- Copiar order_index → position si la columna vieja existe
UPDATE profile_photos SET position = order_index WHERE position = 0
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='profile_photos' AND column_name='order_index'
  );

-- RPC para incrementar profile_views atómicamente
CREATE OR REPLACE FUNCTION increment_profile_views(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
     SET profile_views = COALESCE(profile_views, 0) + 1
   WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
