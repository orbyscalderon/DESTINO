-- ============================================================
-- MIGRACIÓN v6: Coins, Stories, Posts, Notificaciones, PPV, Suscripciones a creadores
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- ── Columnas nuevas en profiles ───────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coins_balance              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_adult_creator           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS creator_subscription_price NUMERIC(10,2) DEFAULT NULL;

-- La regla de contenido adulto: perfiles con is_adult_creator=true
-- no aparecen en el feed de matching, pero sí en búsqueda y en shows/fotos de pago.

-- ── Columnas nuevas en messages (PPV) ────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_ppv       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ppv_price    INTEGER DEFAULT NULL, -- en coins
  ADD COLUMN IF NOT EXISTS ppv_media_url TEXT DEFAULT NULL;   -- URL bloqueada hasta pago

-- ============================================================
-- TABLA: coin_transactions — historial de movimientos de coins
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,  -- positivo = ingreso, negativo = gasto
  type       TEXT NOT NULL CHECK (type IN (
    'purchase', 'tip_sent', 'tip_received',
    'ppv_spent', 'ppv_received', 'refund', 'bonus'
  )),
  reference_id UUID,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: show_tips — propinas enviadas durante shows
-- ============================================================
CREATE TABLE IF NOT EXISTS show_tips (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id          UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  tipper_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coins_spent      INTEGER NOT NULL,
  amount_usd       NUMERIC(10,2) NOT NULL,
  creator_earnings NUMERIC(10,2) NOT NULL,
  platform_fee     NUMERIC(10,2) NOT NULL,
  message          TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: ppv_unlocks — mensajes PPV desbloqueados
-- ============================================================
CREATE TABLE IF NOT EXISTS ppv_unlocks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id       UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  buyer_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coins_spent      INTEGER NOT NULL,
  amount_usd       NUMERIC(10,2) NOT NULL,
  creator_earnings NUMERIC(10,2) NOT NULL,
  platform_fee     NUMERIC(10,2) NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, buyer_id)
);

-- ============================================================
-- TABLA: creator_subscriptions — suscripciones mensuales a creadores
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscriber_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_price      NUMERIC(10,2) NOT NULL,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_customer_id      TEXT,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  current_period_end      TIMESTAMP WITH TIME ZONE,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subscriber_id, creator_id)
);

-- ============================================================
-- TABLA: stories — historias efímeras de 24h
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url   TEXT NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  is_adult    BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_views (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id   UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

-- ============================================================
-- TABLA: posts — momentos/publicaciones públicas
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caption              TEXT,
  media_url            TEXT,
  media_type           TEXT CHECK (media_type IN ('photo', 'video', 'text')),
  is_adult             BOOLEAN NOT NULL DEFAULT FALSE,
  is_subscribers_only  BOOLEAN NOT NULL DEFAULT FALSE,
  likes_count          INTEGER NOT NULL DEFAULT 0,
  comments_count       INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: in_app_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- 'match','like','message','tip','ppv','subscription','new_post','new_story'
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE coin_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_tips               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppv_unlocks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications    ENABLE ROW LEVEL SECURITY;

-- coin_transactions
CREATE POLICY "Usuario ve sus transacciones" ON coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Sistema inserta transacciones" ON coin_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- show_tips
CREATE POLICY "Participantes ven tips" ON show_tips FOR SELECT TO authenticated
  USING (auth.uid() = tipper_id OR auth.uid() = creator_id);
CREATE POLICY "Tipper inserta tip" ON show_tips FOR INSERT TO authenticated WITH CHECK (auth.uid() = tipper_id);

-- ppv_unlocks
CREATE POLICY "Participantes ven PPV" ON ppv_unlocks FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyer desbloquea PPV" ON ppv_unlocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- creator_subscriptions
CREATE POLICY "Partes ven suscripciones" ON creator_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = subscriber_id OR auth.uid() = creator_id);
CREATE POLICY "Subscriber se suscribe" ON creator_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = subscriber_id);
CREATE POLICY "Sistema actualiza suscripciones" ON creator_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = subscriber_id OR auth.uid() = creator_id);

-- stories
CREATE POLICY "Stories visibles para autenticados" ON stories FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Usuario publica su story" ON stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario elimina su story" ON stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- story_views
CREATE POLICY "Autor ve vistas de su story" ON story_views FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id OR EXISTS(SELECT 1 FROM stories WHERE stories.id = story_views.story_id AND stories.user_id = auth.uid()));
CREATE POLICY "Viewer registra vista" ON story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

-- posts
CREATE POLICY "Posts visibles para autenticados" ON posts FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Usuario publica post" ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario actualiza su post" ON posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Usuario elimina su post" ON posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- post_likes
CREATE POLICY "Likes visibles" ON post_likes FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Usuario da like" ON post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario quita like" ON post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- post_comments
CREATE POLICY "Comentarios visibles" ON post_comments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Usuario comenta" ON post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario elimina su comentario" ON post_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- in_app_notifications
CREATE POLICY "Usuario ve sus notificaciones" ON in_app_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Sistema inserta notificaciones" ON in_app_notifications FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Usuario marca como leida" ON in_app_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_coin_tx_user         ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_show_tips_show        ON show_tips(show_id);
CREATE INDEX IF NOT EXISTS idx_show_tips_creator     ON show_tips(creator_id);
CREATE INDEX IF NOT EXISTS idx_ppv_unlocks_message   ON ppv_unlocks(message_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_creator  ON creator_subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_sub      ON creator_subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_stories_user          ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires       ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_story_views_story     ON story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_posts_user            ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created         ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_post       ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post    ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread     ON in_app_notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE show_tips;
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;

-- ============================================================
-- FUNCIONES: manejo atómico de coins
-- ============================================================
CREATE OR REPLACE FUNCTION increment_coins(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET coins_balance = coins_balance + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_coins(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET coins_balance = GREATEST(0, coins_balance - p_amount) WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: limpiar stories expiradas
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS VOID AS $$
BEGIN
  DELETE FROM stories WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
