-- ────────────────────────────────────────────────────────────────────────────
-- Migration v36 — Reels v2: comments + algoritmo for-you 2.0
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) reel_comments
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reel_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id     UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 500),
  likes_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reel_comments_reel
  ON reel_comments (reel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reel_comments_user
  ON reel_comments (user_id, created_at DESC);

-- RLS
ALTER TABLE reel_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reel comments public read"  ON reel_comments;
DROP POLICY IF EXISTS "reel comments insert auth"  ON reel_comments;
DROP POLICY IF EXISTS "reel comments delete own"   ON reel_comments;

CREATE POLICY "reel comments public read"
  ON reel_comments FOR SELECT USING (true);

CREATE POLICY "reel comments insert auth"
  ON reel_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reel comments delete own"
  ON reel_comments FOR DELETE
  USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2) RPC: score de "afinidad" para algoritmo For-You 2.0
--     Devuelve un score por reel basado en:
--       - +50 si el viewer sigue al creator
--       - +20 si el reel comparte hashtags con reels que el viewer likeó
--       - +log(likes_count + 1) por engagement
--       - +log(views_count + 1) por popularidad
--     El backend ordena DESC y filtra los ya completados.
-- ════════════════════════════════════════════════════════════════════════════
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
    -- Reels que el viewer ya completó (>=80% watched) → excluir
    completed AS (
      SELECT rv.reel_id FROM reel_views rv
      WHERE rv.viewer_id = p_viewer_id AND rv.completed = TRUE
    ),
    -- Hashtags afinidad: los hashtags que el viewer likeó en otros reels
    affinity_tags AS (
      SELECT DISTINCT unnest(r.hashtags) AS tag
      FROM reel_likes rl
      JOIN reels r ON r.id = rl.reel_id
      WHERE rl.user_id = p_viewer_id
        AND r.created_at > NOW() - INTERVAL '90 days'
      LIMIT 100
    ),
    -- Followed creators
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
      -- Boost a recencia: decae linealmente con días
      + GREATEST(0, p_max_age_days - EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 86400) * 0.3
    )::NUMERIC AS score,
    r.created_at
  FROM reels r
  WHERE r.status = 'published'
    AND r.user_id != p_viewer_id
    AND r.id NOT IN (SELECT reel_id FROM completed)
    AND r.created_at > NOW() - INTERVAL '1 day' * p_max_age_days
    AND (p_include_adult OR r.is_adult = FALSE)
    AND (p_filter_hashtag IS NULL OR p_filter_hashtag = ANY(r.hashtags))
  ORDER BY score DESC, r.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
