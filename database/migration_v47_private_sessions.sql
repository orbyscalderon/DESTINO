-- ────────────────────────────────────────────────────────────────────────────
-- Migration v47 — Sesiones privadas (private / exclusive cam2cam)
--
-- Cuando un host acepta un request de show privado:
--   · Se genera un roomId nuevo (`show_<id>_priv_<viewerId>`).
--   · El host y el viewer aceptado se reconectan a ese room.
--   · Los demás viewers son expulsados del room público (broadcast).
--   · En 'exclusive' (cam2cam) el viewer también publica su cámara.
--
-- Esta tabla guarda la sesión activa de cada show (1 a la vez). El campo
-- jsonb data permite extender sin migrations futuras (started_at, tokens,
-- consents, etc.).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS private_session JSONB DEFAULT NULL;

-- Estructura esperada:
-- {
--   "viewer_id": "uuid",
--   "type": "private" | "exclusive",
--   "room_id": "show_<showId>_priv_<viewerId>",
--   "rate": int,
--   "started_at": "ISO timestamp"
-- }

COMMENT ON COLUMN live_shows.private_session IS
  'Sesión privada activa: {viewer_id, type, room_id, rate, started_at}. NULL = show público.';

CREATE INDEX IF NOT EXISTS idx_live_shows_private_viewer
  ON live_shows ((private_session ->> 'viewer_id'))
  WHERE private_session IS NOT NULL;
