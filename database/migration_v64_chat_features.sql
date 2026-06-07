-- Migration v64 — Chat features bundle
--
-- 1) Slow mode en chat de show: show_chat_slow_mode_seconds
-- 2) Mute users (sin bloquear): user_mutes
-- 3) Scheduled messages: messages.scheduled_for + index
-- 4) Mentions @user: message_mentions table + notifications
-- 5) Disappearing messages: messages.expires_at + cleanup index
--
-- Algunas extensiones a tablas existentes son ADD COLUMN IF NOT EXISTS
-- para idempotencia. Las tablas nuevas usan CREATE TABLE IF NOT EXISTS.

-- ── 1) SLOW MODE EN SHOWS ─────────────────────────────────────────────
-- Cooldown entre mensajes para viewers durante un show. Host/mod lo configura.
ALTER TABLE public.live_shows
  ADD COLUMN IF NOT EXISTS chat_slow_mode_seconds INT NOT NULL DEFAULT 0
    CHECK (chat_slow_mode_seconds >= 0 AND chat_slow_mode_seconds <= 300);

-- Para rate-limit eficiente en backend: cache del último mensaje por (show, user)
-- Como el chat de show se borra al terminar, lo guardamos en Redis-like behavior
-- via PostgreSQL temp logic: usamos show_chat_user_state ligera
CREATE TABLE IF NOT EXISTS public.show_chat_user_state (
  show_id     UUID NOT NULL REFERENCES public.live_shows(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_msg_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (show_id, user_id)
);

-- TTL — borrar registros viejos (1 día). Cron del backend lo limpia.
CREATE INDEX IF NOT EXISTS idx_show_chat_user_state_old
  ON public.show_chat_user_state (last_msg_at);

-- ── 2) MUTE USERS (soft mute) ──────────────────────────────────────────
-- No es bloqueo. El user mute deja de ver posts/reels/stories del muted pero
-- siguen pudiendo interactuar. Más débil que blocks.
CREATE TABLE IF NOT EXISTS public.user_mutes (
  id         BIGSERIAL PRIMARY KEY,
  muter_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = indefinido. Permite snooze 1d/7d/30d/forever
  CONSTRAINT chk_no_self_mute CHECK (muter_id <> muted_id),
  UNIQUE (muter_id, muted_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muter
  ON public.user_mutes (muter_id, muted_id);

-- Cron limpia mutes expirados
CREATE INDEX IF NOT EXISTS idx_user_mutes_expired
  ON public.user_mutes (expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY user_mutes_owner_all ON public.user_mutes
    FOR ALL USING (auth.uid() = muter_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3) SCHEDULED MESSAGES ─────────────────────────────────────────────
-- Usuario puede programar un mensaje para enviarse a futuro.
-- Hasta 30 días en el futuro. Cron del backend dispatchea cada minuto.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_scheduled  BOOLEAN NOT NULL DEFAULT false;

-- Index para que el cron encuentre pending eficientemente
CREATE INDEX IF NOT EXISTS idx_messages_scheduled_pending
  ON public.messages (scheduled_for)
  WHERE is_scheduled = true AND scheduled_for IS NOT NULL;

-- ── 4) MENTIONS @user ─────────────────────────────────────────────────
-- Tabla simple — message_mentions. El parser del backend extrae @username
-- al insertar, busca el user, inserta aquí. Trigger notifica al mentionado.
CREATE TABLE IF NOT EXISTS public.message_mentions (
  id              BIGSERIAL PRIMARY KEY,
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  mentioned_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (message_id, mentioned_id)
);

CREATE INDEX IF NOT EXISTS idx_message_mentions_mentioned
  ON public.message_mentions (mentioned_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_mentions_unnotified
  ON public.message_mentions (notified)
  WHERE notified = false;

ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY message_mentions_visible ON public.message_mentions
    FOR SELECT USING (auth.uid() = mentioned_id OR auth.uid() = mentioned_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- También mentions en comentarios de reels
CREATE TABLE IF NOT EXISTS public.reel_comment_mentions (
  id              BIGSERIAL PRIMARY KEY,
  comment_id      UUID NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  mentioned_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (comment_id, mentioned_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_mentions_mentioned
  ON public.reel_comment_mentions (mentioned_id, created_at DESC);

-- ── 5) DISAPPEARING MESSAGES ──────────────────────────────────────────
-- Mensajes que se borran después de N minutos. El sender activa el modo
-- por chat (no por mensaje) — todos los mensajes que envíe en ese chat
-- mientras esté on tienen expires_at.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Estado por match: cuánto duran los mensajes (NULL = no disappear)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS disappear_minutes INT
    CHECK (disappear_minutes IS NULL OR disappear_minutes IN (5, 60, 1440, 10080));
    -- 5min / 1h / 1d / 7d

-- Index para cron de cleanup
CREATE INDEX IF NOT EXISTS idx_messages_disappearing
  ON public.messages (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.matches.disappear_minutes IS
  'Minutos hasta auto-delete de nuevos mensajes. Setea por participante. NULL = mensajes persisten.';
