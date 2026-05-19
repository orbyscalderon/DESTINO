-- ============================================================
-- DESTINO - Schema completo para Supabase
-- Pega este SQL en: Supabase > SQL Editor > New Query
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: profiles
-- Extiende auth.users con datos de perfil de la app
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  age INTEGER CHECK (age >= 18 AND age <= 100),
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  bio TEXT,
  avatar_url TEXT,
  country TEXT,
  language TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT NULL,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TABLA: matches
-- Gestiona los likes y matches entre usuarios
-- ============================================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user1_liked BOOLEAN DEFAULT FALSE,
  user2_liked BOOLEAN DEFAULT FALSE,
  is_match BOOLEAN DEFAULT FALSE,
  is_super_like BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- ============================================================
-- TABLA: messages
-- Mensajes entre usuarios con match
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: daily_message_count
-- Contador de mensajes por día para usuarios gratuitos
-- ============================================================
CREATE TABLE daily_message_count (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  UNIQUE(user_id, date)
);

-- ============================================================
-- TABLA: video_sessions
-- Sesiones de videollamada entre usuarios
-- ============================================================
CREATE TABLE video_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  channel_name TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  gender_filter TEXT CHECK (gender_filter IN ('male', 'female', 'other', 'any')),
  country_filter TEXT DEFAULT 'any',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- TABLA: subscriptions
-- Registro de suscripciones de Stripe
-- ============================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: profile_photos
-- Galería de fotos adicionales por usuario
-- ============================================================
CREATE TABLE profile_photos (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url          TEXT    NOT NULL,
  storage_path TEXT,
  position     INTEGER DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: blocked_users
-- Bloqueos entre usuarios
-- ============================================================
CREATE TABLE blocked_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- ============================================================
-- TABLA: reports
-- Reportes de abuso
-- ============================================================
CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: push_subscriptions
-- Suscripciones Web Push (PWA / móvil)
-- ============================================================
CREATE TABLE push_subscriptions (
  id           UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Cada usuario solo ve sus propios datos sensibles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_message_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Profiles visibles para todos los autenticados"
  ON profiles FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Usuario actualiza su propio perfil"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Usuario inserta su propio perfil"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Políticas para matches
CREATE POLICY "Usuario ve sus propios matches"
  ON matches FOR SELECT
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Usuario crea matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user1_id);

CREATE POLICY "Usuario actualiza sus matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Políticas para messages
CREATE POLICY "Usuario ve mensajes de sus matches"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = messages.match_id
      AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
    )
  );

CREATE POLICY "Usuario envía mensajes en sus matches"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Políticas para daily_message_count
CREATE POLICY "Usuario ve su propio contador"
  ON daily_message_count FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Usuario gestiona su contador"
  ON daily_message_count FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Políticas para video_sessions
CREATE POLICY "Usuario ve sesiones de video"
  ON video_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id OR status = 'waiting');

-- Políticas para subscriptions
CREATE POLICY "Usuario ve su suscripción"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Políticas para profile_photos
CREATE POLICY "Fotos visibles para todos los autenticados"
  ON profile_photos FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Usuario sube sus propias fotos"
  ON profile_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuario elimina sus propias fotos"
  ON profile_photos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Políticas para blocked_users
CREATE POLICY "Usuario ve sus bloqueos"
  ON blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY "Usuario bloquea a otros"
  ON blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Usuario desbloquea"
  ON blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Políticas para reports
CREATE POLICY "Usuario crea reportes"
  ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Usuario ve sus reportes"
  ON reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

-- Políticas para push_subscriptions
CREATE POLICY "Usuario gestiona su suscripcion push"
  ON push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES para mejor rendimiento
-- ============================================================
CREATE INDEX idx_matches_user1 ON matches(user1_id);
CREATE INDEX idx_matches_user2 ON matches(user2_id);
CREATE INDEX idx_messages_match ON messages(match_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_daily_count_user_date ON daily_message_count(user_id, date);
CREATE INDEX idx_video_sessions_status ON video_sessions(status);
CREATE INDEX idx_video_sessions_country ON video_sessions(country_filter);
CREATE INDEX idx_profiles_gender ON profiles(gender);
CREATE INDEX idx_profiles_premium ON profiles(is_premium);
CREATE INDEX idx_profile_photos_user ON profile_photos(user_id);
CREATE INDEX idx_profile_photos_position ON profile_photos(user_id, position);
CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);
CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_reported ON reports(reported_id);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================================
-- FUNCIÓN: Verificar y crear/actualizar contador diario
-- Llamada desde el backend para controlar el límite
-- ============================================================
CREATE OR REPLACE FUNCTION increment_message_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO daily_message_count (user_id, count, date)
  VALUES (p_user_id, 1, CURRENT_DATE)
  ON CONFLICT (user_id, date)
  DO UPDATE SET count = daily_message_count.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: Limpiar sesiones de video huérfanas (> 1 hora)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_video_sessions()
RETURNS VOID AS $$
BEGIN
  UPDATE video_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE status IN ('waiting', 'active')
    AND started_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REALTIME: Habilitar para mensajes y matches
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE video_sessions;
