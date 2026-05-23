-- Agrega la columna para rastrear la sesión de Stripe Identity
ALTER TABLE identity_verifications
  ADD COLUMN IF NOT EXISTS stripe_session_id text;
