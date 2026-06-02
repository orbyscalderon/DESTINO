-- ────────────────────────────────────────────────────────────────────────────
-- Migration v37 — Reels social: replies + likes a comments
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) reel_comments: parent_comment_id + reply_count
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE reel_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES reel_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_reel_comments_parent
  ON reel_comments (parent_comment_id, created_at ASC)
  WHERE parent_comment_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) reel_comment_likes
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reel_comment_likes (
  comment_id  UUID NOT NULL REFERENCES reel_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_comment_likes_user
  ON reel_comment_likes (user_id, created_at DESC);

ALTER TABLE reel_comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comment likes select"     ON reel_comment_likes;
DROP POLICY IF EXISTS "comment likes insert own" ON reel_comment_likes;
DROP POLICY IF EXISTS "comment likes delete own" ON reel_comment_likes;

CREATE POLICY "comment likes select"
  ON reel_comment_likes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "comment likes insert own"
  ON reel_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment likes delete own"
  ON reel_comment_likes FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) RPCs
-- ════════════════════════════════════════════════════════════════════════════

-- Incrementar/decrementar reply_count del comment padre
CREATE OR REPLACE FUNCTION increment_reel_reply_count(p_comment_id UUID, p_delta INT)
RETURNS INTEGER AS $$
DECLARE new_count INT;
BEGIN
  UPDATE reel_comments
    SET reply_count = GREATEST(0, reply_count + p_delta)
    WHERE id = p_comment_id
    RETURNING reply_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Incrementar/decrementar likes_count de un comment
CREATE OR REPLACE FUNCTION increment_reel_comment_likes(p_comment_id UUID, p_delta INT)
RETURNS INTEGER AS $$
DECLARE new_count INT;
BEGIN
  UPDATE reel_comments
    SET likes_count = GREATEST(0, likes_count + p_delta)
    WHERE id = p_comment_id
    RETURNING likes_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
