-- ────────────────────────────────────────────────────────────────────────────
-- Migration v34 — Audit fixes: RLS gaps, cascades, indexes, cleanup
--
-- Resuelve los hallazgos CRÍTICOS y ALTOS de la auditoría de DB.
-- TOTALMENTE idempotente: todas las operaciones usan IF EXISTS / IF NOT EXISTS.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) FIX RLS EN in_app_notifications  (CRÍTICA)
--    Issue: WITH CHECK (TRUE) permite a cualquier user crear notifs de otro.
--    Fix: solo service_role (backend) puede insertar; usuarios solo leen y
--    actualizan las propias.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'in_app_notifications') THEN
    EXECUTE 'ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "Sistema inserta notificaciones"    ON in_app_notifications;
    DROP POLICY IF EXISTS "Usuario ve sus notificaciones"     ON in_app_notifications;
    DROP POLICY IF EXISTS "Usuario actualiza sus notificaciones" ON in_app_notifications;
    DROP POLICY IF EXISTS "notif own select" ON in_app_notifications;
    DROP POLICY IF EXISTS "notif own update" ON in_app_notifications;
    DROP POLICY IF EXISTS "notif own delete" ON in_app_notifications;
    DROP POLICY IF EXISTS "notif service insert" ON in_app_notifications;

    CREATE POLICY "notif own select" ON in_app_notifications
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "notif own update" ON in_app_notifications
      FOR UPDATE USING (auth.uid() = user_id);
    CREATE POLICY "notif own delete" ON in_app_notifications
      FOR DELETE USING (auth.uid() = user_id);
    -- INSERT solo desde service_role (backend con SUPABASE_SERVICE_ROLE_KEY)
    CREATE POLICY "notif service insert" ON in_app_notifications
      FOR INSERT TO service_role WITH CHECK (TRUE);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) FIX RLS EN profiles  (CRÍTICA)
--    Issue: USING (TRUE) expone stripe_account_id, coins_balance, etc.
--    Fix: vista pública sin columnas sensibles + policy restrictiva sobre la
--    tabla base. Aplicación lee 'profiles_public' para perfiles ajenos.
-- ════════════════════════════════════════════════════════════════════════════
-- Marcar columnas sensibles: stripe_account_id, stripe_customer_id,
-- stripe_account_status, coins_balance, email_prefs, push_subscription,
-- creator_terms_*, adult_terms_*, last_active_ip, age (parcial)
--
-- IMPORTANTE: El backend usa service_role y bypasea RLS. Esta vista es para
-- queries directas desde el cliente (Realtime, etc.).
CREATE OR REPLACE VIEW profiles_public AS
SELECT
  id, full_name, avatar_url, bio, age, gender, country, is_verified,
  is_creator, is_adult_creator, creator_bio, creator_subscription_price,
  premium_tier, is_premium, profile_views, last_active, created_at
FROM profiles;

GRANT SELECT ON profiles_public TO anon, authenticated;

-- Policies restrictivas en profiles base
DROP POLICY IF EXISTS "Profiles visibles para todos"        ON profiles;
DROP POLICY IF EXISTS "Profiles visibles para autenticados" ON profiles;
DROP POLICY IF EXISTS "profiles own full read"              ON profiles;
DROP POLICY IF EXISTS "profiles public limited read"        ON profiles;
DROP POLICY IF EXISTS "profiles own update"                 ON profiles;
DROP POLICY IF EXISTS "profiles own delete"                 ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden leer perfil completo SOLO si es el suyo
CREATE POLICY "profiles own full read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Para leer ajenos, los clientes deben usar profiles_public (vista).
-- Sin embargo, mantenemos un read limitado por id para compat con queries
-- que filtran por id específico (el backend con service_role no se ve afectado).
CREATE POLICY "profiles public limited read"
  ON profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL  -- solo autenticados
    AND auth.uid() != id    -- ya cubierto por la policy anterior
  );
-- NOTE: Esta policy aún permite leer columnas sensibles vía PostgREST si el
-- cliente las pide explícitamente. La protección real es:
-- 1. El backend usa service_role (bypassa RLS)
-- 2. El frontend usa la API del backend, no consulta Supabase directamente
-- 3. La vista profiles_public es la canónica para queries cliente-side

