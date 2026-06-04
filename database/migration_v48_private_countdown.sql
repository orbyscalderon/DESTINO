-- ────────────────────────────────────────────────────────────────────────────
-- Migration v48 — Configurable countdown del show privado/exclusivo
--
-- El host puede ajustar cuántos segundos dura el countdown que ven los
-- viewers antes de que se aplique el cambio de modo (kick + reconnect para
-- exclusive, compra de ticket para private). Rango 5–180 segundos.
-- Default 10 (igual que antes para no romper shows existentes).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS private_countdown_sec INT NOT NULL DEFAULT 10;

ALTER TABLE live_shows
  DROP CONSTRAINT IF EXISTS live_shows_private_countdown_sec_check;

ALTER TABLE live_shows
  ADD CONSTRAINT live_shows_private_countdown_sec_check
  CHECK (private_countdown_sec BETWEEN 5 AND 180);

COMMENT ON COLUMN live_shows.private_countdown_sec IS
  'Segundos de countdown antes de aplicar el cambio a modo privado/exclusivo. Rango 5-180s. Default 10.';
