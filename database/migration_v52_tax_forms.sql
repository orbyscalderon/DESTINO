-- Migration v52 — tax forms para creators US/no-US
--
-- IRS requiere W-9 (US persons) o W-8BEN (foreign individuals) antes de pagar
-- $600+ al año a un creador. Stripe Connect emite 1099 automáticamente para
-- payouts US, pero PayPal/Crypto/Bank requieren que nosotros guardemos el form.
--
-- No almacenamos PDF firmados (riesgo legal y de almacenamiento). Solo guardamos:
-- · datos clave del form (nombre, dirección, country, TIN/SSN/EIN cifrado)
-- · firma electrónica (timestamp + nombre tipeado + IP, conforme E-SIGN Act)
-- · status: 'pending' (form iniciado), 'signed' (firmado, válido), 'expired' (>3 años)
--
-- TIN se cifra con la misma clave que payout_details (encryptField/decryptField
-- en backend/src/lib/encrypt.js). Mostramos solo los últimos 4 dígitos al user.

CREATE TABLE IF NOT EXISTS public.tax_forms (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL CHECK (form_type IN ('W9', 'W8BEN')),
  full_name TEXT NOT NULL,
  country TEXT NOT NULL, -- ISO 3166-1 alpha-2 (US, MX, ES, BR, ...)
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state_or_province TEXT,
  postal_code TEXT NOT NULL,
  tin_encrypted TEXT NOT NULL,
  tin_last4 TEXT NOT NULL CHECK (tin_last4 ~ '^[0-9]{4}$'),
  -- Para W-8BEN
  foreign_tax_id TEXT, -- TIN del país de residencia, opcional
  date_of_birth DATE,
  treaty_country TEXT, -- País del treaty para reducir withholding (opcional)
  -- Firma
  signed_full_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_ip INET,
  signed_user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('pending', 'signed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 years'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_forms_expires
  ON public.tax_forms(expires_at) WHERE status = 'signed';

-- RLS: el user ve su propia fila. Escritura solo backend.
ALTER TABLE public.tax_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_forms_select_own" ON public.tax_forms;
CREATE POLICY "tax_forms_select_own" ON public.tax_forms
  FOR SELECT
  USING (auth.uid() = user_id);

-- Helper: verifica si un user tiene tax form válido (signed y no expirado)
CREATE OR REPLACE FUNCTION public.has_valid_tax_form(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tax_forms
    WHERE user_id = p_user_id
      AND status = 'signed'
      AND expires_at > NOW()
  );
$$;

COMMENT ON TABLE public.tax_forms IS 'W-9 (US) y W-8BEN (foreign) firmados electrónicamente. TIN cifrado.';
COMMENT ON FUNCTION public.has_valid_tax_form IS 'TRUE si el user tiene tax form firmado y no expirado. Usar antes de procesar payouts >$600/año.';
