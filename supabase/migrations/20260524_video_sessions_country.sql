-- Agrega user1_country a video_sessions para matching bidireccional por país
-- Cuando un guest filtra por país X, encuentra:
--   1. Hosts que pusieron country_filter = X
--   2. Hosts que son DE país X con country_filter = 'any'

ALTER TABLE video_sessions
  ADD COLUMN IF NOT EXISTS user1_country text;

CREATE INDEX IF NOT EXISTS idx_video_sessions_user1_country
  ON video_sessions(user1_country)
  WHERE status = 'waiting';
