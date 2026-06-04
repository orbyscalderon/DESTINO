-- ────────────────────────────────────────────────────────────────────────────
-- Migration v45 — Fix RPC rank_reels_for_user
--
-- Bug: en producción, /api/reels/feed?tab=foryou devolvía 500 con error
-- Postgres 42702 — "column reference 'reel_id' is ambiguous".
-- Causa: el RETURNS TABLE declara `reel_id` como columna de salida y al
-- mismo tiempo el CTE `completed` también la expone (FROM reel_views).
-- Cuando el SELECT principal hace `r.id NOT IN (SELECT reel_id FROM completed)`,
-- PostgreSQL no sabe si `reel_id` es la variable de RETURNS o la columna del CTE.
--
-- Fix: calificar la referencia con el alias del CTE (`completed.reel_id`).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rank_reels_for_user(
  p_viewer_id UUID,
  p_limit     INT DEFAULT 30,
  p_max_age_days INT DEFAULT 14,
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
    completed AS (
      SELECT rv.reel_id AS rid FROM reel_views rv
      WHERE rv.viewer_id = p_viewer_id AND rv.completed = TRUE
    ),
    affinity_tags AS (
      SELECT DISTINCT unnest(r.hashtags) AS tag
      FROM reel_likes rl
      JOIN reels r ON r.id = rl.reel_id
      WHERE rl.user_id = p_viewer_id
        AND r.created_at > NOW() - INTERVAL '90 days'
      LIMIT 100
    ),
    followed AS (
      SELECT f.following_id AS user_id FROM follows f WHERE f.follower_id = p_viewer_id
    )
  SELECT
    r.id,
    (
      CASE WHEN r.user_id IN (SELECT user_id FROM followed) THEN 50 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM affinity_tags t WHERE t.tag = ANY(r.hashtags)) THEN 20 ELSE 0 END
      + LN(r.likes_count + 1) * 1.0
      + LN(r.views_count + 1) * 0.5
      + GREATEST(0, p_max_age_days - EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 86400) * 0.3
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
