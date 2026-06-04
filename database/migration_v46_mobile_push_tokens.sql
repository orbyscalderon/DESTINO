-- ────────────────────────────────────────────────────────────────────────────
-- Migration v46 — Tabla para FCM/APNs tokens de devices nativos
--
-- El backend hasta v45 solo guardaba subscriptions Web Push (VAPID). Ahora
-- los users en Android/iOS via Capacitor envían FCM/APNs tokens que
-- queremos persistir aparte para que el sender (futuro Firebase Admin SDK)
-- pueda decidir qué canal usar.
--
-- Un user puede tener múltiples devices → multiple rows.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mobile_push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user
  ON mobile_push_tokens (user_id);

-- RLS: cada user maneja solo sus tokens
ALTER TABLE mobile_push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tokens own select" ON mobile_push_tokens;
DROP POLICY IF EXISTS "tokens own insert" ON mobile_push_tokens;
DROP POLICY IF EXISTS "tokens own update" ON mobile_push_tokens;
DROP POLICY IF EXISTS "tokens own delete" ON mobile_push_tokens;
CREATE POLICY "tokens own select" ON mobile_push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tokens own insert" ON mobile_push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tokens own update" ON mobile_push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tokens own delete" ON mobile_push_tokens FOR DELETE USING (auth.uid() = user_id);
