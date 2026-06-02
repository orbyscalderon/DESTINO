-- ────────────────────────────────────────────────────────────────────────────
-- Migration v35 — Reels (videos verticales tipo TikTok)
--
-- Feed "For You" personalizado. Cada creador/usuario sube videos cortos
-- verticales (max 90s). Los usuarios hacen scroll infinito y descubren
-- creadores nuevos. Mecánica viral #1 de la app.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) TABLA: reels
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_url         TEXT NOT NULL,
  thumbnail_url     TEXT,
  caption           TEXT,
  duration_seconds  NUMERIC(5,2) NOT NULL,
  hashtags          TEXT[] DEFAULT '{}',
  is_adult          BOOLEAN NOT NULL DEFAULT FALSE,
  likes_count       INT NOT NULL DEFAULT 0,
  comments_count    INT NOT NULL DEFAULT 0,
  views_count       INT NOT NULL DEFAULT 0,
  shares_count      INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'published',  -- published | hidden | flagged
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (duration_seconds > 0 AND duration_seconds <= 90),
  CHECK (status IN ('published', 'hidden', 'flagged', 'removed'))
);

-- Index principal para el feed "For You" (cronológico con boost a populares)
CREATE INDEX IF NOT EXISTS idx_reels_feed
  ON reels (created_at DESC, likes_count DESC)
  WHERE status = 'published';

-- Index por usuario para "reels del creator"
CREATE INDEX IF NOT EXISTS idx_reels_user_date
  ON reels (user_id, created_at DESC);

-- Index para filtrar adult vs no-adult rápido
CREATE INDEX IF NOT EXISTS idx_reels_safe
  ON reels (created_at DESC)
  WHERE is_adult = FALSE AND status = 'published';

-- GIN index para búsqueda por hashtag
CREATE INDEX IF NOT EXISTS idx_reels_hashtags
  ON reels USING GIN (hashtags);

-- ════════════════════════════════════════════════════════════════════════════
-- 2) TABLA: reel_views (tracking de visualizaciones)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reel_views (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id          UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  viewer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  watched_seconds  NUMERIC(5,2) DEFAULT 0,
  completed        BOOLEAN DEFAULT FALSE,    -- >= 80% watched
  viewed_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reel_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_views_reel
  ON reel_views (reel_id, completed);

CREATE INDEX IF NOT EXISTS idx_reel_views_viewer
  ON reel_views (viewer_id, viewed_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) TABLA: reel_likes
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reel_likes (
  reel_id     UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_likes_user
  ON reel_likes (user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) RPCs ATÓMICAS (counters)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_reel_likes(p_reel_id UUID, p_delta INT)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE reels
    SET likes_count = GREATEST(0, likes_count + p_delta)
    WHERE id = p_reel_id
    RETURNING likes_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_reel_views(p_reel_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE reels SET views_count = views_count + 1
    WHERE id = p_reel_id RETURNING views_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_reel_comments(p_reel_id UUID, p_delta INT)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE reels
    SET comments_count = GREATEST(0, comments_count + p_delta)
    WHERE id = p_reel_id RETURNING comments_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE reels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_views  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_likes  ENABLE ROW LEVEL SECURITY;

-- reels: lectura pública si status='published', escritura solo del dueño
DROP POLICY IF EXISTS "reels public read" ON reels;
DROP POLICY IF EXISTS "reels own delete"  ON reels;
DROP POLICY IF EXISTS "reels own update"  ON reels;

CREATE POLICY "reels public read"
  ON reels FOR SELECT
  USING (status = 'published' OR auth.uid() = user_id);

CREATE POLICY "reels own delete"
  ON reels FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "reels own update"
  ON reels FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- reel_views: cada usuario solo ve las suyas
DROP POLICY IF EXISTS "reel views own" ON reel_views;
CREATE POLICY "reel views own"
  ON reel_views FOR SELECT
  USING (auth.uid() = viewer_id);

-- reel_likes: usuario ve sus likes + INSERT/DELETE propio
DROP POLICY IF EXISTS "reel likes select"     ON reel_likes;
DROP POLICY IF EXISTS "reel likes insert own" ON reel_likes;
DROP POLICY IF EXISTS "reel likes delete own" ON reel_likes;

CREATE POLICY "reel likes select"
  ON reel_likes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "reel likes insert own"
  ON reel_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reel likes delete own"
  ON reel_likes FOR DELETE
  USING (auth.uid() = user_id);
