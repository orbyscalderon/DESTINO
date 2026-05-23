-- Migration v19: Profile view charges (monetization 70/30)
-- Run in Supabase SQL Editor

-- Table to track daily view charges (prevents double-charging per day)
CREATE TABLE IF NOT EXISTS profile_view_charges (
  viewer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  charged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  coins_spent INTEGER NOT NULL DEFAULT 5,
  PRIMARY KEY (viewer_id, creator_id, charged_at)
);

ALTER TABLE profile_view_charges ENABLE ROW LEVEL SECURITY;
-- Only the backend (service role) writes; users can read their own charges
CREATE POLICY "view_charges_own" ON profile_view_charges
  FOR SELECT USING (viewer_id = auth.uid() OR creator_id = auth.uid());

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_view_charges_creator ON profile_view_charges(creator_id, charged_at);
