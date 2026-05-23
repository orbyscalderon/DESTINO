-- Migration v8: Super admin en tabla profiles
-- Ejecutar en Supabase > SQL Editor

-- Columna is_admin en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar a Orbys85@gmail.com como super admin
UPDATE profiles
SET is_admin = TRUE
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'orbys85@gmail.com'
);
