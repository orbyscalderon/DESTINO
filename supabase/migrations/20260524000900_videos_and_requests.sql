-- ─────────────────────────────────────────────────────────────
-- Profile Videos: creators upload videos fans can buy with coins
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           TEXT,
  description     TEXT,
  url             TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  thumbnail_url   TEXT,
  duration_seconds INT,
  is_paid         BOOLEAN NOT NULL DEFAULT false,
  price           INT NOT NULL DEFAULT 0 CHECK (price >= 0 AND price <= 9999),
  is_adult        BOOLEAN NOT NULL DEFAULT false,
  views_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_videos_user_id_idx ON profile_videos(user_id);
CREATE INDEX IF NOT EXISTS profile_videos_created_at_idx ON profile_videos(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Video Requests: fans commission custom videos from creators
-- status: pending → accepted → completed
--                ↘ rejected
--      pending → cancelled (by buyer)
-- Coins are held in escrow on creation, released on completion or refunded on rejection/cancellation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message        TEXT,
  price          INT NOT NULL CHECK (price >= 1),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','completed','rejected','cancelled','expired')),
  video_url      TEXT,
  storage_path   TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_requests_creator_id_idx    ON video_requests(creator_id);
CREATE INDEX IF NOT EXISTS video_requests_requester_id_idx  ON video_requests(requester_id);
CREATE INDEX IF NOT EXISTS video_requests_status_idx        ON video_requests(status);

-- ─────────────────────────────────────────────────────────────
-- Extend content_purchases to cover posts (already covers profile_video)
-- content_type values: 'profile_photo', 'profile_video', 'post'
-- ─────────────────────────────────────────────────────────────
-- Ensure the table exists (idempotent — skip if already created by earlier migrations)
CREATE TABLE IF NOT EXISTS content_purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_id   UUID NOT NULL,
  content_type TEXT NOT NULL,
  coins_paid   INT NOT NULL CHECK (coins_paid > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, content_id, content_type)
);

CREATE INDEX IF NOT EXISTS content_purchases_buyer_idx   ON content_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS content_purchases_content_idx ON content_purchases(content_id, content_type);

-- ─────────────────────────────────────────────────────────────
-- Extend posts table with paid-post fields
-- ─────────────────────────────────────────────────────────────
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price   INT     NOT NULL DEFAULT 0 CHECK (price >= 0 AND price <= 9999);

-- ─────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE profile_videos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_purchases ENABLE ROW LEVEL SECURITY;

-- profile_videos: anyone authenticated can read; only owner can insert/update/delete
DROP POLICY IF EXISTS "profile_videos_select" ON profile_videos;
CREATE POLICY "profile_videos_select" ON profile_videos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profile_videos_insert" ON profile_videos;
CREATE POLICY "profile_videos_insert" ON profile_videos
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_videos_update" ON profile_videos;
CREATE POLICY "profile_videos_update" ON profile_videos
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_videos_delete" ON profile_videos;
CREATE POLICY "profile_videos_delete" ON profile_videos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- video_requests: requester and creator can see their own rows
DROP POLICY IF EXISTS "video_requests_select" ON video_requests;
CREATE POLICY "video_requests_select" ON video_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR creator_id = auth.uid());

DROP POLICY IF EXISTS "video_requests_insert" ON video_requests;
CREATE POLICY "video_requests_insert" ON video_requests
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "video_requests_update" ON video_requests;
CREATE POLICY "video_requests_update" ON video_requests
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR creator_id = auth.uid());

-- content_purchases: only buyer can read their own; backend inserts via service role
DROP POLICY IF EXISTS "content_purchases_select" ON content_purchases;
CREATE POLICY "content_purchases_select" ON content_purchases
  FOR SELECT TO authenticated USING (buyer_id = auth.uid());
