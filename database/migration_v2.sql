-- ============================================================
-- DESTINO — Migración v2
-- Ejecutar en: Supabase > SQL Editor
-- Usa IF NOT EXISTS — seguro de correr múltiples veces
-- ============================================================

-- ============================================================
-- 1. Columnas faltantes en profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language TEXT;

-- ============================================================
-- 2. TABLA: profile_photos
-- Galería de fotos adicionales por usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_photos (
  id          UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  storage_path TEXT,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_photos' AND policyname = 'Fotos visibles para todos los autenticados'
  ) THEN
    CREATE POLICY "Fotos visibles para todos los autenticados"
      ON profile_photos FOR SELECT TO authenticated USING (TRUE);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_photos' AND policyname = 'Usuario sube sus propias fotos'
  ) THEN
    CREATE POLICY "Usuario sube sus propias fotos"
      ON profile_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profile_photos' AND policyname = 'Usuario elimina sus propias fotos'
  ) THEN
    CREATE POLICY "Usuario elimina sus propias fotos"
      ON profile_photos FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profile_photos_user ON profile_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_photos_position ON profile_photos(user_id, position);

-- ============================================================
-- 3. TABLA: blocked_users
-- Usuarios bloqueados por cada usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blocked_users' AND policyname = 'Usuario ve sus bloqueos'
  ) THEN
    CREATE POLICY "Usuario ve sus bloqueos"
      ON blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blocked_users' AND policyname = 'Usuario bloquea a otros'
  ) THEN
    CREATE POLICY "Usuario bloquea a otros"
      ON blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blocked_users' AND policyname = 'Usuario desbloquea'
  ) THEN
    CREATE POLICY "Usuario desbloquea"
      ON blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- ============================================================
-- 4. TABLA: reports
-- Reportes de abuso entre usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Usuario crea reportes'
  ) THEN
    CREATE POLICY "Usuario crea reportes"
      ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Usuario ve sus reportes'
  ) THEN
    CREATE POLICY "Usuario ve sus reportes"
      ON reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);

-- ============================================================
-- 5. TABLA: push_subscriptions
-- Suscripciones de notificaciones push (Web Push / PWA)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Usuario gestiona su suscripcion push'
  ) THEN
    CREATE POLICY "Usuario gestiona su suscripcion push"
      ON push_subscriptions FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================================
-- 6. verification_status en profiles
-- Estado de verificación de identidad via Stripe Identity
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT NULL;

-- ============================================================
-- 7. is_super_like en matches
-- Indica si el like fue un Super Like (Premium)
-- ============================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_super_like BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 8. image_url en messages
-- Permite enviar fotos en el chat
-- ============================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
