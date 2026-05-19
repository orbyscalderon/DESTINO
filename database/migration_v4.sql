-- ============================================================
-- MIGRACIÓN v4 — Bonus de likes por anuncios
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Tabla para guardar los likes bonus desbloqueados por anuncios
CREATE TABLE IF NOT EXISTS daily_bonus_likes (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date    DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

-- RLS
ALTER TABLE daily_bonus_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gestiona sus bonus"
  ON daily_bonus_likes FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índice
CREATE INDEX IF NOT EXISTS idx_daily_bonus_user_date ON daily_bonus_likes(user_id, date);

-- También asegura que la función increment_message_count existe
-- (ya debería existir si corriste schema.sql, pero por si acaso)
CREATE OR REPLACE FUNCTION increment_message_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO daily_message_count (user_id, count, date)
  VALUES (p_user_id, 1, CURRENT_DATE)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_message_count.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
