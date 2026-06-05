-- Migration v55 — moderadores de chat en shows
--
-- Un creator puede nombrar moderadores que se mantienen entre sus shows.
-- Los mods pueden:
-- · Silenciar viewers (timeout 5/15/60 min)
-- · Banear viewers permanentemente de TODOS los shows de ese creator
-- · Borrar mensajes individuales
--
-- Tablas:
-- · show_moderators: creator_id → user_id, role
-- · show_chat_bans: creator_id × viewer_id (perma ban del chat)
-- · show_chat_mutes: creator_id × viewer_id × expires_at

CREATE TABLE IF NOT EXISTS public.show_moderators (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID REFERENCES profiles(id),
  UNIQUE(creator_id, user_id),
  CHECK (creator_id <> user_id)
);

CREATE INDEX IF NOT EXISTS idx_show_mods_user ON public.show_moderators(user_id);
CREATE INDEX IF NOT EXISTS idx_show_mods_creator ON public.show_moderators(creator_id);

CREATE TABLE IF NOT EXISTS public.show_chat_bans (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(creator_id, viewer_id),
  CHECK (creator_id <> viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_bans_viewer ON public.show_chat_bans(viewer_id);

CREATE TABLE IF NOT EXISTS public.show_chat_mutes (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(creator_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mutes_expires ON public.show_chat_mutes(expires_at);

-- Helper: ¿es mod o host?
CREATE OR REPLACE FUNCTION public.is_show_mod(p_creator_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p_creator_id = p_user_id  -- el creator es mod implícito
    OR EXISTS (
      SELECT 1 FROM public.show_moderators
      WHERE creator_id = p_creator_id AND user_id = p_user_id
    );
$$;

-- Helper: ¿el viewer está baneado/muteado en el chat de este creator?
CREATE OR REPLACE FUNCTION public.is_chat_restricted(p_creator_id UUID, p_viewer_id UUID)
RETURNS TABLE(banned BOOLEAN, muted BOOLEAN, muted_until TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.show_chat_bans WHERE creator_id = p_creator_id AND viewer_id = p_viewer_id) AS banned,
    EXISTS (SELECT 1 FROM public.show_chat_mutes WHERE creator_id = p_creator_id AND viewer_id = p_viewer_id AND expires_at > NOW()) AS muted,
    (SELECT expires_at FROM public.show_chat_mutes WHERE creator_id = p_creator_id AND viewer_id = p_viewer_id ORDER BY expires_at DESC LIMIT 1) AS muted_until;
$$;

-- RLS: creators y mods pueden ver/modificar las restricciones de su show
ALTER TABLE public.show_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_chat_bans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_chat_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mods_select_own" ON public.show_moderators;
CREATE POLICY "mods_select_own" ON public.show_moderators
  FOR SELECT USING (creator_id = auth.uid() OR user_id = auth.uid());
-- Writes solo via backend con service role.

COMMENT ON TABLE public.show_moderators IS 'Mods nombrados por un creator que persisten entre sus shows.';
COMMENT ON TABLE public.show_chat_bans IS 'Bans permanentes de chat aplicables a todos los shows del creator.';
COMMENT ON TABLE public.show_chat_mutes IS 'Timeouts temporales (típico 5/15/60 min) de chat por creator.';
