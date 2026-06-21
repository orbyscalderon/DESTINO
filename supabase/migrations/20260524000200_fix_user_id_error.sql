-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Pre-migration fix: columnas faltantes en tablas de producción
-- Seguro re-ejecutar (IF NOT EXISTS en todos los ALTER TABLE)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tablas que necesitan user_id
ALTER TABLE coin_transactions      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE show_tickets           ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE posts                  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE stories                ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE in_app_notifications   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE profile_photos         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE push_subscriptions     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE daily_bonus_likes      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE subscriptions          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE content_appeals        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE identity_verifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE post_likes             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE post_comments          ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE show_bans              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE show_interests         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. show_tips — sender_id y creator_id
ALTER TABLE show_tips ADD COLUMN IF NOT EXISTS sender_id  uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE show_tips ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. show_gifts — sender_id y creator_id
ALTER TABLE show_gifts ADD COLUMN IF NOT EXISTS sender_id  uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE show_gifts ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. content_purchases — seller_id
ALTER TABLE content_purchases ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 5. profile_tips — sender_id y recipient_id
ALTER TABLE profile_tips ADD COLUMN IF NOT EXISTS sender_id    uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE profile_tips ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 6. ppv_unlocks — buyer_id y seller_id
ALTER TABLE ppv_unlocks ADD COLUMN IF NOT EXISTS buyer_id  uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ppv_unlocks ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 7. gallery_purchases — buyer_id
ALTER TABLE gallery_purchases ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- 8. video_sessions — created_at
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_video_sessions_created_at ON video_sessions(created_at DESC);
