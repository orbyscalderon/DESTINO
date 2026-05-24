-- ═══════════════════════════════════════════════════════
-- Destino — Tablas y RPCs faltantes (2026-05-21)
-- Ejecutar en el SQL Editor de Supabase
-- Es seguro re-ejecutar: usa IF NOT EXISTS
-- ═══════════════════════════════════════════════════════

-- 1. Sesiones de video aleatorio (videollamadas rápidas)
CREATE TABLE IF NOT EXISTS video_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  channel_name   text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  gender_filter  text NOT NULL DEFAULT 'any',
  country_filter text NOT NULL DEFAULT 'any',
  started_at     timestamptz DEFAULT now(),
  ended_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_video_sessions_status    ON video_sessions(status);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user1     ON video_sessions(user1_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user2     ON video_sessions(user2_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_started   ON video_sessions(started_at);

ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON video_sessions;
CREATE POLICY service_role_all ON video_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Contador de mensajes diarios para usuarios free
CREATE TABLE IF NOT EXISTS daily_message_count (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date    date NOT NULL DEFAULT CURRENT_DATE,
  count   integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_msg_user_date ON daily_message_count(user_id, date);

ALTER TABLE daily_message_count ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON daily_message_count;
CREATE POLICY service_role_all ON daily_message_count FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. RPC: incrementar contador de mensajes diarios (upsert atómico)
DROP FUNCTION IF EXISTS increment_message_count(UUID);
CREATE OR REPLACE FUNCTION increment_message_count(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO daily_message_count (user_id, date, count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_message_count.count + 1;
END;
$$;

-- 4. RPC: actualizar likes de post (delta +1 o -1)
DROP FUNCTION IF EXISTS update_post_likes(UUID, INTEGER);
CREATE OR REPLACE FUNCTION update_post_likes(p_post_id UUID, p_delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE posts SET likes_count = GREATEST(0, COALESCE(likes_count, 0) + p_delta)
  WHERE id = p_post_id;
END;
$$;

-- 5. Columna likes_count en posts si no existe
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;
