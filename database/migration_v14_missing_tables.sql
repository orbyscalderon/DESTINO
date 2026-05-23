-- ============================================================
-- MIGRACIÓN v14: Tablas faltantes — follows, referrals, show engagement,
--               verificación de identidad, solicitudes de retiro
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- ── profiles: columnas faltantes ──────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── live_shows: columna faltante ──────────────────────────────
ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- ============================================================
-- TABLA: user_follows
-- ============================================================
CREATE TABLE IF NOT EXISTS user_follows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_follows_select" ON user_follows FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE POLICY "user_follows_insert" ON user_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "user_follows_delete" ON user_follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower  ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

-- ============================================================
-- TABLA: referral_uses
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_uses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  rewarded    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_uses_select" ON referral_uses FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "referral_uses_insert" ON referral_uses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referred_id);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses(referrer_id);

-- ============================================================
-- TABLA: show_gifts
-- ============================================================
CREATE TABLE IF NOT EXISTS show_gifts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id     UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gift_type   TEXT NOT NULL,
  coins_spent INTEGER NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE show_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "show_gifts_select" ON show_gifts FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = creator_id);

CREATE POLICY "show_gifts_insert" ON show_gifts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE INDEX IF NOT EXISTS idx_show_gifts_show    ON show_gifts(show_id);
CREATE INDEX IF NOT EXISTS idx_show_gifts_creator ON show_gifts(creator_id);

-- ============================================================
-- TABLA: show_interests
-- ============================================================
CREATE TABLE IF NOT EXISTS show_interests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id    UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(show_id, user_id)
);

ALTER TABLE show_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "show_interests_select" ON show_interests FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "show_interests_insert" ON show_interests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "show_interests_delete" ON show_interests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_show_interests_show ON show_interests(show_id);
CREATE INDEX IF NOT EXISTS idx_show_interests_user ON show_interests(user_id);

-- ============================================================
-- TABLA: show_bans
-- ============================================================
CREATE TABLE IF NOT EXISTS show_bans (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id    UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(show_id, user_id)
);

ALTER TABLE show_bans ENABLE ROW LEVEL SECURITY;

-- Backend (service_role) manages bans; frontend only needs to check if user is banned
CREATE POLICY "show_bans_select" ON show_bans FOR SELECT TO authenticated USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_show_bans_show ON show_bans(show_id);
CREATE INDEX IF NOT EXISTS idx_show_bans_user ON show_bans(user_id);

-- ============================================================
-- TABLA: identity_verifications
-- ============================================================
CREATE TABLE IF NOT EXISTS identity_verifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  stripe_session_id TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  notes             TEXT,
  submitted_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at       TIMESTAMP WITH TIME ZONE
);

ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_verif_select" ON identity_verifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "identity_verif_insert" ON identity_verifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "identity_verif_update" ON identity_verifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_identity_verif_user   ON identity_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_verif_status ON identity_verifications(status);

-- ============================================================
-- TABLA: withdrawal_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_usd     NUMERIC(10,2) NOT NULL,
  payout_method  TEXT NOT NULL DEFAULT 'bank'
                 CHECK (payout_method IN ('bank', 'paypal', 'crypto')),
  payout_details TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  notes          TEXT,
  processed_at   TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "withdrawal_select" ON withdrawal_requests FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "withdrawal_insert" ON withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_creator ON withdrawal_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status  ON withdrawal_requests(status);
