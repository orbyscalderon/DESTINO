-- ────────────────────────────────────────────────────────────────────────────
-- Migration v49 — Goals de gift por show
--
-- Permite al host definir metas tipo "10 corazones → cambio outfit", "50 →
-- quito prenda", etc. Cuando un viewer manda un gift que matchea el tipo,
-- el progreso aumenta. Al alcanzar el target, se broadcast como animación.
--
-- Formato del campo jsonb:
-- [
--   {
--     "id": "uuid",
--     "gift_type": "rose" | "heart" | "diamond" | "crown" | "<custom_id>",
--     "target_count": 10,
--     "current_count": 0,
--     "reward_text": "Cambio de outfit",
--     "completed": false
--   },
--   ...
-- ]
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS gift_goals JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN live_shows.gift_goals IS
  'Array de goals que el host define para su show. Cada goal trackea
   progreso de un tipo de gift hasta alcanzar target_count → broadcast.';
