-- Migration v62 — RPC para acumular comisiones de afiliado atomically
--
-- recordAffiliateCommission() en backend llama esta función. Sin ella,
-- caía a un fallback con UPDATE manual que NO es atómico (race condition
-- bajo carga). Esta versión usa UPDATE atómico en ambas tablas.

CREATE OR REPLACE FUNCTION public.increment_affiliate_earnings(
  p_affiliate_id BIGINT,
  p_referral_id  BIGINT,
  p_amount_usd   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Sumar al total del programa (todos los referrals)
  UPDATE public.affiliate_programs
  SET total_earned_usd = COALESCE(total_earned_usd, 0) + p_amount_usd
  WHERE id = p_affiliate_id;

  -- Sumar al total del referral específico (este creator)
  UPDATE public.affiliate_referrals
  SET total_commission_usd = COALESCE(total_commission_usd, 0) + p_amount_usd
  WHERE id = p_referral_id;
END $$;

COMMENT ON FUNCTION public.increment_affiliate_earnings IS
  'Suma comisión a affiliate_programs.total_earned_usd y affiliate_referrals.total_commission_usd atómicamente.';
