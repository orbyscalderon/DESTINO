-- Migration v17: Adult category improvements
-- Run in Supabase SQL Editor

-- 1. Age verification for consumers
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

-- 2. Creator galleries
CREATE TABLE IF NOT EXISTS creator_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_coins INTEGER NOT NULL DEFAULT 50,
  cover_url TEXT,
  items_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_galleries_creator ON creator_galleries(creator_id);

CREATE TABLE IF NOT EXISTS gallery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES creator_galleries(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gallery_items_gallery ON gallery_items(gallery_id, order_index);

CREATE TABLE IF NOT EXISTS gallery_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES creator_galleries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coins_paid INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gallery_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gallery_purchases_user ON gallery_purchases(user_id);

-- 3. Profile tips (coin-based)
CREATE TABLE IF NOT EXISTS profile_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_coins INTEGER NOT NULL CHECK (amount_coins > 0),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_tips_to ON profile_tips(to_user_id, created_at DESC);

-- 4. Content moderation on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('pending_review', 'published', 'rejected'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_notes TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_pending ON posts(status, created_at DESC) WHERE status = 'pending_review';

-- 5. RLS
ALTER TABLE creator_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_tips ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Galleries public read" ON creator_galleries FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Creator manage galleries" ON creator_galleries FOR ALL USING (auth.uid() = creator_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Gallery items public read" ON gallery_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Creator manage items" ON gallery_items FOR ALL USING (
    auth.uid() = (SELECT creator_id FROM creator_galleries WHERE id = gallery_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Gallery purchases own read" ON gallery_purchases FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Gallery purchases insert" ON gallery_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Profile tips read" ON profile_tips
    FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Profile tips insert" ON profile_tips FOR INSERT WITH CHECK (auth.uid() = from_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
