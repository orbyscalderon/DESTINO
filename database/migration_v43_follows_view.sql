-- ────────────────────────────────────────────────────────────────────────────
-- Migration v43 — VIEW follows (compat shim para user_follows)
--
-- Bug: en v36 y v39 creé RPCs (rank_reels_for_user, reels_following_feed)
-- que referencian la tabla `follows`, pero la tabla real en la app se llama
-- `user_follows` (creada en v14). Resultado: error "relation follows does
-- not exist" al cargar el feed de Reels.
--
-- Fix: crear una VISTA `follows` que apunta a `user_follows` con los mismos
-- nombres de columna. Así NO hay que reescribir los RPCs ni el código
-- backend que pueda asumir el nombre.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW follows AS
  SELECT
    id,
    follower_id,
    following_id,
    created_at
  FROM user_follows;

-- La vista hereda los permisos de la tabla base. Para que los RPCs
-- SECURITY DEFINER puedan leer, RLS de user_follows ya lo cubre.
GRANT SELECT ON follows TO anon, authenticated, service_role;
