-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Schema Completo (2026-05-23)
-- Ejecutar en: Supabase → SQL Editor (es seguro re-ejecutar, usa IF NOT EXISTS)
-- Orden: tablas → índices → RLS → políticas → RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONES
-- ─────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────
-- 1. PROFILES (extiende auth.users — una fila por usuario)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        text,
  username         text UNIQUE,
  email            text,
  avatar_url       text,
  bio              text,
  age              integer CHECK (age >= 18),
  gender           text CHECK (gender IN ('male','female','other')),
  country          text,
  language         text,
  interests        text[]        DEFAULT '{}',
  is_premium       boolean       DEFAULT false,
  is_creator       boolean       DEFAULT false,
  is_adult_creator boolean       DEFAULT false,
  is_verified      boolean       DEFAULT false,
  is_incognito     boolean       DEFAULT false,
  is_admin         boolean       DEFAULT false,
  coins_balance    integer       NOT NULL DEFAULT 0 CHECK (coins_balance >= 0),
  boosted_until    timestamptz,
  age_verified_at  timestamptz,
  last_active      timestamptz   DEFAULT now(),
  streak_count     integer       NOT NULL DEFAULT 0,
  last_reward_date date,
  referral_code    text          UNIQUE,
  referred_by      uuid          REFERENCES profiles(id),
  created_at       timestamptz   DEFAULT now()
);
-- Columnas opcionales que se agregan si no existen (safe)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username         text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin         boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_incognito     boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coins_balance    integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boosted_until    timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_verified_at  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active      timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_count     integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_reward_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code    text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by      uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests        text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_adult_creator boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified      boolean DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────
-- 2. MATCHES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user1_liked     boolean       DEFAULT false,
  user2_liked     boolean       DEFAULT false,
  is_match        boolean       DEFAULT false,
  is_super_like   boolean       DEFAULT false,
  expires_at      timestamptz,
  created_at      timestamptz   DEFAULT now(),
  CONSTRAINT matches_pair_unique UNIQUE (user1_id, user2_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 3. MESSAGES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content             text          NOT NULL DEFAULT '',
  type                text          NOT NULL DEFAULT 'text' CHECK (type IN ('text','gif','voice')),
  image_url           text,
  audio_url           text,
  audio_duration_s    integer,
  is_read             boolean       DEFAULT false,
  read_at             timestamptz,
  is_ppv              boolean       DEFAULT false,
  ppv_price           integer,
  ppv_media_url       text,
  deleted_for_all     boolean       DEFAULT false,
  deleted_for_sender  boolean       DEFAULT false,
  created_at          timestamptz   DEFAULT now()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration_s  integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ppv             boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ppv_price          integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ppv_media_url      text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_all    boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_sender boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at            timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- 4. MESSAGE REACTIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 5. PINNED MESSAGES (una por match)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pinned_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 6. PUSH SUBSCRIPTIONS (Web Push)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- ─────────────────────────────────────────────────────────────────────
-- 7. BLOCKED USERS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 8. COIN TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_transactions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount                   integer NOT NULL,
  type                     text    NOT NULL CHECK (type IN (
                             'purchase','bonus','ppv_spent','ppv_received',
                             'tip_sent','tip_received','gift_sent','gift_received',
                             'show_ticket','subscription_received','withdrawal'
                           )),
  reference_id             text,
  stripe_payment_intent_id text,
  created_at               timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 9. DAILY BONUS LIKES (likes extra ganados viendo anuncios)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_bonus_likes (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date     date NOT NULL DEFAULT CURRENT_DATE,
  bonus    integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

-- ─────────────────────────────────────────────────────────────────────
-- 10. PPV UNLOCKS (desbloqueo de mensajes PPV en chat)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ppv_unlocks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  buyer_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coins_spent      integer       NOT NULL,
  amount_usd       numeric(10,2) NOT NULL,
  creator_earnings numeric(10,2) NOT NULL,
  platform_fee     numeric(10,2) NOT NULL,
  created_at       timestamptz   DEFAULT now(),
  UNIQUE (message_id, buyer_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 11. LIVE SHOWS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_shows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  show_type     text NOT NULL DEFAULT 'broadcast' CHECK (show_type IN ('broadcast','private')),
  category      text NOT NULL DEFAULT 'chat' CHECK (category IN (
                  'music','dance','comedy','chat','gaming','fitness','cooking','art','adult'
                )),
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  cover_url     text,
  ticket_price  integer       NOT NULL DEFAULT 0,
  tip_goal      numeric(10,2),
  recording_url text,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz   DEFAULT now()
);
ALTER TABLE live_shows ADD COLUMN IF NOT EXISTS tip_goal      numeric(10,2);
ALTER TABLE live_shows ADD COLUMN IF NOT EXISTS recording_url text;

-- ─────────────────────────────────────────────────────────────────────
-- 12. SHOW TICKETS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id     uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (show_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 13. SHOW TIPS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_tips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id       uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_coins  integer NOT NULL,
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 14. CREATOR EARNINGS (balance acumulado por creador)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_earnings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  total_usd   numeric(10,2) NOT NULL DEFAULT 0,
  pending_usd numeric(10,2) NOT NULL DEFAULT 0,
  paid_usd    numeric(10,2) NOT NULL DEFAULT 0,
  updated_at  timestamptz   DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 15. CREATOR SUBSCRIPTIONS (suscripciones mensuales a creadores)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  price_usd              numeric(10,2),
  stripe_subscription_id text,
  created_at             timestamptz DEFAULT now(),
  expires_at             timestamptz,
  UNIQUE (subscriber_id, creator_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 16. CREATOR GALLERIES + ITEMS + PURCHASES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_galleries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  price       integer NOT NULL DEFAULT 0,
  is_adult    boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  uuid NOT NULL REFERENCES creator_galleries(id) ON DELETE CASCADE,
  url         text NOT NULL,
  type        text NOT NULL DEFAULT 'photo' CHECK (type IN ('photo','video')),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_purchases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id   uuid NOT NULL REFERENCES creator_galleries(id) ON DELETE CASCADE,
  buyer_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_coins integer NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (gallery_id, buyer_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 17. PROFILE PHOTOS (galería privada con fotos de pago)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  price       integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 18. CONTENT PURCHASES (compra de fotos de perfil)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_purchases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_id    uuid NOT NULL REFERENCES profile_photos(id) ON DELETE CASCADE,
  coins_spent integer NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (photo_id, buyer_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 19. PROFILE TIPS (propinas directas a perfil)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_tips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_coins  integer NOT NULL,
  created_at    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 20. POSTS (momentos / feed social)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caption             text,
  media_url           text,
  media_type          text NOT NULL DEFAULT 'text' CHECK (media_type IN ('text','photo','video')),
  is_adult            boolean NOT NULL DEFAULT false,
  is_subscribers_only boolean NOT NULL DEFAULT false,
  likes_count         integer NOT NULL DEFAULT 0,
  comments_count      integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending_review','rejected')),
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count    integer DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 21. POST LIKES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 22. POST COMMENTS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 23. STORIES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url   text NOT NULL,
  media_type  text NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 24. STORY VIEWS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 25. IN-APP NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  data        jsonb         DEFAULT '{}',
  is_read     boolean       DEFAULT false,
  created_at  timestamptz   DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 26. REPORTS (denuncias)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  details      text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 27. CONTENT APPEALS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_appeals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post','photo','story','profile')),
  content_id   uuid,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 28. SUBSCRIPTIONS (Premium Stripe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id     text,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','past_due','trialing')),
  created_at             timestamptz DEFAULT now(),
  expires_at             timestamptz
);

-- ─────────────────────────────────────────────────────────────────────
-- 29. DAILY MESSAGE COUNT (ya en 20260521_missing_tables.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_message_count (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date     date NOT NULL DEFAULT CURRENT_DATE,
  count    integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

-- ─────────────────────────────────────────────────────────────────────
-- 30. VIDEO SESSIONS (ya en 20260521_missing_tables.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  channel_name    text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  gender_filter   text NOT NULL DEFAULT 'any',
  country_filter  text NOT NULL DEFAULT 'any',
  started_at      timestamptz DEFAULT now(),
  ended_at        timestamptz
);

-- ─────────────────────────────────────────────────────────────────────
-- 31. SHOW GIFTS (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id      uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gift_type    text NOT NULL CHECK (gift_type IN ('rose','heart','diamond','crown')),
  coins_spent  integer NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 32. SHOW BANS (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_bans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id     uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (show_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 33. SHOW INTERESTS (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_interests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  show_id     uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, show_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 34. USER FOLLOWS (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_follows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 35. WITHDRAWAL REQUESTS (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 36. REFERRAL USES (ya en 20260521_features.sql — safe)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_uses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  rewarded     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 37. IDENTITY VERIFICATIONS (ya en features.sql + stripe_identity.sql)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  selfie_url        text,
  id_url            text,
  stripe_session_id text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes             text,
  submitted_at      timestamptz DEFAULT now(),
  reviewed_at       timestamptz
);
ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS stripe_session_id text;


-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICES DE RENDIMIENTO
-- ═══════════════════════════════════════════════════════════════════════

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_last_active    ON profiles(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_premium     ON profiles(is_premium);
CREATE INDEX IF NOT EXISTS idx_profiles_is_creator     ON profiles(is_creator);
CREATE INDEX IF NOT EXISTS idx_profiles_country        ON profiles(country);
CREATE INDEX IF NOT EXISTS idx_profiles_gender         ON profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code  ON profiles(referral_code);

-- matches
CREATE INDEX IF NOT EXISTS idx_matches_user1           ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2           ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_is_match        ON matches(is_match);
CREATE INDEX IF NOT EXISTS idx_matches_expires_at      ON matches(expires_at) WHERE expires_at IS NOT NULL;

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_match_id       ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id      ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at     ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread         ON messages(match_id, sender_id, is_read) WHERE is_read = false;

-- message_reactions
CREATE INDEX IF NOT EXISTS idx_msg_reactions_msg       ON message_reactions(message_id);

-- coin_transactions
CREATE INDEX IF NOT EXISTS idx_coin_txns_user          ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_txns_created       ON coin_transactions(created_at DESC);

-- live_shows
CREATE INDEX IF NOT EXISTS idx_shows_host_id           ON live_shows(host_id);
CREATE INDEX IF NOT EXISTS idx_shows_status            ON live_shows(status);
CREATE INDEX IF NOT EXISTS idx_shows_category          ON live_shows(category);

-- show_tickets
CREATE INDEX IF NOT EXISTS idx_tickets_show_id         ON show_tickets(show_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id         ON show_tickets(user_id);

-- posts
CREATE INDEX IF NOT EXISTS idx_posts_user_id           ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status            ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at        ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_adult          ON posts(is_adult);

-- stories
CREATE INDEX IF NOT EXISTS idx_stories_user_id         ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at      ON stories(expires_at);

-- in_app_notifications
CREATE INDEX IF NOT EXISTS idx_notifs_user_id          ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifs_unread           ON in_app_notifications(user_id, is_read) WHERE is_read = false;

-- user_follows
CREATE INDEX IF NOT EXISTS idx_follows_follower        ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following       ON user_follows(following_id);

-- profile_photos
CREATE INDEX IF NOT EXISTS idx_photos_user_id          ON profile_photos(user_id);

-- blocked_users
CREATE INDEX IF NOT EXISTS idx_blocks_blocker          ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked          ON blocked_users(blocked_id);


-- ═══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — habilitar en todas las tablas
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_bonus_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppv_unlocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_shows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_tips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_gifts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_bans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_interests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_earnings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_galleries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_tips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views          ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_appeals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_message_count  ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_uses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- Convención: el backend usa service_role (bypassa RLS).
-- Las políticas protegen acceso directo desde el frontend (anon/authenticated).
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: recrear política si ya existe
DO $$ BEGIN

  -- ── profiles ──────────────────────────────────────────────────────
  -- Todos los usuarios autenticados pueden leer perfiles (para el feed)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select_all') THEN
    EXECUTE 'CREATE POLICY profiles_select_all ON profiles FOR SELECT TO authenticated USING (true)';
  END IF;
  -- Solo el propio usuario puede actualizar su perfil
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_update_own') THEN
    EXECUTE 'CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id)';
  END IF;
  -- El usuario puede insertar su propio perfil (creado en el trigger de Auth)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_insert_own') THEN
    EXECUTE 'CREATE POLICY profiles_insert_own ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id)';
  END IF;
  -- service_role tiene acceso total
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_service_role') THEN
    EXECUTE 'CREATE POLICY profiles_service_role ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── matches ───────────────────────────────────────────────────────
  -- Solo los participantes del match pueden verlo
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='matches_select_participants') THEN
    EXECUTE 'CREATE POLICY matches_select_participants ON matches FOR SELECT TO authenticated
             USING (auth.uid() = user1_id OR auth.uid() = user2_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='matches_service_role') THEN
    EXECUTE 'CREATE POLICY matches_service_role ON matches FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── messages ──────────────────────────────────────────────────────
  -- Los participantes del match pueden leer mensajes (necesario para Realtime)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='messages_select_participants') THEN
    EXECUTE 'CREATE POLICY messages_select_participants ON messages FOR SELECT TO authenticated
             USING (
               EXISTS (
                 SELECT 1 FROM matches
                 WHERE matches.id = messages.match_id
                   AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
               )
             )';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='messages_service_role') THEN
    EXECUTE 'CREATE POLICY messages_service_role ON messages FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── message_reactions ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_reactions' AND policyname='reactions_select_participants') THEN
    EXECUTE 'CREATE POLICY reactions_select_participants ON message_reactions FOR SELECT TO authenticated
             USING (
               EXISTS (
                 SELECT 1 FROM messages m
                 JOIN matches mt ON mt.id = m.match_id
                 WHERE m.id = message_reactions.message_id
                   AND (mt.user1_id = auth.uid() OR mt.user2_id = auth.uid())
               )
             )';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_reactions' AND policyname='reactions_service_role') THEN
    EXECUTE 'CREATE POLICY reactions_service_role ON message_reactions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── pinned_messages ───────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pinned_messages' AND policyname='pinned_select_participants') THEN
    EXECUTE 'CREATE POLICY pinned_select_participants ON pinned_messages FOR SELECT TO authenticated
             USING (
               EXISTS (
                 SELECT 1 FROM matches
                 WHERE matches.id = pinned_messages.match_id
                   AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
               )
             )';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pinned_messages' AND policyname='pinned_service_role') THEN
    EXECUTE 'CREATE POLICY pinned_service_role ON pinned_messages FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── push_subscriptions ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_subs_own') THEN
    EXECUTE 'CREATE POLICY push_subs_own ON push_subscriptions FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_subs_service_role') THEN
    EXECUTE 'CREATE POLICY push_subs_service_role ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── blocked_users ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blocked_users' AND policyname='blocks_own') THEN
    EXECUTE 'CREATE POLICY blocks_own ON blocked_users FOR ALL TO authenticated
             USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blocked_users' AND policyname='blocks_service_role') THEN
    EXECUTE 'CREATE POLICY blocks_service_role ON blocked_users FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── coin_transactions ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coin_transactions' AND policyname='coins_select_own') THEN
    EXECUTE 'CREATE POLICY coins_select_own ON coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coin_transactions' AND policyname='coins_service_role') THEN
    EXECUTE 'CREATE POLICY coins_service_role ON coin_transactions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── daily_bonus_likes ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_bonus_likes' AND policyname='bonus_likes_own') THEN
    EXECUTE 'CREATE POLICY bonus_likes_own ON daily_bonus_likes FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_bonus_likes' AND policyname='bonus_likes_service_role') THEN
    EXECUTE 'CREATE POLICY bonus_likes_service_role ON daily_bonus_likes FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── ppv_unlocks ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ppv_unlocks' AND policyname='ppv_own') THEN
    EXECUTE 'CREATE POLICY ppv_own ON ppv_unlocks FOR SELECT TO authenticated
             USING (auth.uid() = buyer_id OR auth.uid() = seller_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ppv_unlocks' AND policyname='ppv_service_role') THEN
    EXECUTE 'CREATE POLICY ppv_service_role ON ppv_unlocks FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── live_shows ────────────────────────────────────────────────────
  -- Todos pueden ver shows (el backend filtra adulto)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='live_shows' AND policyname='shows_select_all') THEN
    EXECUTE 'CREATE POLICY shows_select_all ON live_shows FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='live_shows' AND policyname='shows_manage_own') THEN
    EXECUTE 'CREATE POLICY shows_manage_own ON live_shows FOR ALL TO authenticated
             USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='live_shows' AND policyname='shows_service_role') THEN
    EXECUTE 'CREATE POLICY shows_service_role ON live_shows FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── show_tickets ──────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_tickets' AND policyname='tickets_own') THEN
    EXECUTE 'CREATE POLICY tickets_own ON show_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_tickets' AND policyname='tickets_service_role') THEN
    EXECUTE 'CREATE POLICY tickets_service_role ON show_tickets FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── show_tips / show_gifts ────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_tips' AND policyname='show_tips_own') THEN
    EXECUTE 'CREATE POLICY show_tips_own ON show_tips FOR SELECT TO authenticated
             USING (auth.uid() = sender_id OR auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_tips' AND policyname='show_tips_service_role') THEN
    EXECUTE 'CREATE POLICY show_tips_service_role ON show_tips FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_gifts' AND policyname='show_gifts_own') THEN
    EXECUTE 'CREATE POLICY show_gifts_own ON show_gifts FOR SELECT TO authenticated
             USING (auth.uid() = sender_id OR auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_gifts' AND policyname='show_gifts_service_role') THEN
    EXECUTE 'CREATE POLICY show_gifts_service_role ON show_gifts FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── show_bans ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_bans' AND policyname='show_bans_select') THEN
    EXECUTE 'CREATE POLICY show_bans_select ON show_bans FOR SELECT TO authenticated
             USING (auth.uid() = user_id OR EXISTS(SELECT 1 FROM live_shows WHERE id = show_id AND host_id = auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_bans' AND policyname='show_bans_service_role') THEN
    EXECUTE 'CREATE POLICY show_bans_service_role ON show_bans FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── show_interests ────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_interests' AND policyname='show_interests_own') THEN
    EXECUTE 'CREATE POLICY show_interests_own ON show_interests FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='show_interests' AND policyname='show_interests_service_role') THEN
    EXECUTE 'CREATE POLICY show_interests_service_role ON show_interests FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── creator_earnings ──────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_earnings' AND policyname='earnings_own') THEN
    EXECUTE 'CREATE POLICY earnings_own ON creator_earnings FOR SELECT TO authenticated USING (auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_earnings' AND policyname='earnings_service_role') THEN
    EXECUTE 'CREATE POLICY earnings_service_role ON creator_earnings FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── creator_subscriptions ─────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_subscriptions' AND policyname='creator_subs_own') THEN
    EXECUTE 'CREATE POLICY creator_subs_own ON creator_subscriptions FOR SELECT TO authenticated
             USING (auth.uid() = subscriber_id OR auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_subscriptions' AND policyname='creator_subs_service_role') THEN
    EXECUTE 'CREATE POLICY creator_subs_service_role ON creator_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── creator_galleries / gallery_items ─────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_galleries' AND policyname='galleries_select_all') THEN
    EXECUTE 'CREATE POLICY galleries_select_all ON creator_galleries FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_galleries' AND policyname='galleries_manage_own') THEN
    EXECUTE 'CREATE POLICY galleries_manage_own ON creator_galleries FOR ALL TO authenticated
             USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='creator_galleries' AND policyname='galleries_service_role') THEN
    EXECUTE 'CREATE POLICY galleries_service_role ON creator_galleries FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_items' AND policyname='gallery_items_select') THEN
    EXECUTE 'CREATE POLICY gallery_items_select ON gallery_items FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_items' AND policyname='gallery_items_service_role') THEN
    EXECUTE 'CREATE POLICY gallery_items_service_role ON gallery_items FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_purchases' AND policyname='gallery_purchases_own') THEN
    EXECUTE 'CREATE POLICY gallery_purchases_own ON gallery_purchases FOR SELECT TO authenticated USING (auth.uid() = buyer_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gallery_purchases' AND policyname='gallery_purchases_service_role') THEN
    EXECUTE 'CREATE POLICY gallery_purchases_service_role ON gallery_purchases FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── profile_photos ────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_photos' AND policyname='photos_select_all') THEN
    EXECUTE 'CREATE POLICY photos_select_all ON profile_photos FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_photos' AND policyname='photos_manage_own') THEN
    EXECUTE 'CREATE POLICY photos_manage_own ON profile_photos FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_photos' AND policyname='photos_service_role') THEN
    EXECUTE 'CREATE POLICY photos_service_role ON profile_photos FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── content_purchases ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_purchases' AND policyname='purchases_own') THEN
    EXECUTE 'CREATE POLICY purchases_own ON content_purchases FOR SELECT TO authenticated
             USING (auth.uid() = buyer_id OR auth.uid() = seller_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_purchases' AND policyname='purchases_service_role') THEN
    EXECUTE 'CREATE POLICY purchases_service_role ON content_purchases FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── profile_tips ──────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_tips' AND policyname='tips_own') THEN
    EXECUTE 'CREATE POLICY tips_own ON profile_tips FOR SELECT TO authenticated
             USING (auth.uid() = sender_id OR auth.uid() = recipient_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_tips' AND policyname='tips_service_role') THEN
    EXECUTE 'CREATE POLICY tips_service_role ON profile_tips FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── posts ─────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_select_published') THEN
    EXECUTE 'CREATE POLICY posts_select_published ON posts FOR SELECT TO authenticated
             USING (status = ''published'' OR user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_manage_own') THEN
    EXECUTE 'CREATE POLICY posts_manage_own ON posts FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_service_role') THEN
    EXECUTE 'CREATE POLICY posts_service_role ON posts FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── post_likes ────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_likes' AND policyname='post_likes_select') THEN
    EXECUTE 'CREATE POLICY post_likes_select ON post_likes FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_likes' AND policyname='post_likes_manage_own') THEN
    EXECUTE 'CREATE POLICY post_likes_manage_own ON post_likes FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_likes' AND policyname='post_likes_service_role') THEN
    EXECUTE 'CREATE POLICY post_likes_service_role ON post_likes FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── post_comments ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_comments' AND policyname='comments_select') THEN
    EXECUTE 'CREATE POLICY comments_select ON post_comments FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_comments' AND policyname='comments_manage_own') THEN
    EXECUTE 'CREATE POLICY comments_manage_own ON post_comments FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_comments' AND policyname='comments_service_role') THEN
    EXECUTE 'CREATE POLICY comments_service_role ON post_comments FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── stories ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_select_active') THEN
    EXECUTE 'CREATE POLICY stories_select_active ON stories FOR SELECT TO authenticated
             USING (expires_at > now() OR user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_manage_own') THEN
    EXECUTE 'CREATE POLICY stories_manage_own ON stories FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_service_role') THEN
    EXECUTE 'CREATE POLICY stories_service_role ON stories FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── story_views ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_views' AND policyname='story_views_own') THEN
    EXECUTE 'CREATE POLICY story_views_own ON story_views FOR ALL TO authenticated
             USING (auth.uid() = viewer_id) WITH CHECK (auth.uid() = viewer_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_views' AND policyname='story_views_service_role') THEN
    EXECUTE 'CREATE POLICY story_views_service_role ON story_views FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── in_app_notifications (necesario para Realtime) ────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='in_app_notifications' AND policyname='notifs_own') THEN
    EXECUTE 'CREATE POLICY notifs_own ON in_app_notifications FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='in_app_notifications' AND policyname='notifs_service_role') THEN
    EXECUTE 'CREATE POLICY notifs_service_role ON in_app_notifications FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── reports ───────────────────────────────────────────────────────
  -- Solo service_role puede leer reportes; usuarios solo pueden crear
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reports' AND policyname='reports_insert_own') THEN
    EXECUTE 'CREATE POLICY reports_insert_own ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reports' AND policyname='reports_service_role') THEN
    EXECUTE 'CREATE POLICY reports_service_role ON reports FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── content_appeals ───────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_appeals' AND policyname='appeals_own') THEN
    EXECUTE 'CREATE POLICY appeals_own ON content_appeals FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_appeals' AND policyname='appeals_service_role') THEN
    EXECUTE 'CREATE POLICY appeals_service_role ON content_appeals FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── subscriptions ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subs_own') THEN
    EXECUTE 'CREATE POLICY subs_own ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subs_service_role') THEN
    EXECUTE 'CREATE POLICY subs_service_role ON subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── daily_message_count ───────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_message_count' AND policyname='msg_count_own') THEN
    EXECUTE 'CREATE POLICY msg_count_own ON daily_message_count FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_message_count' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON daily_message_count FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── video_sessions ────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_sessions' AND policyname='video_sessions_participants') THEN
    EXECUTE 'CREATE POLICY video_sessions_participants ON video_sessions FOR SELECT TO authenticated
             USING (auth.uid() = user1_id OR auth.uid() = user2_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_sessions' AND policyname='service_role_all') THEN
    EXECUTE 'CREATE POLICY service_role_all ON video_sessions FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── user_follows ──────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_follows' AND policyname='follows_select_all') THEN
    EXECUTE 'CREATE POLICY follows_select_all ON user_follows FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_follows' AND policyname='follows_manage_own') THEN
    EXECUTE 'CREATE POLICY follows_manage_own ON user_follows FOR ALL TO authenticated
             USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_follows' AND policyname='follows_service_role') THEN
    EXECUTE 'CREATE POLICY follows_service_role ON user_follows FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── withdrawal_requests ───────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='withdrawal_requests' AND policyname='withdrawals_own') THEN
    EXECUTE 'CREATE POLICY withdrawals_own ON withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = creator_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='withdrawal_requests' AND policyname='withdrawals_service_role') THEN
    EXECUTE 'CREATE POLICY withdrawals_service_role ON withdrawal_requests FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── referral_uses ─────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referral_uses' AND policyname='referrals_own') THEN
    EXECUTE 'CREATE POLICY referrals_own ON referral_uses FOR SELECT TO authenticated
             USING (auth.uid() = referrer_id OR auth.uid() = referred_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referral_uses' AND policyname='referrals_service_role') THEN
    EXECUTE 'CREATE POLICY referrals_service_role ON referral_uses FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- ── identity_verifications ────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='identity_verifications' AND policyname='id_verif_own') THEN
    EXECUTE 'CREATE POLICY id_verif_own ON identity_verifications FOR ALL TO authenticated
             USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='identity_verifications' AND policyname='id_verif_service_role') THEN
    EXECUTE 'CREATE POLICY id_verif_service_role ON identity_verifications FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- FUNCIONES / RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- 1. increment_coins: añade coins a un usuario (atómico)
