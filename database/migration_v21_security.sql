-- v21: Mejoras de seguridad

-- 1. Unique constraint en ppv_unlocks para prevenir double-spend por race condition
ALTER TABLE ppv_unlocks
  ADD CONSTRAINT IF NOT EXISTS ppv_unlocks_message_buyer_unique
  UNIQUE (message_id, buyer_id);

-- 2. Unique constraint en content_purchases (foto) para prevenir compra doble
ALTER TABLE content_purchases
  ADD CONSTRAINT IF NOT EXISTS content_purchases_unique
  UNIQUE (buyer_id, content_type, content_id);

-- 3. Índice en ppv_unlocks para lookups rápidos
CREATE INDEX IF NOT EXISTS idx_ppv_unlocks_message_buyer
  ON ppv_unlocks(message_id, buyer_id);
