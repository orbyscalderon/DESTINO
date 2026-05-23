-- ═══════════════════════════════════════════════════════════════════════
-- Destino — Storage: Bucket + Políticas (2026-05-23)
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Crear el bucket DESTINO si no existe
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'DESTINO',
  'DESTINO',
  true,        -- lectura pública (las URLs son públicas)
  52428800,    -- 50 MB límite por archivo
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm',
    'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 52428800;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Políticas de Storage (via storage.objects)
--
-- Estructura de carpetas en el bucket DESTINO:
--   avatars/{userId}.*          → avatar del perfil
--   photos/{userId}/{filename}  → fotos de galería
--   posts/{userId}/{filename}   → posts / momentos
--   stories/{userId}/{filename} → stories
--   chat-images/{matchId}/...   → imágenes en chat
--   chat-audio/{matchId}/...    → audio en chat
--   ppv/{matchId}/...           → contenido PPV (semi-privado)
--   show-covers/{showId}.*      → portada de show
-- ─────────────────────────────────────────────────────────────────────

-- Eliminar políticas previas si existen para re-crearlas limpias
DROP POLICY IF EXISTS "DESTINO: public read"             ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: authenticated upload"    ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner update"            ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner delete"            ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: service_role all"        ON storage.objects;

-- ── 2a. Lectura pública (todos pueden ver archivos públicos) ──────────
-- Los archivos de ppv/ son excepción — se acceden vía URL firmada generada por el backend
CREATE POLICY "DESTINO: public read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'DESTINO'
  AND (storage.foldername(name))[1] != 'ppv'
);

-- ── 2b. Upload autenticado ────────────────────────────────────────────
-- Cualquier usuario autenticado puede subir a su propia carpeta
CREATE POLICY "DESTINO: authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'DESTINO'
  AND (
    -- avatars: el userId es el nombre base del archivo
    (storage.foldername(name))[1] = 'avatars'
    -- fotos: la carpeta es el userId
    OR (storage.foldername(name))[1] = 'photos'
    -- posts
    OR (storage.foldername(name))[1] = 'posts'
    -- stories
    OR (storage.foldername(name))[1] = 'stories'
    -- show covers
    OR (storage.foldername(name))[1] = 'show-covers'
    -- chat images / audio / ppv — el backend usa service_role, no pasa por aquí
    OR (storage.foldername(name))[1] IN ('chat-images','chat-audio','ppv')
  )
);

-- ── 2c. Update y Delete: solo el propietario o service_role ──────────
CREATE POLICY "DESTINO: owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'DESTINO' AND owner = auth.uid());

CREATE POLICY "DESTINO: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'DESTINO' AND owner = auth.uid());

-- ── 2d. service_role tiene acceso total ──────────────────────────────
CREATE POLICY "DESTINO: service_role all"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'DESTINO')
WITH CHECK (bucket_id = 'DESTINO');
