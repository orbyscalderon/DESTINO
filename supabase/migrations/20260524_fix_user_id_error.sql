-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Pre-migration fix: columnas faltantes en tablas de producción
-- Ejecutar ANTES de 20260523_complete_schema.sql
-- Seguro re-ejecutar (todos los bloques verifican antes de actuar)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- DIAGNÓSTICO OPCIONAL — descomentar y ejecutar por separado para ver
-- qué columnas tiene cada tabla en producción:
-- ─────────────────────────────────────────────────────────────────────
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'show_tips','show_gifts','content_purchases','profile_tips',
--     'coin_transactions','show_tickets','posts','stories',
--     'in_app_notifications','profile_photos','push_subscriptions',
--     'daily_bonus_likes','subscriptions','content_appeals',
--     'identity_verifications','daily_message_count',
--     'show_bans','show_interests','post_likes','post_comments',
--     'video_sessions'
--   )
-- ORDER BY table_name, ordinal_position;

-- ─────────────────────────────────────────────────────────────────────
-- HELPER interno
-- ─────────────────────────────────────────────────────────────────────
DO $$

  -- Función inline: ¿existe la columna en la tabla?
  -- (no podemos usar funciones aquí, usaremos EXISTS directamente)

BEGIN

-- ══════════════════════════════════════════════════
-- 1. TABLAS QUE NECESITAN user_id
-- ══════════════════════════════════════════════════

  -- coin_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coin_transactions')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='coin_transactions' AND column_name='user_id') THEN
    ALTER TABLE coin_transactions ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'coin_transactions: user_id agregada';
  END IF;

  -- show_tickets
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='show_tickets')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_tickets' AND column_name='user_id') THEN
    ALTER TABLE show_tickets ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'show_tickets: user_id agregada';
  END IF;

  -- posts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='user_id') THEN
    ALTER TABLE posts ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'posts: user_id agregada';
  END IF;

  -- stories
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stories')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stories' AND column_name='user_id') THEN
    ALTER TABLE stories ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'stories: user_id agregada';
  END IF;

  -- in_app_notifications
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='in_app_notifications')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='in_app_notifications' AND column_name='user_id') THEN
    ALTER TABLE in_app_notifications ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'in_app_notifications: user_id agregada';
  END IF;

  -- profile_photos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profile_photos')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_photos' AND column_name='user_id') THEN
    ALTER TABLE profile_photos ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'profile_photos: user_id agregada';
  END IF;

  -- push_subscriptions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_subscriptions')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='push_subscriptions' AND column_name='user_id') THEN
    ALTER TABLE push_subscriptions ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'push_subscriptions: user_id agregada';
  END IF;

  -- daily_bonus_likes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='daily_bonus_likes')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='daily_bonus_likes' AND column_name='user_id') THEN
    ALTER TABLE daily_bonus_likes ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'daily_bonus_likes: user_id agregada';
  END IF;

  -- subscriptions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='subscriptions')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='user_id') THEN
    ALTER TABLE subscriptions ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'subscriptions: user_id agregada';
  END IF;

  -- content_appeals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_appeals')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='content_appeals' AND column_name='user_id') THEN
    ALTER TABLE content_appeals ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'content_appeals: user_id agregada';
  END IF;

  -- identity_verifications
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='identity_verifications')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='identity_verifications' AND column_name='user_id') THEN
    ALTER TABLE identity_verifications ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'identity_verifications: user_id agregada';
  END IF;

  -- post_likes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_likes')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_likes' AND column_name='user_id') THEN
    ALTER TABLE post_likes ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'post_likes: user_id agregada';
  END IF;

  -- post_comments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_comments')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_comments' AND column_name='user_id') THEN
    ALTER TABLE post_comments ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'post_comments: user_id agregada';
  END IF;

  -- show_bans
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='show_bans')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_bans' AND column_name='user_id') THEN
    ALTER TABLE show_bans ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'show_bans: user_id agregada';
  END IF;

  -- show_interests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='show_interests')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_interests' AND column_name='user_id') THEN
    ALTER TABLE show_interests ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'show_interests: user_id agregada';
  END IF;

