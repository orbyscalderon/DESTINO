-- ────────────────────────────────────────────────────────────────────────────
-- Migration v28 — Multi-host shows (co-broadcasting)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS show_co_hosts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id     UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT DEFAULT 'invited', -- invited | accepted | declined | kicked | left
  invited_at  TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  UNIQUE (show_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_show_co_hosts_show  ON show_co_hosts (show_id, status);
CREATE INDEX IF NOT EXISTS idx_show_co_hosts_user  ON show_co_hosts (user_id, status, invited_at DESC);

-- RLS: cualquiera puede leer co-hosts aceptados (es info pública del show);
-- escrituras solo desde backend con service key.
ALTER TABLE show_co_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_hosts public read accepted"
  ON show_co_hosts FOR SELECT USING (status = 'accepted' OR auth.uid() = user_id OR auth.uid() = invited_by);
