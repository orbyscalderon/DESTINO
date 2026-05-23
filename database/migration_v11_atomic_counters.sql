-- ============================================================
-- MIGRACIÓN v11: Funciones atómicas para contadores de likes/comentarios
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- Actualiza likes_count de un post de forma atómica
CREATE OR REPLACE FUNCTION update_post_likes(p_post_id UUID, p_delta INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET likes_count = GREATEST(0, likes_count + p_delta) WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualiza comments_count de un post de forma atómica
CREATE OR REPLACE FUNCTION update_post_comments(p_post_id UUID, p_delta INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET comments_count = GREATEST(0, comments_count + p_delta) WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualiza views_count de una story de forma atómica
CREATE OR REPLACE FUNCTION update_story_views(p_story_id UUID, p_delta INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE stories SET views_count = GREATEST(0, views_count + p_delta) WHERE id = p_story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
