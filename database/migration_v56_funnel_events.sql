-- Migration v56 — funnel analytics events
--
-- Append-only de eventos de funnel para análisis de conversión:
-- · signup_started
-- · signup_completed
-- · onboarding_started
-- · onboarding_step (con step_index en metadata)
-- · onboarding_completed
-- · first_like
-- · first_match
-- · first_message
-- · first_purchase (coins)
-- · first_tip
-- · first_subscription
-- · became_creator
-- · first_live_show
--
-- El admin agrupa por evento y user_id (DISTINCT) para sacar % de conversión
-- entre pasos. No guardamos PII más allá de user_id.

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una fila por (user_id, event) — el funnel es "ever did X" no "did X N veces".
-- Para tracking de actividad recurrente usar coin_transactions u otros logs.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_funnel_user_event
  ON public.funnel_events(user_id, event);

CREATE INDEX IF NOT EXISTS idx_funnel_event_date
  ON public.funnel_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_user
  ON public.funnel_events(user_id);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
-- Solo backend escribe; admin lee via service role.

COMMENT ON TABLE public.funnel_events IS 'Append-only de eventos de funnel (uno por user × event).';
