-- ────────────────────────────────────────────────────────────────────────────
-- Migration v44 — Fixes de auditoría: RPCs faltantes + atomicidad tipBattle
--
-- 1) sum_user_spent_usd          — usada en showController, nunca creada
-- 2) increment_failed_renewal    — usada en paymentController, nunca creada
-- 3) tip_battle_atomic           — reemplaza el flujo de 3 ops separadas
--                                  en battlesController.tipBattle (B3)
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) sum_user_spent_usd — total gastado en coins (USD equivalente)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sum_user_spent_usd(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_coins INT;
BEGIN
  -- Sumar TODOS los tipos de "gasto" del user (amounts negativos)
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO total_coins
  FROM coin_transactions
  WHERE user_id = p_user_id
    AND amount < 0;  -- gastos siempre negativos
  -- 1 coin = $0.05 USD
  RETURN total_coins * 0.05;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) increment_failed_renewal — incrementa contador atómico para reintento
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_failed_renewal(p_sub_id UUID)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE creator_subscriptions
    SET failed_renewal_count = COALESCE(failed_renewal_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_sub_id
    RETURNING failed_renewal_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar que la columna existe (defensiva)
ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS failed_renewal_count INT DEFAULT 0;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) tip_battle_atomic — flujo completo de tip en battle en UNA transacción
--    Resuelve B3: race condition entre spendCoins + addCoins + score update.
--    Si CUALQUIER paso falla, todo se revierte (no más coins perdidos).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tip_battle_atomic(
  p_battle_id      UUID,
  p_tipper_id      UUID,
  p_team           INT,
  p_coins          INT,
  p_creator_coins  INT  -- 70% del tip que va al host del team
)
RETURNS TABLE (
  success      BOOLEAN,
  error_code   TEXT,
  new_score1   INT,
  new_score2   INT
) AS $$
DECLARE
  battle_rec   stream_battles%ROWTYPE;
  tipper_bal   INT;
  host_id      UUID;
  s1 INT;
  s2 INT;
BEGIN
  -- Lock del battle (FOR UPDATE) + validaciones
  SELECT * INTO battle_rec FROM stream_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'BATTLE_NOT_FOUND'::TEXT, 0, 0; RETURN;
  END IF;
  IF battle_rec.status != 'live' THEN
    RETURN QUERY SELECT FALSE, 'BATTLE_NOT_LIVE'::TEXT,
      battle_rec.score1_coins, battle_rec.score2_coins; RETURN;
  END IF;
  IF p_team NOT IN (1, 2) THEN
    RETURN QUERY SELECT FALSE, 'INVALID_TEAM'::TEXT,
      battle_rec.score1_coins, battle_rec.score2_coins; RETURN;
  END IF;

  host_id := CASE WHEN p_team = 1 THEN battle_rec.host1_id ELSE battle_rec.host2_id END;
  IF host_id = p_tipper_id THEN
    RETURN QUERY SELECT FALSE, 'CANNOT_TIP_SELF'::TEXT,
      battle_rec.score1_coins, battle_rec.score2_coins; RETURN;
  END IF;

  -- Spend coins del tipper (con lock atómico)
  SELECT coins_balance INTO tipper_bal FROM profiles WHERE id = p_tipper_id FOR UPDATE;
  IF tipper_bal IS NULL OR tipper_bal < p_coins THEN
    RETURN QUERY SELECT FALSE, 'INSUFFICIENT_COINS'::TEXT,
      battle_rec.score1_coins, battle_rec.score2_coins; RETURN;
  END IF;
  UPDATE profiles SET coins_balance = coins_balance - p_coins WHERE id = p_tipper_id;
  INSERT INTO coin_transactions (user_id, amount, type, reference_id)
    VALUES (p_tipper_id, -p_coins, 'battle_tip', p_battle_id);

  -- Add coins al host (70%)
  UPDATE profiles SET coins_balance = coins_balance + p_creator_coins WHERE id = host_id;
  INSERT INTO coin_transactions (user_id, amount, type, reference_id)
    VALUES (host_id, p_creator_coins, 'tip_received', p_battle_id);

  -- Registrar tip + actualizar score atómicamente
  INSERT INTO battle_tips (battle_id, tipper_id, team, coins)
    VALUES (p_battle_id, p_tipper_id, p_team, p_coins);

  IF p_team = 1 THEN
    UPDATE stream_battles
      SET score1_coins = score1_coins + p_coins
      WHERE id = p_battle_id
      RETURNING score1_coins, score2_coins INTO s1, s2;
  ELSE
    UPDATE stream_battles
      SET score2_coins = score2_coins + p_coins
      WHERE id = p_battle_id
      RETURNING score1_coins, score2_coins INTO s1, s2;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT, s1, s2;
EXCEPTION WHEN OTHERS THEN
  -- PostgreSQL revierte automáticamente la TX entera ante cualquier excepción
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT, 0, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Asegurar que coin_transactions.type acepta 'battle_tip'
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'coin_transactions' AND constraint_name = 'coin_transactions_type_check'
  ) THEN
    ALTER TABLE coin_transactions DROP CONSTRAINT coin_transactions_type_check;
  END IF;

  ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_type_check
    CHECK (type IN (
      'purchase', 'bonus', 'refund', 'boost',
      'tip_sent', 'tip_received',
      'ppv_spent', 'ppv_received',
      'gift_sent', 'gift_received',
      'post_sale', 'post_purchase',
      'video_sale', 'video_purchase',
      'video_request_escrow', 'video_request_refund', 'video_request_sale',
      'private_show', 'private_show_earning',
      'completion_reward',
      'gift_subscription', 'subscription_gift_received',
      'sub_renewal', 'sub_renewal_received',
      'video_call_minute', 'video_call_earning',
      'battle_tip', 'battle_earning'  -- nuevos en v44
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'coin_transactions type CHECK update skipped: %', SQLERRM;
END $$;
