-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Columnas faltantes y RPCs faltantes (2026-05-24)
-- Seguro re-ejecutar: usa IF NOT EXISTS / OR REPLACE en todo
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. STORIES — is_adult y views_count
--    storyController.js inserta is_adult y selecciona views_count
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS is_adult    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 2. STORY_VIEWS — viewed_at
--    storyController.js selecciona 'viewed_at'; la tabla tiene 'created_at'
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE story_views
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz DEFAULT now();

-- Rellenar viewed_at con created_at para filas existentes
UPDATE story_views SET viewed_at = created_at WHERE viewed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC: update_story_views
--    storyController.js: supabase.rpc('update_story_views', {p_story_id, p_delta})
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_story_views(p_story_id UUID, p_delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE stories
  SET views_count = GREATEST(0, COALESCE(views_count, 0) + p_delta)
  WHERE id = p_story_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC: deduct_creator_balance
--    creatorController.js y withdrawalController.js
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deduct_creator_balance(p_creator_id UUID, p_amount FLOAT)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance numeric(10,2);
BEGIN
  SELECT available_balance INTO v_balance
  FROM creator_earnings
  WHERE creator_id = p_creator_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE creator_earnings
  SET available_balance = available_balance - p_amount,
      updated_at = now()
  WHERE creator_id = p_creator_id;

  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: increment_creator_earnings
--    tipController.js: supabase.rpc('increment_creator_earnings', {p_creator_id, p_amount})
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_creator_earnings(p_creator_id UUID, p_amount FLOAT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO creator_earnings (creator_id, total_earned, available_balance, pending_balance, total_paid_out)
  VALUES (p_creator_id, p_amount, p_amount, 0, 0)
  ON CONFLICT (creator_id) DO UPDATE
  SET total_earned      = creator_earnings.total_earned      + p_amount,
      available_balance = creator_earnings.available_balance + p_amount,
      updated_at        = now();
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. CREATOR_GALLERIES — columnas faltantes usadas por el backend
--    schema original solo tiene: id, creator_id, title, price, is_adult, created_at
--    backend usa: price_coins, description, cover_url, items_count
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE creator_galleries
  ADD COLUMN IF NOT EXISTS price_coins  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS cover_url    text,
  ADD COLUMN IF NOT EXISTS items_count  integer NOT NULL DEFAULT 0;

-- Migrar price → price_coins para registros existentes
UPDATE creator_galleries SET price_coins = price WHERE price_coins = 0 AND price > 0;

-- Sincronizar items_count con registros existentes
UPDATE creator_galleries cg
SET items_count = (
  SELECT COUNT(*) FROM gallery_items gi WHERE gi.gallery_id = cg.id
);

-- ─────────────────────────────────────────────────────────────────────
-- 7. PROFILES — columnas adicionales usadas por el backend
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_fa_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_fa_secret   text,
  ADD COLUMN IF NOT EXISTS login_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at   timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- 8. POSTS — columna media_urls (array para múltiples imágenes)
--    postController.js usa media_urls jsonb
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS media_urls    jsonb   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 9. MESSAGES — columnas extras opcionales
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 10. MATCHES — columna last_message_at para ordenar conversaciones
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS last_message_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_message_text  text,
  ADD COLUMN IF NOT EXISTS unread_count_1     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_count_2     integer NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- 11. RPC: update_post_comments — ya definida en complete_schema pero por si acaso
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_post_comments(p_post_id UUID, p_delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE posts
  SET comments_count = GREATEST(0, COALESCE(comments_count, 0) + p_delta)
  WHERE id = p_post_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 12. SHOW_INTERESTS — tabla de intereses de shows para espectadores
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS show_interests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id    uuid NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (show_id, user_id)
);
ALTER TABLE show_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "show_interests_own" ON show_interests;
CREATE POLICY "show_interests_own" ON show_interests
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 13. PROFILE_VIDEOS — asegurar RLS policies
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profile_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile_videos_select_all" ON profile_videos;
CREATE POLICY "profile_videos_select_all" ON profile_videos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profile_videos_own_write" ON profile_videos;
CREATE POLICY "profile_videos_own_write" ON profile_videos
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 14. VIDEO_REQUESTS — asegurar RLS policies
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_requests_parties" ON video_requests;
CREATE POLICY "video_requests_parties" ON video_requests
  FOR ALL TO authenticated
  USING (requester_id = auth.uid() OR creator_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 15. CONTENT_PURCHASES — asegurar RLS policies
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE content_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_purchases_buyer" ON content_purchases;
CREATE POLICY "content_purchases_buyer" ON content_purchases
  FOR SELECT TO authenticated USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "content_purchases_service_role" ON content_purchases;
CREATE POLICY "content_purchases_service_role" ON content_purchases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 16. GALLERY_ITEMS — RLS policies
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gallery_items_service_role" ON gallery_items;
CREATE POLICY "gallery_items_service_role" ON gallery_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gallery_items_select_all" ON gallery_items;
CREATE POLICY "gallery_items_select_all" ON gallery_items
  FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────
-- 17. GALLERY_PURCHASES — RLS policies (service_role + buyer)
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gallery_purchases_select" ON gallery_purchases;
CREATE POLICY "gallery_purchases_select" ON gallery_purchases
  FOR SELECT TO authenticated USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "gallery_purchases_service_role_all" ON gallery_purchases;
CREATE POLICY "gallery_purchases_service_role_all" ON gallery_purchases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 18. PROFILES — followers_count y following_count
--    user_follows ya existe; solo añadir columnas de contador
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer NOT NULL DEFAULT 0;

-- Sincronizar contadores con datos existentes en user_follows
UPDATE profiles p SET
  followers_count = (SELECT COUNT(*) FROM user_follows f WHERE f.following_id = p.id),
  following_count = (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id  = p.id);
