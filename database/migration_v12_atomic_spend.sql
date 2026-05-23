-- Migration v12: Atomic spend_coins + add 'boost' transaction type

-- 1. Atomic check+decrement RPC — eliminates race condition in spendCoins()
CREATE OR REPLACE FUNCTION spend_coins(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE profiles
  SET coins_balance = coins_balance - p_amount
  WHERE id = p_user_id
    AND coins_balance >= p_amount;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Extend coin_transactions.type CHECK to include 'boost'
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_type_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN (
    'purchase', 'tip_sent', 'tip_received',
    'ppv_spent', 'ppv_received', 'refund', 'bonus', 'boost'
  ));
