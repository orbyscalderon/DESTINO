-- Migration v9: Verificación y corrección de columnas críticas
-- Ejecutar en Supabase > SQL Editor
-- Es seguro re-ejecutar: usa ADD COLUMN IF NOT EXISTS

-- Columnas de creadores (de v5)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_creator            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_account_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS creator_bio           TEXT;

-- Columnas de coins y adulto (de v6)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coins_balance               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_adult_creator            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS creator_subscription_price  NUMERIC(10,2) DEFAULT NULL;

-- Tabla creator_earnings (de v5)
CREATE TABLE IF NOT EXISTS creator_earnings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  total_earned      NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_balance   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_paid_out    NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar que creator_earnings tenga RLS habilitado
ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;

-- Política para que el service role (backend) pueda hacer todo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'creator_earnings' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all ON creator_earnings FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Política para que el creador vea sus propios datos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'creator_earnings' AND policyname = 'creator_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY creator_select_own ON creator_earnings FOR SELECT TO authenticated USING (auth.uid() = creator_id)';
  END IF;
END $$;
