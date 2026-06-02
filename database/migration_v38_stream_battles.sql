-- ────────────────────────────────────────────────────────────────────────────
-- Migration v38 — Stream Battles 1v1
--
-- Dos creadores en vivo compiten en split-screen durante N minutos.
-- Audiencias votan con coins (tips). El que más recauda gana → boost de
-- exposición + badge. Mecánica viral de TikTok Live/Bigo.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) stream_battles
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stream_battles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host1_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  host2_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Shows en vivo de cada host (LiveKit room para conectarse)
  show1_id        UUID REFERENCES live_shows(id) ON DELETE SET NULL,
  show2_id        UUID REFERENCES live_shows(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
                  -- pending | accepted | live | ended | rejected | cancelled
  duration_minutes INT NOT NULL DEFAULT 5,
  score1_coins    INT NOT NULL DEFAULT 0,
  score2_coins    INT NOT NULL DEFAULT 0,
  winner_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at      TIMESTAMPTZ DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  CHECK (host1_id != host2_id),
  CHECK (duration_minutes BETWEEN 1 AND 30),
  CHECK (status IN ('pending', 'accepted', 'live', 'ended', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_battles_host1 ON stream_battles (host1_id, status, invited_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_host2 ON stream_battles (host2_id, status, invited_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_live  ON stream_battles (status, started_at DESC) WHERE status = 'live';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) battle_tips: tips de viewers durante un battle (por team)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS battle_tips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id   UUID NOT NULL REFERENCES stream_battles(id) ON DELETE CASCADE,
  tipper_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  team        INT NOT NULL CHECK (team IN (1, 2)),  -- 1 = host1, 2 = host2
  coins       INT NOT NULL CHECK (coins > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battle_tips_battle
  ON battle_tips (battle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_battle_tips_tipper
  ON battle_tips (tipper_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE stream_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_tips    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "battles public read" ON stream_battles;
DROP POLICY IF EXISTS "battle tips public read" ON battle_tips;

-- Battles: lectura pública (necesaria para discovery + overlay viewers)
CREATE POLICY "battles public read"
  ON stream_battles FOR SELECT USING (true);

-- Tips: viewers ven los tips del battle (para overlay de últimos tippers)
CREATE POLICY "battle tips public read"
  ON battle_tips FOR SELECT USING (true);

-- Escritura: solo backend con service_role

-- ════════════════════════════════════════════════════════════════════════════
-- 4) RPCs
-- ════════════════════════════════════════════════════════════════════════════

-- Sumar coins al score de un team (incluye insert del tip + counter)
CREATE OR REPLACE FUNCTION battle_add_tip(
  p_battle_id UUID,
  p_tipper_id UUID,
  p_team      INT,
  p_coins     INT
)
RETURNS TABLE (
  success         BOOLEAN,
  error_code      TEXT,
  new_score1      INT,
  new_score2      INT
) AS $$
DECLARE
  battle_record stream_battles%ROWTYPE;
  s1 INT;
  s2 INT;
BEGIN
  -- Lock + status check
  SELECT * INTO battle_record FROM stream_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'BATTLE_NOT_FOUND'::TEXT, 0, 0; RETURN;
  END IF;
  IF battle_record.status != 'live' THEN
    RETURN QUERY SELECT FALSE, 'BATTLE_NOT_LIVE'::TEXT,
      battle_record.score1_coins, battle_record.score2_coins; RETURN;
  END IF;
  IF p_team NOT IN (1, 2) THEN
    RETURN QUERY SELECT FALSE, 'INVALID_TEAM'::TEXT,
      battle_record.score1_coins, battle_record.score2_coins; RETURN;
  END IF;

  -- Insertar tip
  INSERT INTO battle_tips (battle_id, tipper_id, team, coins)
    VALUES (p_battle_id, p_tipper_id, p_team, p_coins);

  -- Actualizar score
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Finalizar battle: marca ended + winner_id (o NULL si empate)
CREATE OR REPLACE FUNCTION battle_end(p_battle_id UUID)
RETURNS TABLE (
  success    BOOLEAN,
  winner_id  UUID,
  score1     INT,
  score2     INT
) AS $$
DECLARE
  b stream_battles%ROWTYPE;
  w UUID;
BEGIN
  SELECT * INTO b FROM stream_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND OR b.status != 'live' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, COALESCE(b.score1_coins, 0), COALESCE(b.score2_coins, 0); RETURN;
  END IF;

  IF b.score1_coins > b.score2_coins THEN w := b.host1_id;
  ELSIF b.score2_coins > b.score1_coins THEN w := b.host2_id;
  ELSE w := NULL; -- empate
  END IF;

  UPDATE stream_battles
    SET status = 'ended', winner_id = w, ended_at = NOW()
    WHERE id = p_battle_id;

  RETURN QUERY SELECT TRUE, w, b.score1_coins, b.score2_coins;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
