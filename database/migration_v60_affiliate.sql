-- Migration v60 — affiliate marketing program
--
-- Diferente del referral program (`referrals`):
-- · Referrals: usuario invita amigos, gana 50 coins por compra
-- · Affiliate: INFLUENCERS reclutan CREATORS para Destino. Ganan 10% del
--   revenue que esos creators generen los primeros 6 meses.
--
-- Caso de uso: una influencer con audiencia OnlyFans puede traer 5 creators
-- a Destino y ganar pasivo. Incentivo fuerte para crecer el lado supply.

CREATE TABLE IF NOT EXISTS public.affiliate_programs (
  id BIGSERIAL PRIMARY KEY,
  affiliate_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'banned')),
  commission_pct NUMERIC(4,2) NOT NULL DEFAULT 10.0 CHECK (commission_pct BETWEEN 0 AND 50),
  commission_duration_months INTEGER NOT NULL DEFAULT 6,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  total_earned_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_paid_out_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_user ON public.affiliate_programs(affiliate_user_id);

-- Cada creator que un afiliado trae
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES public.affiliate_programs(id) ON DELETE CASCADE,
  creator_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  commission_expires_at TIMESTAMPTZ NOT NULL,
  total_commission_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE(creator_user_id) -- un creator solo puede ser atribuido a UN affiliate
);

CREATE INDEX IF NOT EXISTS idx_affiliate_refs_program ON public.affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_refs_creator ON public.affiliate_referrals(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_refs_active
  ON public.affiliate_referrals(commission_expires_at)
  WHERE commission_expires_at > NOW();

-- Log de comisiones acumuladas (audit trail)
CREATE TABLE IF NOT EXISTS public.affiliate_commission_log (
  id BIGSERIAL PRIMARY KEY,
  affiliate_id BIGINT NOT NULL REFERENCES public.affiliate_programs(id) ON DELETE CASCADE,
  referral_id BIGINT NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  creator_user_id UUID NOT NULL REFERENCES profiles(id),
  source TEXT NOT NULL, -- 'tip', 'gift', 'subscription', 'private_show', 'coin_purchase'
  source_id TEXT, -- id de la transacción origen
  gross_usd NUMERIC(10,2) NOT NULL, -- monto bruto del creator
  commission_usd NUMERIC(10,2) NOT NULL, -- comisión calculada
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_log_affiliate ON public.affiliate_commission_log(affiliate_id, created_at DESC);

ALTER TABLE public.affiliate_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_log ENABLE ROW LEVEL SECURITY;

-- El affiliate ve su propio programa
DROP POLICY IF EXISTS "affiliate_select_own" ON public.affiliate_programs;
CREATE POLICY "affiliate_select_own" ON public.affiliate_programs
  FOR SELECT USING (affiliate_user_id = auth.uid());

DROP POLICY IF EXISTS "affiliate_refs_select" ON public.affiliate_referrals;
CREATE POLICY "affiliate_refs_select" ON public.affiliate_referrals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM affiliate_programs WHERE id = affiliate_id AND affiliate_user_id = auth.uid())
  );

COMMENT ON TABLE public.affiliate_programs IS 'Programa de afiliados. Influencers reclutan creators a Destino.';
COMMENT ON TABLE public.affiliate_referrals IS 'Creator atribuido a un afiliado. Comisión activa por 6 meses default.';
