-- ────────────────────────────────────────────────────────────────────────────
-- Migration v39 — Reels estilo Instagram
--   - Saved/Bookmark de reels
--   - Audio label (música/sonido original)
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Audio metadata
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE reels
  ADD COLUMN IF NOT EXISTS audio_label TEXT,
  ADD COLUMN IF NOT EXISTS audio_url   TEXT;
-- audio_label: "Audio original · @user" o "Despacito · Luis Fonsi"
-- audio_url: link al audio si es separado (V2 — para "usar este audio")

-- ════════════════════════════════════════════════════════════════════════════
-- 2) reel_saves (bookmarks)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reel_saves (
  reel_id     UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_saves_user
  ON reel_saves (user_id, created_at DESC);

ALTER TABLE reel_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saves own select" ON reel_saves;
DROP POLICY IF EXISTS "saves own insert" ON reel_saves;
DROP POLICY IF EXISTS "saves own delete" ON reel_saves;

CREATE POLICY "saves own select" ON reel_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saves own insert" ON reel_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saves own delete" ON reel_saves FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) RPC: feed "Siguiendo" — solo reels de creators que sigues
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reels_following_feed(
  p_viewer_id UUID,
  p_limit     INT DEFAULT 20,
  p_offset    INT DEFAULT 0,
  p_include_adult BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  reel_id    UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.created_at
  FROM reels r
  WHERE r.status = 'published'
    AND r.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = p_viewer_id
    )
    AND r.user_id != p_viewer_id
    AND r.id NOT IN (
      SELECT rv.reel_id FROM reel_views rv
      WHERE rv.viewer_id = p_viewer_id AND rv.completed = TRUE
    )
    AND (p_include_adult OR r.is_adult = FALSE)
  ORDER BY r.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
