-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Correcciones de esquema (2026-05-23)
-- Ejecutar DESPUÉS de 20260523_complete_schema.sql
-- Corrige columnas cuyo nombre real difiere del SQL inicial.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. PROFILES — columnas extra del sistema de creadores
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id          text,
  ADD COLUMN IF NOT EXISTS stripe_account_status      text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS creator_bio                text,
  ADD COLUMN IF NOT EXISTS creator_subscription_price numeric(10,2);

-- ─────────────────────────────────────────────────────────────────────
-- 2. CREATOR_EARNINGS — renombrar columnas para que coincidan con el backend
--    El backend usa: total_earned, available_balance, pending_balance, total_paid_out
--    (el SQL inicial usaba total_usd, pending_usd, paid_usd)
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  -- Recrear con el esquema correcto si las columnas tienen nombre incorrecto
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='creator_earnings' AND column_name='total_usd') THEN
    ALTER TABLE creator_earnings RENAME COLUMN total_usd     TO total_earned;
    ALTER TABLE creator_earnings RENAME COLUMN pending_usd   TO pending_balance;
    ALTER TABLE creator_earnings RENAME COLUMN paid_usd      TO total_paid_out;
    ALTER TABLE creator_earnings ADD COLUMN IF NOT EXISTS available_balance numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Agregar columnas si aún no existen (tabla ya creada con nombres correctos)
ALTER TABLE creator_earnings
  ADD COLUMN IF NOT EXISTS total_earned      numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_balance numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_balance   numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_out    numeric(10,2) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 3. SHOW_TICKETS — columnas de monetización
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE show_tickets
  ADD COLUMN IF NOT EXISTS amount_paid       numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_earnings  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_at      timestamptz   DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────
-- 4. SHOW_TIPS — columna de ganancias del creador
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE show_tips
  ADD COLUMN IF NOT EXISTS creator_earnings  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_usd        numeric(10,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 5. CONTENT_PURCHASES — columna de ganancias del creador
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE content_purchases
  ADD COLUMN IF NOT EXISTS creator_earnings  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_usd        numeric(10,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 6. CREATOR_SUBSCRIPTIONS — subscription_price (el backend usa este nombre)
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='creator_subscriptions' AND column_name='price_usd') THEN
    ALTER TABLE creator_subscriptions RENAME COLUMN price_usd TO subscription_price;
  END IF;
END $$;

ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS subscription_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- 7. PROFILE_PHOTOS — columna is_free derivada del price
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS is_free boolean GENERATED ALWAYS AS (price = 0) STORED;

-- ─────────────────────────────────────────────────────────────────────
-- 8. RPC: add_creator_earnings — añade ganancias al balance del creador
--    Llamado por upsertCreatorEarnings() en showController.js
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_creator_earnings(p_creator_id UUID, p_amount FLOAT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO creator_earnings (creator_id, total_earned, available_balance, pending_balance, total_paid_out)
  VALUES (p_creator_id, p_amount, p_amount, 0, 0)
  ON CONFLICT (creator_id) DO UPDATE
  SET total_earned      = creator_earnings.total_earned      + EXCLUDED.total_earned,
      available_balance = creator_earnings.available_balance + EXCLUDED.available_balance,
      updated_at        = now();
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 9. CREATOR_EARNINGS — asegurar columna updated_at
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE creator_earnings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────
-- 10. PPV_UNLOCKS — renombrar creator_earnings → creator_earnings (ya ok)
--     Verificar que ppv_unlocks tiene la columna correcta
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE ppv_unlocks
  ADD COLUMN IF NOT EXISTS creator_earnings numeric(10,2);

-- ─────────────────────────────────────────────────────────────────────
-- 11. MESSAGES — columna ppv_media_url ya debería existir, confirmar
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ppv_media_url text;

-- ─────────────────────────────────────────────────────────────────────
-- 12. SHOW_GIFTS — columna amount_usd para el registro en USD
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE show_gifts
  ADD COLUMN IF NOT EXISTS amount_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_earnings numeric(10,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 13. REPORTS — columna reported_type para diferenciar tipo de denuncia
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'user'
    CHECK (report_type IN ('user','post','comment','show','story'));

-- ─────────────────────────────────────────────────────────────────────
-- 14. SUBSCRIPTIONS — columna stripe_customer_id en profiles también
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- ─────────────────────────────────────────────────────────────────────
-- 15. Índices adicionales para las nuevas columnas
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator   ON creator_earnings(creator_id);
CREATE INDEX IF NOT EXISTS idx_show_tickets_purchased_at  ON show_tickets(purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_purchases_seller   ON content_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_show_tips_creator          ON show_tips(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_creator       ON creator_subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_subs_subscriber    ON creator_subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_acc        ON profiles(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