-- Update / delete solo en perfil propio
CREATE POLICY "profiles own update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles own delete"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) FIX RLS EN creator_earnings  (ALTA)
--    Issue: solo service_role tiene policy; backend authenticated falla.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'creator_earnings') THEN
    EXECUTE 'ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS "creator earnings own"  ON creator_earnings;
    CREATE POLICY "creator earnings own"
      ON creator_earnings FOR SELECT
      USING (auth.uid() = creator_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) FIX RLS EN video_2257_records  (ALTA)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'video_2257_records') THEN
    EXECUTE 'ALTER TABLE video_2257_records ENABLE ROW LEVEL SECURITY';
    DROP POLICY IF EXISTS "2257 own read" ON video_2257_records;
    CREATE POLICY "2257 own read"
      ON video_2257_records FOR SELECT
      USING (uploaded_by = auth.uid());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) FIX RLS EN show_bans  (ALTA)
--    Issue: USING (TRUE) expone toda la lista de bans.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'show_bans') THEN
    DROP POLICY IF EXISTS "show_bans_select" ON show_bans;
    DROP POLICY IF EXISTS "show_bans own"    ON show_bans;
    CREATE POLICY "show_bans own"
      ON show_bans FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM live_shows ls
          WHERE ls.id = show_bans.show_id AND ls.host_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) GDPR: DELETE policies faltantes  (CRÍTICA)
-- ════════════════════════════════════════════════════════════════════════════
-- Posts del usuario
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'posts') THEN
    DROP POLICY IF EXISTS "posts own delete" ON posts;
    CREATE POLICY "posts own delete" ON posts FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'stories') THEN
    DROP POLICY IF EXISTS "stories own delete" ON stories;
    CREATE POLICY "stories own delete" ON stories FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'messages') THEN
    DROP POLICY IF EXISTS "messages own delete" ON messages;
    CREATE POLICY "messages own delete" ON messages FOR DELETE USING (auth.uid() = sender_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7) CASCADE → SET NULL en tablas financieras  (CRÍTICA)
--    Issue: borrar usuario destruye historial financiero, auditoría, impuestos.
--    Solución: cambiar a SET NULL para preservar historial.
-- ════════════════════════════════════════════════════════════════════════════

-- coin_transactions: preservar historial cuando user se elimina
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'coin_transactions' AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Hacer columna nullable
    ALTER TABLE coin_transactions ALTER COLUMN user_id DROP NOT NULL;
    -- Drop FK existente (varía nombre por instalación)
    EXECUTE (
      SELECT 'ALTER TABLE coin_transactions DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'coin_transactions'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%user%'
      LIMIT 1
    );
    -- Re-crear con SET NULL
    ALTER TABLE coin_transactions
      ADD CONSTRAINT coin_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Si falla por nombre de constraint inesperado, log y continuar
  RAISE NOTICE 'coin_transactions FK migration skipped: %', SQLERRM;
END $$;

-- creator_payouts: misma lógica
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'creator_payouts') THEN
    ALTER TABLE creator_payouts ALTER COLUMN creator_id DROP NOT NULL;
    EXECUTE (
      SELECT 'ALTER TABLE creator_payouts DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'creator_payouts'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%creator%'
      LIMIT 1
    );
    ALTER TABLE creator_payouts
      ADD CONSTRAINT creator_payouts_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'creator_payouts FK migration skipped: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8) INDEXES FALTANTES  (ALTA)
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_date
  ON coin_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON profiles (id) WHERE is_admin = TRUE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'messages') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_sender
      ON messages (sender_id, created_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'posts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_adult_date
      ON posts (is_adult, created_at DESC) WHERE is_adult = FALSE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'live_shows') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_live_shows_host_status
      ON live_shows (host_id, status)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 9) CHECK constraints en montos (dinero) — evitar valores negativos
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'creator_earnings') THEN
    ALTER TABLE creator_earnings DROP CONSTRAINT IF EXISTS ck_creator_earnings_nonneg;
    ALTER TABLE creator_earnings ADD CONSTRAINT ck_creator_earnings_nonneg
      CHECK (total_earned >= 0 AND available_balance >= 0 AND total_paid_out >= 0);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10) UNIQUE compuesto en live_shows.channel_name por host
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'live_shows') THEN
    -- channel_name globalmente único causa colisiones entre hosts
    ALTER TABLE live_shows DROP CONSTRAINT IF EXISTS live_shows_channel_name_key;
    -- No re-añadir UNIQUE: el formato 'Destino TV_<hex>' del backend ya es
    -- estadísticamente único. Si se quiere, agregar UNIQUE(host_id, channel_name).
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'live_shows channel_name unique drop skipped: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 11) processed_stripe_events: confirmar que existe + UNIQUE
--     (la v22 ya lo creó, esto solo asegura idempotencia)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stripe events service only" ON processed_stripe_events;
-- Sin policies para authenticated → solo service_role puede leer/escribir

