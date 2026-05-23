-- ═══════════════════════════════════════════════════════
-- Destino — Feature Pack (2026-05-21)
-- Ejecutar en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════

-- 1. Regalos animados en shows
CREATE TABLE IF NOT EXISTS show_gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id      uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gift_type    text NOT NULL CHECK (gift_type IN ('rose','heart','diamond','crown')),
  coins_spent  int  NOT NULL,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_show_gifts_show ON show_gifts(show_id);

-- 2. Retiros de creadores
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_usd     numeric(10,2) NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  payout_method  text NOT NULL DEFAULT 'bank' CHECK (payout_method IN ('bank','paypal','crypto')),
  payout_details text,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  processed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_creator ON withdrawal_requests(creator_id);

-- 3. Interés en shows programados
CREATE TABLE IF NOT EXISTS show_interests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  show_id    uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, show_id)
);
CREATE INDEX IF NOT EXISTS idx_show_interests_show ON show_interests(show_id);

-- 4. Follow / fans (gratuito)
CREATE TABLE IF NOT EXISTS user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower  ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);

-- 5. Verificación de identidad
CREATE TABLE IF NOT EXISTS identity_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  selfie_url   text,
  id_url       text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes        text,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at  timestamptz
);

-- 6. Bans de chat en shows
CREATE TABLE IF NOT EXISTS show_bans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id    uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(show_id, user_id)
);

-- 7. Referidos
CREATE TABLE IF NOT EXISTS referral_uses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  rewarded    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 8. Columnas nuevas en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   uuid REFERENCES profiles(id);

-- 9. Columnas nuevas en live_shows
ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS tip_goal      numeric(10,2),
  ADD COLUMN IF NOT EXISTS recording_url text;
