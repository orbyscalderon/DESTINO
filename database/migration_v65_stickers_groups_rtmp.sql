-- Migration v65 — Stickers + Group chats + RTMP relay
--
-- 1) Stickers comprables (packs por coins, igual modelo que gifts custom)
-- 2) Group chats — grupos de hasta 8 personas entre matches
-- 3) RTMP relay — stream key + ingress URL para que creators usen OBS

-- ── 1) STICKERS ──────────────────────────────────────────────────────
-- Packs de stickers que un user puede comprar. Default packs son del admin
-- (creator_id = NULL). Creators verificados pueden hacer sus propios packs.
CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         VARCHAR(80) NOT NULL,
  description  TEXT,
  cover_url    TEXT,
  price_coins  INT NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  is_featured  BOOLEAN NOT NULL DEFAULT false,
  total_sold   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticker_packs_active
  ON public.sticker_packs (is_featured DESC, total_sold DESC)
  WHERE is_active = true;

-- Items dentro de cada pack
CREATE TABLE IF NOT EXISTS public.sticker_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     UUID NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  label       VARCHAR(40),
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sticker_items_pack
  ON public.sticker_items (pack_id, sort_order);

-- Packs poseídos por user
CREATE TABLE IF NOT EXISTS public.user_sticker_packs (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_id      UUID NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sticker_packs_user
  ON public.user_sticker_packs (user_id);

-- Mensaje con sticker: messages.sticker_id apunta a sticker_items
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES public.sticker_items(id) ON DELETE SET NULL;

ALTER TABLE public.sticker_packs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sticker_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sticker_packs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sticker_packs_public_read ON public.sticker_packs
    FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY sticker_items_public_read ON public.sticker_items
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM public.sticker_packs p
      WHERE p.id = sticker_items.pack_id AND p.is_active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY user_sticker_packs_owner ON public.user_sticker_packs
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RPC para comprar pack atómicamente (debit coins + grant pack)
CREATE OR REPLACE FUNCTION public.purchase_sticker_pack(p_pack_id UUID)
RETURNS TABLE(success BOOLEAN, remaining_coins INT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_price     INT;
  v_balance   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT price_coins INTO v_price FROM public.sticker_packs
  WHERE id = p_pack_id AND is_active = true;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'pack not found' USING ERRCODE = 'P0002';
  END IF;

  -- Si ya posee, no cobramos
  IF EXISTS (SELECT 1 FROM public.user_sticker_packs WHERE user_id = v_user_id AND pack_id = p_pack_id) THEN
    SELECT coins_balance INTO v_balance FROM public.profiles WHERE id = v_user_id;
    RETURN QUERY SELECT true, v_balance;
    RETURN;
  END IF;

  -- Debit + grant en una transacción
  UPDATE public.profiles
  SET coins_balance = coins_balance - v_price
  WHERE id = v_user_id AND coins_balance >= v_price
  RETURNING coins_balance INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_sticker_packs (user_id, pack_id) VALUES (v_user_id, p_pack_id);
  UPDATE public.sticker_packs SET total_sold = total_sold + 1 WHERE id = p_pack_id;

  RETURN QUERY SELECT true, v_balance;
END $$;

-- ── 2) GROUP CHATS ───────────────────────────────────────────────────
-- Estrategia: tabla `conversations` paralela a `matches`. Un mensaje
-- pertenece a un match (1:1) O a una conversation (grupo). No ambos.
-- Mantiene retrocompatibilidad — todo el código viejo sigue funcionando.

CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(60) NOT NULL,
  avatar_url  TEXT,
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by
  ON public.conversations (created_by);

-- Miembros del grupo (max 8 incluyendo al creador). Trigger lo enforza.
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role            VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members (user_id);

-- Trigger: max 8 members por conversation
CREATE OR REPLACE FUNCTION public.enforce_conversation_member_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.conversation_members
  WHERE conversation_id = NEW.conversation_id;
  IF v_count > 8 THEN
    RAISE EXCEPTION 'max 8 members per conversation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_conversation_member_limit ON public.conversation_members;
CREATE TRIGGER trg_enforce_conversation_member_limit
  AFTER INSERT ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_member_limit();

-- Extender messages: conversation_id como alternativa a match_id
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Un mensaje pertenece a un match O a un conversation, no ambos
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_match_or_conversation;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_match_or_conversation CHECK (
    (match_id IS NOT NULL AND conversation_id IS NULL) OR
    (match_id IS NULL AND conversation_id IS NOT NULL)
  );

-- Index para query de mensajes por conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Permitir match_id NULL en messages (porque ahora puede ser conversation)
ALTER TABLE public.messages
  ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE public.conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversations_member_read ON public.conversations
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = conversations.id AND user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY conversation_members_visible ON public.conversation_members
    FOR SELECT USING (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = conversation_members.conversation_id
          AND m.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3) RTMP RELAY para creators (stream desde OBS) ──────────────────
-- Cada show puede tener un stream key único. Cuando el creator inicia
-- el show, el backend genera el key + URL ingress. OBS publica al ingress,
-- el RTMP server transcodea/forwards a LiveKit como participante.
ALTER TABLE public.live_shows
  ADD COLUMN IF NOT EXISTS rtmp_stream_key  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS rtmp_ingress_url TEXT,
  ADD COLUMN IF NOT EXISTS rtmp_enabled     BOOLEAN NOT NULL DEFAULT false;

-- Index: para rotar/buscar por stream key (no debería repetirse)
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_shows_rtmp_key
  ON public.live_shows (rtmp_stream_key)
  WHERE rtmp_stream_key IS NOT NULL;

COMMENT ON COLUMN public.live_shows.rtmp_stream_key IS
  'Stream key único para OBS. Se genera al activar rtmp_enabled. El backend lo intercambia con LiveKit Ingress API.';
