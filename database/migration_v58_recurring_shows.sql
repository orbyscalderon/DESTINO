-- Migration v58 — recurring shows + reminders
--
-- Un creator define un show recurrente (ej. "Todos los miércoles 8pm").
-- · El cron diario genera instancias en live_shows.scheduled_at futuras (~7d).
-- · 15 min antes del start: push reminder a seguidores.

CREATE TABLE IF NOT EXISTS public.recurring_shows (
  id BIGSERIAL PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  -- Recurrencia: weekly. day_of_week 0=domingo, 6=sábado
  recurrence TEXT NOT NULL DEFAULT 'weekly' CHECK (recurrence IN ('weekly', 'daily')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute SMALLINT NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_host ON public.recurring_shows(host_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON public.recurring_shows(active) WHERE active = TRUE;

-- Recordatorios — flag para no duplicar push.
ALTER TABLE public.live_shows
  ADD COLUMN IF NOT EXISTS recurring_id BIGINT REFERENCES public.recurring_shows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shows_scheduled_reminder
  ON public.live_shows(scheduled_at)
  WHERE status = 'scheduled' AND reminder_sent_at IS NULL;

ALTER TABLE public.recurring_shows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_select" ON public.recurring_shows;
CREATE POLICY "recurring_select" ON public.recurring_shows
  FOR SELECT USING (active = TRUE OR host_id = auth.uid());

COMMENT ON TABLE public.recurring_shows IS 'Shows recurrentes definidos por el creator. Cron genera live_shows scheduled.';
