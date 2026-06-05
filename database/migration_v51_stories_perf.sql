-- Migration v51 — perf de stories
--
-- listStories filtra siempre por user_id IN (...) AND expires_at > NOW(),
-- y la tabla puede crecer significativamente (cada usuario activo sube ~1
-- story/día). Un index compuesto sobre (user_id, expires_at DESC) acelera
-- la query sin necesidad de cleanup constante de filas expiradas.
--
-- También un index sobre messages.reply_to_story_id para que la columna
-- (existente pero sin index) no sea full-scan al unirse con stories.

CREATE INDEX IF NOT EXISTS idx_stories_user_expires
  ON public.stories(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_views_story
  ON public.story_views(story_id);

-- reply_to_story_id existe en messages — añadimos index si la columna está
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'reply_to_story_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_messages_reply_to_story
      ON public.messages(reply_to_story_id)
      WHERE reply_to_story_id IS NOT NULL;
  END IF;
END $$;
