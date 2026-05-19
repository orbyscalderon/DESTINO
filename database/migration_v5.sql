-- ============================================================
-- MIGRACIÓN v5 — Índices de rendimiento
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Índice en last_active para queries de "usuarios en línea"
CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON profiles(last_active DESC);

-- Índice en created_at de messages para la paginación con cursor
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages(match_id, created_at DESC);

-- Índice en created_at de matches para ordenar por actividad reciente
CREATE INDEX IF NOT EXISTS idx_matches_created_at
  ON matches(created_at DESC);
