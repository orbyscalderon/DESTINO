-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Columnas faltantes en show_tickets y content_purchases
-- Seguro re-ejecutar: usa ADD COLUMN IF NOT EXISTS en todo
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. SHOW_TICKETS — buyer_id y platform_fee
--    showController y paymentController insertan buyer_id/platform_fee
--    pero la tabla original tiene user_id sin buyer_id ni platform_fee
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE show_tickets
  ADD COLUMN IF NOT EXISTS buyer_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) DEFAULT 0;

-- Rellenar buyer_id desde user_id para filas existentes
UPDATE show_tickets SET buyer_id = user_id WHERE buyer_id IS NULL AND user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. CONTENT_PURCHASES — content_id, content_type, coins_paid,
--                         platform_fee, amount_paid
--    La tabla original usaba photo_id/coins_spent para fotos de perfil.
--    postController y profileVideoController usan content_id/content_type/coins_paid.
--    paymentController usa amount_paid/platform_fee (pagos Stripe en USD).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE content_purchases
  ADD COLUMN IF NOT EXISTS content_id   uuid,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS coins_paid   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid  numeric(10,2) DEFAULT 0;

-- Rellenar content_id/content_type desde photo_id para filas existentes
UPDATE content_purchases SET
  content_id   = photo_id,
  content_type = 'profile_photo',
  coins_paid   = COALESCE(coins_spent, 0)
WHERE content_id IS NULL AND photo_id IS NOT NULL;
