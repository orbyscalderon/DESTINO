-- Migration v66 — Persistencia para rate-limit del AI assistant
--
-- Reemplaza la cache en memoria de aiAssistantController por una tabla
-- persistente que sobrevive a redeploys y funciona con múltiples instancias
-- del backend (Railway scaled). El rate-limit (3/hora) se checa con un
-- COUNT sobre la última hora.

CREATE TABLE IF NOT EXISTS public.ai_assistant_usage (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature    VARCHAR(40) NOT NULL,  -- 'icebreaker', futuro 'reply_suggest', etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para query eficiente del rate-limit (last hour per user+feature)
CREATE INDEX IF NOT EXISTS idx_ai_usage_recent
  ON public.ai_assistant_usage (user_id, feature, created_at DESC);

-- Cleanup: borrar registros >24h. Cron lo limpia.
CREATE INDEX IF NOT EXISTS idx_ai_usage_old
  ON public.ai_assistant_usage (created_at);

ALTER TABLE public.ai_assistant_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ai_usage_owner_read ON public.ai_assistant_usage
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.ai_assistant_usage IS
  'Tracking de calls al AI assistant para rate limiting (3/hora por feature por user).';
