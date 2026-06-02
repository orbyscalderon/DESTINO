-- ────────────────────────────────────────────────────────────────────────────
-- Migration v40 — posts.is_paid + price (fix 500 al crear post)
--
-- El controller createPost intentaba insertar is_paid + price en posts pero
-- esas columnas nunca se crearon en ninguna migración. Causa: 500 al subir
-- una foto desde Inicio/Moments.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price   INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0 AND price <= 99999);

-- Tabla auxiliar: compras de posts pagos (similar a content_purchases pero
-- específica para posts y ya integra el is_purchased que necesita
-- getPostsForViewer)
CREATE TABLE IF NOT EXISTS post_purchases (
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coins       INTEGER NOT NULL CHECK (coins > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_post_purchases_buyer
  ON post_purchases (buyer_id, created_at DESC);

ALTER TABLE post_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post purchases own" ON post_purchases;
CREATE POLICY "post purchases own"
  ON post_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

-- Index para filtrar posts paid rápidamente
CREATE INDEX IF NOT EXISTS idx_posts_paid
  ON posts (created_at DESC) WHERE is_paid = TRUE;
