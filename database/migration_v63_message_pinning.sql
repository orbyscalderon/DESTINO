-- Migration v63 — Múltiples pinned messages por match (hasta 3)
--
-- La tabla pinned_messages existía desde v18 con UNIQUE(match_id) — solo
-- permitía 1 mensaje fijado por chat. Esto extiende el sistema:
-- · Drop UNIQUE(match_id), add UNIQUE(match_id, message_id)
-- · Add pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW() para ordenar
-- · Trigger enforce_pinned_messages_limit: max 3 por match, FIFO automático
--
-- El controller existente (pinMessage/unpinMessage/getPinnedMessage) se
-- actualiza por separado para soportar múltiples.

-- Solo si la columna no existe (idempotente)
ALTER TABLE public.pinned_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Drop UNIQUE(match_id) viejo si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'pinned_messages'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%(match_id)%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%message_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE pinned_messages DROP CONSTRAINT ' || quote_ident(c.conname)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'pinned_messages'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) LIKE '%(match_id)%'
        AND pg_get_constraintdef(c.oid) NOT LIKE '%message_id%'
      LIMIT 1
    );
  END IF;
END $$;

-- Nuevo UNIQUE composite: un mensaje pinneado una sola vez
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pinned_messages_match_message_key'
  ) THEN
    ALTER TABLE public.pinned_messages
      ADD CONSTRAINT pinned_messages_match_message_key
      UNIQUE (match_id, message_id);
  END IF;
END $$;

-- Index para listar pins por match ordenados por más reciente
CREATE INDEX IF NOT EXISTS idx_pinned_messages_match_recent
  ON public.pinned_messages (match_id, pinned_at DESC);

-- Trigger: max 3 pinned por match. Si insertas un 4to, borra el más viejo.
CREATE OR REPLACE FUNCTION public.enforce_pinned_messages_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_oldest_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.pinned_messages
  WHERE match_id = NEW.match_id;

  IF v_count > 3 THEN
    SELECT id INTO v_oldest_id
    FROM public.pinned_messages
    WHERE match_id = NEW.match_id AND id <> NEW.id
    ORDER BY pinned_at ASC
    LIMIT 1;

    IF v_oldest_id IS NOT NULL THEN
      DELETE FROM public.pinned_messages WHERE id = v_oldest_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_pinned_messages_limit ON public.pinned_messages;
CREATE TRIGGER trg_enforce_pinned_messages_limit
  AFTER INSERT ON public.pinned_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pinned_messages_limit();

COMMENT ON TABLE public.pinned_messages IS
  'Mensajes fijados por match. Max 3 por match (trigger). Cualquier participante del match puede fijar/desfijar.';
