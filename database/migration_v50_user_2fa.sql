-- Migration v50 — 2FA TOTP para creators y usuarios sensibles
--
-- Diseño:
-- · Cada usuario puede tener UNA fila en user_2fa con su secreto TOTP cifrado.
-- · El secreto se guarda en `secret_encrypted` (base32 + AES-256-GCM en backend
--   con TOTP_ENCRYPTION_KEY env). El backend nunca lo expone al cliente fuera
--   del enrolamiento inicial.
-- · `enabled = false` significa que el usuario inició enroll pero no verificó.
--   Se promueve a true tras la primera verificación exitosa.
-- · `backup_codes` son 8 códigos de un solo uso (hash bcrypt). El cliente los
--   ve UNA vez al activar; si los pierde + pierde el dispositivo, soporte tiene
--   que verificar identidad de otra forma.
-- · `last_verified_at` permite re-prompt en operaciones críticas (retirar
--   dinero, cambiar email) si el último verify fue hace > N días.

CREATE TABLE IF NOT EXISTS public.user_2fa (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  backup_codes JSONB NOT NULL DEFAULT '[]',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_2fa_enabled
  ON public.user_2fa(user_id) WHERE enabled = TRUE;

-- RLS: el usuario solo ve/modifica su propia fila; el backend (service role)
-- bypassea RLS para enroll/verify.
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_2fa_select_own" ON public.user_2fa;
CREATE POLICY "user_2fa_select_own" ON public.user_2fa
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE solo vía backend con service role. No damos policies de
-- escritura al cliente porque el flujo de TOTP necesita validación servidor.

COMMENT ON TABLE public.user_2fa IS '2FA TOTP enroll y backup codes por usuario. Secreto cifrado AES-GCM en backend.';
COMMENT ON COLUMN public.user_2fa.secret_encrypted IS 'Base32 cifrado con TOTP_ENCRYPTION_KEY (AES-256-GCM, formato iv:tag:ciphertext en hex).';
COMMENT ON COLUMN public.user_2fa.backup_codes IS 'JSONB array de objetos { hash, used_at }. 8 codes generados al activar.';
