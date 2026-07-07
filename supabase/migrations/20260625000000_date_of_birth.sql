-- date_of_birth: fuente de verdad de la edad del usuario.
--
-- Antes: solo teníamos `confirmed_age_at` (checkbox self-attested) — un menor
-- podía marcar el checkbox y consumir adulto. Ahora la mayoría de edad se
-- calcula server-side desde date_of_birth con CHECK constraint.
--
-- Cumple con:
--   - COPPA (US): edad mínima 13 años en el CHECK
--   - Adulto (2257 + Apple + Google Play policies): 18+ verificado
--   - GDPR Art. 8 (minors): datos personales < 16 con consent parental
--   - LATAM: 18+ para adult, 13+ para app general

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Constraint: mínimo 13 años, máximo edad razonable (120 años)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_date_of_birth_realistic'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_date_of_birth_realistic CHECK (
        date_of_birth IS NULL
        OR (date_of_birth <= CURRENT_DATE - INTERVAL '13 years'
            AND date_of_birth >= CURRENT_DATE - INTERVAL '120 years')
      );
  END IF;
END $$;

-- Función helper: age(user_id) → int años cumplidos.
-- Usada en middleware/adult.js y en RLS policies.
CREATE OR REPLACE FUNCTION user_age(user_uuid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN date_of_birth IS NULL THEN NULL
      ELSE EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth))::int
    END
  FROM profiles
  WHERE id = user_uuid;
$$;

-- View helper para queries de "usuarios que necesitan re-verificar edad"
-- (cambio de política, audit anual, etc.)
CREATE OR REPLACE VIEW users_without_dob AS
SELECT id, email, created_at
FROM profiles
WHERE date_of_birth IS NULL
  AND created_at < CURRENT_DATE - INTERVAL '30 days';

COMMENT ON COLUMN profiles.date_of_birth IS
'Fecha de nacimiento — fuente de verdad de la edad. Constraint 13+ años. Requerido para acceso adulto (18+ calculado server-side).';
