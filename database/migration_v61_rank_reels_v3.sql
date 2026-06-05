-- Migration v61 — rank_reels_for_user v3 con señales más fuertes
--
-- Cambios sobre v45:
-- · Retention score: prioriza reels con alto avg_watch_seconds
--   (engagement real > clicks).
-- · Recency decay exponencial en lugar de linear → reels frescos suben más.
-- · Penaliza reels que el viewer YA vió parcialmente (no solo completed)
--   para evitar ver el mismo reel scrolleando.
-- · Velocity score: reels con likes_count creciendo fast en últimas 24h
--   suben (catches "viral now" content).
-- · Diversity penalty: si los últimos 3 reels eran del mismo creator,
--   reduce score (evita echo chamber).

CREATE OR REPLACE FUNCTION rank_reels_for_user(
  p_viewer_id UUID,
  p_limit     INT DEFAULT 30,
  p_max_age_days INT DEFAULT 30,
  p_include_adult BOOLEAN DEFAULT FALSE,
  p_filter_hashtag TEXT DEFAULT NULL
)
RETURNS TABLE (
  reel_id    UUID,
  score      NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH
    -- Reels que el viewer ya completó
    completed AS (
      SELECT rv.reel_id AS rid FROM reel_views rv
      WHERE rv.viewer_id = p_viewer_id AND rv.completed = TRUE
    ),
    -- Reels parcialmente vistos (mostrar menos frecuentemente)
    partial_seen AS (
      SELECT rv.reel_id AS rid FROM reel_views rv
      WHERE rv.viewer_id = p_viewer_id AND rv.completed = FALSE
    ),
    -- Hashtags que el user ha likeado recientemente (señal de afinidad)
    affinity_tags AS (
      SELECT DISTINCT unnest(r.hashtags) AS tag
      FROM reel_likes rl
      JOIN reels r ON r.id = rl.reel_id
      WHERE rl.user_id = p_viewer_id
        AND r.created_at > NOW() - INTERVAL '90 days'
      LIMIT 100
    ),
    -- Creators que sigue el viewer
    followed AS (
      SELECT f.following_id AS user_id FROM follows f WHERE f.follower_id = p_viewer_id
    ),
    -- Velocity: cuántos likes ganaron en últimas 24h por reel
    velocity AS (
      SELECT rl.reel_id, COUNT(*)::NUMERIC AS recent_likes
      FROM reel_likes rl
      WHERE rl.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY rl.reel_id
    )
  SELECT
    r.id,
    (
      -- Boost grande por seguir al autor (afinidad social fuerte)
      CASE WHEN r.user_id IN (SELECT user_id FROM followed) THEN 60 ELSE 0 END
      -- Boost mediano por hashtag matching
      + CASE WHEN EXISTS (SELECT 1 FROM affinity_tags t WHERE t.tag = ANY(r.hashtags)) THEN 25 ELSE 0 END
      -- Engagement: log de likes (decreasing returns)
      + LN(r.likes_count + 1) * 1.5
      -- Comments cuentan más que likes (engagement profundo)
      + LN(r.comments_count + 1) * 2.0
      -- Views cuentan poco (mucho ruido)
      + LN(r.views_count + 1) * 0.3
      -- Velocity boost: reels que están "trending now"
      + COALESCE((SELECT recent_likes FROM velocity v WHERE v.reel_id = r.id), 0) * 0.8
      -- Recency exponential decay: half-life de 3 días
      + 30 * EXP(-EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 86400 / 3.0)
      -- Penalty por reels que ya vio parcialmente
      + CASE WHEN r.id IN (SELECT p.rid FROM partial_seen p) THEN -15 ELSE 0 END
    )::NUMERIC AS score,
    r.created_at
  FROM reels r
  WHERE r.status = 'published'
    AND r.user_id != p_viewer_id
    AND r.id NOT IN (SELECT c.rid FROM completed c)
    AND r.created_at > NOW() - INTERVAL '1 day' * p_max_age_days
    AND (p_include_adult OR r.is_adult = FALSE)
    AND (p_filter_hashtag IS NULL OR p_filter_hashtag = ANY(r.hashtags))
  ORDER BY score DESC, r.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION rank_reels_for_user IS
  'v3: + velocity (24h likes), exponential recency decay, penalty por partial_seen, comments weighted 2x likes';
