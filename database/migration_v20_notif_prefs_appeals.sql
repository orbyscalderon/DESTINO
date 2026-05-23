-- v20: notification_prefs en profiles + tabla content_appeals

-- 1. Columna notification_prefs en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
    "matches": true,
    "messages": true,
    "likes": true,
    "shows": true,
    "rewards": true
  }'::jsonb;

-- 2. Tabla de apelaciones de contenido moderado
CREATE TABLE IF NOT EXISTS content_appeals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,          -- 'post', 'photo', 'show', etc.
  content_id  TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  admin_note  TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE content_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_appeals" ON content_appeals
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "admin_all_appeals" ON content_appeals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

CREATE INDEX IF NOT EXISTS idx_appeals_status ON content_appeals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON content_appeals(user_id);
