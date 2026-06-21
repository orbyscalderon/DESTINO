-- ═══════════════════════════════════════════════════════════════════════
-- Destino — profile_photos: añadir storage_path
-- uploadPhoto y deletePhoto usan storage_path para gestionar el fichero
-- en el bucket DESTINO. Sin esta columna el INSERT falla con 500.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS storage_path text;

NOTIFY pgrst, 'reload schema';
