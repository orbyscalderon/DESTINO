-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Storage: Buckets + Políticas (2026-05-23)
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Bucket público DESTINO
--    Contiene: avatars, photos, posts, stories, chat-images, chat-audio, show-covers
--    Acceso: URLs públicas directas (no sensibles al robo de URL)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'DESTINO',
  'DESTINO',
  true,
  52428800,    -- 50 MB por archivo
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public          = true,
      file_size_limit = 52428800;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Bucket PRIVADO DESTINO-PPV
--    Contiene: contenido PPV de pago ({matchId}/{filename})
--    Acceso: SOLO mediante signed URLs generadas por el backend en el unlock.
--    public=false → el endpoint /object/public/ devuelve 400; no hay URL directa.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'DESTINO-PPV',
  'DESTINO-PPV',
  false,
  52428800,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public          = false,
      file_size_limit = 52428800;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Políticas — bucket DESTINO (público)
--
-- Carpetas:
--   avatars/{userId}.*          → avatar del perfil
--   photos/{userId}/{filename}  → galería de fotos
--   posts/{userId}/{filename}   → posts / momentos
--   stories/{userId}/{filename} → stories
--   chat-images/{matchId}/...   → imágenes en chat  (solo backend)
--   chat-audio/{matchId}/...    → audio en chat     (solo backend)
--   show-covers/{showId}.*      → portada de show
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "DESTINO: public read"          ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner update"         ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner delete"         ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: service_role all"     ON storage.objects;

-- 3a. Lectura pública
CREATE POLICY "DESTINO: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'DESTINO');

-- 3b. Upload autenticado — el usuario solo puede escribir en su propia carpeta
--     El backend (service_role) bypasea esta política en sus propias subidas.
CREATE POLICY "DESTINO: authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'DESTINO'
  AND (
    -- avatars/{userId}.ext
    (storage.foldername(name))[1] = 'avatars'
    -- photos/{userId}/...  — segundo segmento = uid del caller
    OR (
      (storage.foldername(name))[1] = 'photos'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    -- posts/{userId}/...
    OR (
      (storage.foldername(name))[1] = 'posts'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    -- stories/{userId}/...
    OR (
      (storage.foldername(name))[1] = 'stories'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
    -- show-covers/{showId}.*  (propiedad verificada en la capa de aplicación)
    OR (storage.foldername(name))[1] = 'show-covers'
    -- chat-images y chat-audio: SOLO service_role (backend); no se incluyen aquí
  )
);

-- 3c. Update / Delete: solo el propietario
CREATE POLICY "DESTINO: owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'DESTINO' AND owner = auth.uid());

CREATE POLICY "DESTINO: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'DESTINO' AND owner = auth.uid());

-- 3d. service_role — acceso total al bucket público
CREATE POLICY "DESTINO: service_role all"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'DESTINO')
WITH CHECK (bucket_id = 'DESTINO');

-- ─────────────────────────────────────────────────────────────────────
-- 4. Políticas — bucket DESTINO-PPV (privado)
--
--    Solo service_role puede subir y generar signed URLs.
--    Sin política permisiva para authenticated/anon → denegado por defecto (RLS).
--    Los usuarios acceden al contenido ÚNICAMENTE mediante signed URLs
--    devueltas por el endpoint /api/messages/ppv/:id/unlock.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "DESTINO-PPV: service_role all" ON storage.objects;

CREATE POLICY "DESTINO-PPV: service_role all"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'DESTINO-PPV')
WITH CHECK (bucket_id = 'DESTINO-PPV');
