-- Migration v22: New features audit
-- Run in Supabase SQL editor

-- 1. Profile: hide online status & account pause
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- 2. Profile: creator custom subscription price
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_price NUMERIC(10,2) DEFAULT 4.99;

-- 3. Posts: hashtags array + views counter
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- 4. Idempotency for Stripe webhook events
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Story views tracking
CREATE TABLE IF NOT EXISTS story_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);

-- 6. Post views tracking
CREATE TABLE IF NOT EXISTS post_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON post_views(post_id);

-- 7. Live show polls
ALTER TABLE live_shows ADD COLUMN IF NOT EXISTS poll_question TEXT;
ALTER TABLE live_shows ADD COLUMN IF NOT EXISTS poll_options JSONB DEFAULT '[]';
ALTER TABLE live_shows ADD COLUMN IF NOT EXISTS poll_active BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS show_poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  show_id UUID REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(show_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_show_poll_votes_show_id ON show_poll_votes(show_id);

-- 8. Update feed query to exclude paused profiles
-- Add RLS helper: paused profiles don't appear in swipe feed
-- (Handled in application layer in profileController.js)

-- 9. posts - index for hashtag search
CREATE INDEX IF NOT EXISTS idx_posts_hashtags ON posts USING GIN (hashtags);

-- 10. creator_subscriptions - add custom price column
ALTER TABLE creator_subscriptions ADD COLUMN IF NOT EXISTS price_at_subscribe NUMERIC(10,2);

-- 11. RPC para incrementar views_count en posts de forma atómica
CREATE OR REPLACE FUNCTION update_post_views(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. hide_online_status: actualizar feed para excluir profiles pausadas
-- (manejado en profileController.js via .or('is_paused.is.null,is_paused.eq.false'))
