-- v21: Mejoras de seguridad

-- 1. Unique constraint en ppv_unlocks para prevenir double-spend por race condition
DO $$ BEGIN
  ALTER TABLE ppv_unlocks ADD CONSTRAINT ppv_unlocks_message_buyer_unique UNIQUE (message_id, buyer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 2. Unique constraint en content_purchases (foto) para prevenir compra doble
DO $$ BEGIN
  ALTER TABLE content_purchases ADD CONSTRAINT content_purchases_unique UNIQUE (buyer_id, content_type, content_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 3. Índice en ppv_unlocks para lookups rápidos
CREATE INDEX IF NOT EXISTS idx_ppv_unlocks_message_buyer
  ON ppv_unlocks(message_id, buyer_id);
