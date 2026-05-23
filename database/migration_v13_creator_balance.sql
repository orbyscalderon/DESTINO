-- Migration v13: Atomic creator balance operations

-- 1. Atomic check+decrement for creator_earnings.available_balance (for withdrawals/payouts)
-- Returns TRUE if deduction succeeded, FALSE if insufficient balance
CREATE OR REPLACE FUNCTION deduct_creator_balance(p_creator_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE creator_earnings
  SET available_balance = available_balance - p_amount
  WHERE creator_id = p_creator_id
    AND available_balance >= p_amount;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atomic increment for creator_earnings (for tips, gifts, ticket sales)
-- Uses INSERT ... ON CONFLICT DO UPDATE so the read+write is a single atomic statement
CREATE OR REPLACE FUNCTION add_creator_earnings(p_creator_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO creator_earnings (creator_id, total_earned, available_balance, pending_balance, total_paid_out, updated_at)
  VALUES (p_creator_id, p_amount, p_amount, 0, 0, NOW())
  ON CONFLICT (creator_id) DO UPDATE
    SET total_earned      = creator_earnings.total_earned      + EXCLUDED.total_earned,
        available_balance = creator_earnings.available_balance + EXCLUDED.available_balance,
        updated_at        = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
