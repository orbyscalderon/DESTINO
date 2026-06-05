-- Migration v53 — audit log de acciones administrativas
--
-- Cada acción importante hecha por un admin queda registrada con:
-- · admin_id, admin_email (denormalizado para que sobreviva si el admin se
--   borra del auth.users)
-- · action: 'user.ban', 'withdrawal.approve', 'verification.approve', etc.
--   Formato 'recurso.verbo'.
-- · target_type + target_id: a quién/qué afecta. NULL si es global
--   (broadcast push, etc.).
-- · metadata jsonb: contexto adicional (razón, monto, status anterior, etc.)
--
-- Inmutable: solo INSERT, nunca UPDATE/DELETE. Si un admin borra registros,
-- queda registrado el DELETE en pg_stat (lo cual ya está fuera del scope app).
-- Para compliance fuerte, considerar replicar a un bucket S3 append-only.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para consultar por admin o por target rápidamente
CREATE INDEX IF NOT EXISTS idx_audit_admin ON public.admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON public.admin_audit_log(target_type, target_id) WHERE target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.admin_audit_log(created_at DESC);

-- RLS: solo super admin puede leer. Backend escribe vía service role.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No damos SELECT policy al cliente — la lectura solo va vía backend con
-- service role + check de admin en el controller.

COMMENT ON TABLE public.admin_audit_log IS 'Append-only log de acciones administrativas. Solo escritura desde backend.';
COMMENT ON COLUMN public.admin_audit_log.action IS 'Formato recurso.verbo (ej. user.ban, withdrawal.approve).';
COMMENT ON COLUMN public.admin_audit_log.metadata IS 'Contexto: razón, monto, status anterior, etc.';
