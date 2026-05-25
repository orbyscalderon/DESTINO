-- ═══════════════════════════════════════════════════════════════════════
-- Destino — profiles.verification_status
-- paymentController actualiza verification_status para Stripe Identity
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_status text
    CHECK (verification_status IN ('pending', 'verified', 'failed'));

NOTIFY pgrst, 'reload schema';
