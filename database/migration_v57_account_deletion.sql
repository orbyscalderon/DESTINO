-- Migration v57 — account deletion requests con grace period
--
-- GDPR (UE) y CCPA (California) requieren que el user pueda solicitar
-- la eliminación de su cuenta. Flow:
-- 1. user solicita deletion → fila en account_deletion_requests con
--    scheduled_for = NOW() + 30d
-- 2. user puede cancelar dentro de los 30 días → status='cancelled'
-- 3. cron diario revisa requests scheduled <= NOW() y ejecuta deletion
-- 4. Tras deletion, se mantiene la fila como audit (status='completed')
--    para compliance (proof of deletion ante autoridad)

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'completed', 'failed')),
  reason TEXT, -- opcional, lo que el user diga (campo de feedback)
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL, -- requested_at + 30d
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  ip INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_pending
  ON public.account_deletion_requests(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_deletion_user
  ON public.account_deletion_requests(user_id, requested_at DESC);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deletion_select_own" ON public.account_deletion_requests;
CREATE POLICY "deletion_select_own" ON public.account_deletion_requests
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.account_deletion_requests IS 'GDPR/CCPA: solicitudes de deletion con grace period de 30 días.';