CREATE OR REPLACE FUNCTION increment_coins(p_user_id UUID, p_amount INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET coins_balance = COALESCE(coins_balance, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

-- 2. spend_coins: descuenta coins si hay saldo suficiente (atómico, sin race condition)
--    Devuelve TRUE si tuvo éxito, FALSE si saldo insuficiente
CREATE OR REPLACE FUNCTION spend_coins(p_user_id UUID, p_amount INTEGER)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE profiles
  SET coins_balance = coins_balance - p_amount
  WHERE id = p_user_id AND coins_balance >= p_amount;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 3. increment_message_count: upsert contador diario de mensajes
CREATE OR REPLACE FUNCTION increment_message_count(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO daily_message_count (user_id, date, count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_message_count.count + 1;
END;
$$;

-- 4. update_post_likes: incrementa/decrementa likes_count de un post
CREATE OR REPLACE FUNCTION update_post_likes(p_post_id UUID, p_delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE posts SET likes_count = GREATEST(0, COALESCE(likes_count, 0) + p_delta)
  WHERE id = p_post_id;
END;
$$;

-- 5. update_post_comments: incrementa/decrementa comments_count de un post
CREATE OR REPLACE FUNCTION update_post_comments(p_post_id UUID, p_delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE posts SET comments_count = GREATEST(0, COALESCE(comments_count, 0) + p_delta)
  WHERE id = p_post_id;
END;
$$;

-- 6. update_daily_streak: actualiza la racha de login diario
--    Reglas: si ya reclamó hoy → no hace nada; si fue ayer → +1; sino → reset a 1
--    Devuelve el nuevo streak
CREATE OR REPLACE FUNCTION update_daily_streak(p_user_id UUID)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last_date  date;
  v_streak     integer;
  v_today      date := CURRENT_DATE;
  v_new_streak integer;
BEGIN
  SELECT last_reward_date, streak_count INTO v_last_date, v_streak
  FROM profiles WHERE id = p_user_id;

  -- Ya reclamó hoy — no hacer nada
  IF v_last_date = v_today THEN
    RETURN v_streak;
  END IF;

  -- Fue ayer → continuar racha
  IF v_last_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  UPDATE profiles
  SET streak_count = v_new_streak, last_reward_date = v_today
  WHERE id = p_user_id;

  RETURN v_new_streak;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGER: crear perfil automáticamente al registrarse un usuario
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME: habilitar publicaciones para tablas usadas por el frontend
-- ═══════════════════════════════════════════════════════════════════════

-- Ejecutar en el SQL editor de Supabase para habilitar Realtime en estas tablas.
-- Supabase Realtime requiere que la tabla esté en la publicación 'supabase_realtime'.

DO $$
BEGIN
  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  -- in_app_notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'in_app_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;
  END IF;

  -- matches (para actualizar lista cuando llega un match)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
END $$;
