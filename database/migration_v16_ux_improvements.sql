-- Migration v16 — UX Improvements
-- Run in Supabase SQL Editor

-- Incognito mode
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_incognito BOOLEAN NOT NULL DEFAULT false;

-- Message read receipts (per-message timestamp)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(match_id, sender_id) WHERE read_at IS NULL;

-- Message reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL CHECK (char_length(emoji) <= 8),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

-- Voice messages: allow audio mime types in messages (type column already accepts free text)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration_s INTEGER;

-- Match expiry
ALTER TABLE matches ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- Existing matches: 7 days from now
UPDATE matches
SET expires_at = NOW() + INTERVAL '7 days'
WHERE is_match = true
  AND expires_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT match_id FROM messages WHERE match_id IS NOT NULL
  );

-- RLS for message_reactions
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own reactions"
  ON message_reactions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view reactions in their matches"
  ON message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN matches mt ON mt.id = m.match_id
      WHERE m.id = message_reactions.message_id
        AND (mt.user1_id = auth.uid() OR mt.user2_id = auth.uid())
    )
  );