-- ══════════════════════════════════════════════════
-- 2. show_tips — espera sender_id y creator_id
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='show_tips') THEN

    -- sender_id: probablemente era user_id en el schema inicial
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_tips' AND column_name='sender_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_tips' AND column_name='user_id') THEN
        ALTER TABLE show_tips RENAME COLUMN user_id TO sender_id;
        RAISE NOTICE 'show_tips: user_id renombrada → sender_id';
      ELSE
        ALTER TABLE show_tips ADD COLUMN sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'show_tips: sender_id agregada';
      END IF;
    END IF;

    -- creator_id: podría llamarse host_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_tips' AND column_name='creator_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_tips' AND column_name='host_id') THEN
        ALTER TABLE show_tips RENAME COLUMN host_id TO creator_id;
        RAISE NOTICE 'show_tips: host_id renombrada → creator_id';
      ELSE
        ALTER TABLE show_tips ADD COLUMN creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'show_tips: creator_id agregada';
      END IF;
    END IF;

  END IF;

-- ══════════════════════════════════════════════════
-- 3. show_gifts — espera sender_id y creator_id
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='show_gifts') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_gifts' AND column_name='sender_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_gifts' AND column_name='user_id') THEN
        ALTER TABLE show_gifts RENAME COLUMN user_id TO sender_id;
        RAISE NOTICE 'show_gifts: user_id renombrada → sender_id';
      ELSE
        ALTER TABLE show_gifts ADD COLUMN sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'show_gifts: sender_id agregada';
      END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_gifts' AND column_name='creator_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='show_gifts' AND column_name='host_id') THEN
        ALTER TABLE show_gifts RENAME COLUMN host_id TO creator_id;
        RAISE NOTICE 'show_gifts: host_id renombrada → creator_id';
      ELSE
        ALTER TABLE show_gifts ADD COLUMN creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'show_gifts: creator_id agregada';
      END IF;
    END IF;

  END IF;

-- ══════════════════════════════════════════════════
-- 4. content_purchases — espera buyer_id y seller_id
--    (la versión nueva de 20260524 no tiene seller_id)
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_purchases') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='content_purchases' AND column_name='seller_id') THEN
      ALTER TABLE content_purchases ADD COLUMN seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
      RAISE NOTICE 'content_purchases: seller_id agregada';
    END IF;

  END IF;

-- ══════════════════════════════════════════════════
-- 5. profile_tips — espera sender_id y recipient_id
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profile_tips') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_tips' AND column_name='sender_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_tips' AND column_name='user_id') THEN
        ALTER TABLE profile_tips RENAME COLUMN user_id TO sender_id;
        RAISE NOTICE 'profile_tips: user_id renombrada → sender_id';
      ELSE
        ALTER TABLE profile_tips ADD COLUMN sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'profile_tips: sender_id agregada';
      END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_tips' AND column_name='recipient_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profile_tips' AND column_name='creator_id') THEN
        ALTER TABLE profile_tips RENAME COLUMN creator_id TO recipient_id;
        RAISE NOTICE 'profile_tips: creator_id renombrada → recipient_id';
      ELSE
        ALTER TABLE profile_tips ADD COLUMN recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
        RAISE NOTICE 'profile_tips: recipient_id agregada';
      END IF;
    END IF;

  END IF;

-- ══════════════════════════════════════════════════
-- 6. ppv_unlocks — espera buyer_id y seller_id
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ppv_unlocks') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ppv_unlocks' AND column_name='buyer_id') THEN
      ALTER TABLE ppv_unlocks ADD COLUMN buyer_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
      RAISE NOTICE 'ppv_unlocks: buyer_id agregada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ppv_unlocks' AND column_name='seller_id') THEN
      ALTER TABLE ppv_unlocks ADD COLUMN seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
      RAISE NOTICE 'ppv_unlocks: seller_id agregada';
    END IF;

  END IF;

-- ══════════════════════════════════════════════════
-- 7. gallery_purchases — espera buyer_id
-- ══════════════════════════════════════════════════

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gallery_purchases')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery_purchases' AND column_name='buyer_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery_purchases' AND column_name='user_id') THEN
      ALTER TABLE gallery_purchases RENAME COLUMN user_id TO buyer_id;
      RAISE NOTICE 'gallery_purchases: user_id renombrada → buyer_id';
    ELSE
      ALTER TABLE gallery_purchases ADD COLUMN buyer_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
      RAISE NOTICE 'gallery_purchases: buyer_id agregada';
    END IF;
  END IF;

  RAISE NOTICE '✓ Pre-migration fix completado. Ahora corre 20260523_complete_schema.sql';

END $$;

-- ─────────────────────────────────────────────────────────────────────
-- video_sessions: agregar created_at (faltaba; el backend la usa en
-- getOnlineCount con .gte('created_at', tenMinAgo))
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE video_sessions
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_video_sessions_created_at ON video_sessions(created_at DESC);
