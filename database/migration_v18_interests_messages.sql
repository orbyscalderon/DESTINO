-- Migration v18: interests on profiles, message delete/pin, gallery item delete

-- Interests on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';

-- Message soft-delete
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_for_sender BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_for_all    BOOLEAN NOT NULL DEFAULT false;

-- Pinned messages per match
CREATE TABLE IF NOT EXISTS pinned_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id)
);

ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pinned_messages_match_participants" ON pinned_messages
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM matches m
        WHERE m.id = match_id
          AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Gallery item delete support (items_count decrement handled by trigger or controller)
-- No schema change needed; deleteGalleryItem uses UPDATE items_count.

-- Interest tags index for filtering
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON profiles USING gin(interests);
