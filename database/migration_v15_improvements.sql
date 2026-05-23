-- ============================================================
-- MIGRACIÓN v15: Columnas para mejoras de funcionalidad
--   - profiles.boosted_until     → badge de boost en SwipeCard
--   - profiles.streak_count      → racha persistida en DB
--   - profiles.last_reward_date  → fecha última recompensa diaria
--   - profiles.profile_views     → contador de visitas al perfil
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS boosted_until    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS streak_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reward_date DATE,
  ADD COLUMN IF NOT EXISTS profile_views    INTEGER NOT NULL DEFAULT 0;

-- Índice para consultas de boost activo en el feed
CREATE INDEX IF NOT EXISTS idx_profiles_boosted_until ON profiles(boosted_until)
  WHERE boosted_until IS NOT NULL;

-- RPC: increment_profile_views — suma 1 a profile_views de forma atómica
-- Llamada desde el backend cuando otro usuario visita un perfil
CREATE OR REPLACE FUNCTION increment_profile_views(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles SET profile_views = profile_views + 1
  WHERE id = target_user_id;
END;
$$;

-- RPC: update_streak — actualiza racha y última fecha de recompensa
-- Devuelve el nuevo streak_count
CREATE OR REPLACE FUNCTION update_daily_streak(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_date DATE;
  v_streak    INTEGER;
  v_today     DATE := CURRENT_DATE;
BEGIN
  SELECT last_reward_date, streak_count
    INTO v_last_date, v_streak
    FROM profiles
   WHERE id = p_user_id;

  IF v_last_date IS NULL OR v_last_date < v_today - INTERVAL '1 day' THEN
    -- Racha rota (o primera vez): reinicia
    v_streak := 1;
  ELSIF v_last_date = v_today - INTERVAL '1 day' THEN
    -- Día consecutivo: incrementa
    v_streak := v_streak + 1;
  ELSE
    -- Ya reclamó hoy: no cambia
    RETURN v_streak;
  END IF;

  UPDATE profiles
     SET streak_count     = v_streak,
         last_reward_date = v_today
   WHERE id = p_user_id;

  RETURN v_streak;
END;
$$;
