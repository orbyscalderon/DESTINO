-- ────────────────────────────────────────────────────────────────────────────
-- Migration v30 — Production polish
-- 1. Email preferences por categoría
-- 2. Support tickets
-- 3. Drafts persistidas (mensajes / posts largos)
-- 4. Rate limit por usuario
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) EMAIL PREFS ──────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_prefs JSONB DEFAULT '{}'::JSONB;
-- Estructura sugerida:
-- { "tip_received":true, "gift_received":true, "new_subscriber":true,
--   "sub_renewed":true, "sub_canceled":true, "payout":true, "show_starting":true,
--   "coin_purchase":true, "boost":true, "identity":true, "appeal":true,
--   "dmca":true, "creator_blast":true, "match":true, "message":true }

-- ─── 2) SUPPORT TICKETS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  subject     TEXT NOT NULL,
  category    TEXT,   -- 'account' | 'payment' | 'creator' | 'safety' | 'bug' | 'other'
  message     TEXT NOT NULL,
  status      TEXT DEFAULT 'open',  -- open | in_progress | resolved | closed
  priority    TEXT DEFAULT 'normal', -- low | normal | high | urgent
  admin_response TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_user   ON support_tickets (user_id, created_at DESC);

-- ─── 3) DRAFTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_key    TEXT NOT NULL,             -- 'post', 'message:<recipient_id>', 'video_request:<creator_id>'
  content      TEXT,
  metadata     JSONB DEFAULT '{}'::JSONB,  -- price, type, attachments, etc.
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, draft_key)
);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON user_drafts (user_id, updated_at DESC);

-- ─── 4) NEWSLETTER LOGS (para creadores que mandan blasts) ───────────────────
CREATE TABLE IF NOT EXISTS creator_blasts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  recipients_count INT DEFAULT 0,
  sent_count     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_blasts_creator ON creator_blasts (creator_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_drafts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_blasts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets own"        ON support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "drafts own"         ON user_drafts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "blasts creator own" ON creator_blasts FOR ALL USING (auth.uid() = creator_id);