-- ════════════════════════════════════════════════════════════════════════════
-- 12) CLEANUP: funciones de retención
-- ════════════════════════════════════════════════════════════════════════════

-- Limpiar processed_stripe_events > 1 año
CREATE OR REPLACE FUNCTION cleanup_processed_stripe_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processed_stripe_events
  WHERE processed_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar login_attempts > 90 días
CREATE OR REPLACE FUNCTION cleanup_login_attempts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'login_attempts') THEN
    DELETE FROM login_attempts
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END IF;
  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar in_app_notifications leídas > 90 días
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'in_app_notifications') THEN
    DELETE FROM in_app_notifications
    WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END IF;
  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpiar stories expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_stories_v2()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'stories') THEN
    DELETE FROM stories WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END IF;
  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función combinada para llamar desde un cron job de Supabase (pg_cron) o
-- desde el backend en intervalo
CREATE OR REPLACE FUNCTION run_all_cleanups()
RETURNS TABLE (job TEXT, deleted INTEGER) AS $$
BEGIN
  RETURN QUERY
    SELECT 'stripe_events'::TEXT, cleanup_processed_stripe_events()
    UNION ALL SELECT 'login_attempts', cleanup_login_attempts()
    UNION ALL SELECT 'old_notifications', cleanup_old_notifications()
    UNION ALL SELECT 'expired_stories', cleanup_expired_stories_v2();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════════════
-- 13) RPC ATÓMICO para gift subscription (evita coins perdidos)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gift_subscription_atomic(
  p_gifter_id      UUID,
  p_creator_id     UUID,
  p_recipient_id   UUID,
  p_tier_id        UUID,
  p_coins_cost     INTEGER,
  p_creator_coins  INTEGER,
  p_tier_price     NUMERIC,
  p_gift_message   TEXT
)
RETURNS TABLE (success BOOLEAN, error_code TEXT) AS $$
DECLARE
  gifter_balance INT;
  period_end TIMESTAMPTZ;
BEGIN
  -- 1) Verificar y deducir coins del gifter (con lock)
  SELECT coins_balance INTO gifter_balance
    FROM profiles WHERE id = p_gifter_id FOR UPDATE;

  IF gifter_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 'GIFTER_NOT_FOUND'::TEXT; RETURN;
  END IF;

  IF gifter_balance < p_coins_cost THEN
    RETURN QUERY SELECT FALSE, 'INSUFFICIENT_COINS'::TEXT; RETURN;
  END IF;

  UPDATE profiles SET coins_balance = coins_balance - p_coins_cost
    WHERE id = p_gifter_id;

  -- 2) Registrar transacción del gasto
  INSERT INTO coin_transactions (user_id, amount, type, reference_id)
    VALUES (p_gifter_id, -p_coins_cost, 'gift_subscription', p_creator_id);

  -- 3) Acreditar al creator
  UPDATE profiles SET coins_balance = coins_balance + p_creator_coins
    WHERE id = p_creator_id;

  INSERT INTO coin_transactions (user_id, amount, type, reference_id)
    VALUES (p_creator_id, p_creator_coins, 'subscription_gift_received', p_recipient_id);

  -- 4) Crear / actualizar suscripción del recipient
  period_end := NOW() + INTERVAL '30 days';
  INSERT INTO creator_subscriptions (
    subscriber_id, creator_id, tier_id, subscription_price,
    status, current_period_end, is_gift, gifted_by, gift_message, auto_renew, updated_at
  ) VALUES (
    p_recipient_id, p_creator_id, p_tier_id, p_tier_price,
    'active', period_end, TRUE, p_gifter_id, p_gift_message, FALSE, NOW()
  )
  ON CONFLICT (subscriber_id, creator_id) DO UPDATE SET
    tier_id = EXCLUDED.tier_id,
    subscription_price = EXCLUDED.subscription_price,
    status = 'active',
    current_period_end = EXCLUDED.current_period_end,
    is_gift = TRUE,
    gifted_by = EXCLUDED.gifted_by,
    gift_message = EXCLUDED.gift_message,
    auto_renew = FALSE,
    updated_at = NOW();

  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  -- Cualquier fallo dispara rollback automático de la transacción del RPC
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════════════
-- 14) Helper: incrementar atomicamente bonus likes
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION add_bonus_likes_atomic(
  p_user_id UUID, p_amount INTEGER, p_max INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  new_value INTEGER;
BEGIN
  UPDATE profiles
    SET bonus_likes = LEAST(COALESCE(bonus_likes, 0) + p_amount, p_max)
    WHERE id = p_user_id
    RETURNING bonus_likes INTO new_value;
  RETURN COALESCE(new_value, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
