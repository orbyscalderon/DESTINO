-- Migration v59 — pinned reels en perfil
--
-- Hasta 3 reels destacados en perfil. Sirven como portfolio del creator.
-- Cuando un visitante abre /profile/:id ve estos reels primero.

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Index para fetch rápido en el perfil
CREATE INDEX IF NOT EXISTS idx_reels_pinned_by_user
  ON public.reels(user_id, pinned_at DESC)
  WHERE pinned = TRUE;

-- Trigger para limitar a 3 pinned por user (despinea el más antiguo automáticamente)
CREATE OR REPLACE FUNCTION public.enforce_pinned_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF NEW.pinned = TRUE AND (OLD IS NULL OR OLD.pinned = FALSE) THEN
    SELECT COUNT(*) INTO current_count
    FROM public.reels
    WHERE user_id = NEW.user_id AND pinned = TRUE AND id <> NEW.id;

    IF current_count >= 3 THEN
      -- Despinea el más antiguo
      UPDATE public.reels
      SET pinned = FALSE, pinned_at = NULL
      WHERE id = (
        SELECT id FROM public.reels
        WHERE user_id = NEW.user_id AND pinned = TRUE AND id <> NEW.id
        ORDER BY pinned_at ASC
        LIMIT 1
      );
    END IF;

    NEW.pinned_at := NOW();
  ELSIF NEW.pinned = FALSE THEN
    NEW.pinned_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_pinned_limit ON public.reels;
CREATE TRIGGER trg_enforce_pinned_limit
  BEFORE UPDATE OF pinned ON public.reels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pinned_limit();

COMMENT ON COLUMN public.reels.pinned IS 'Reel destacado en perfil del autor. Máximo 3 por user (trigger auto-despineea el más viejo).';
