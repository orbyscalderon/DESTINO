-- ============================================================
-- DESTINO — Migración v3
-- Ejecutar en: Supabase > SQL Editor
-- Usa IF NOT EXISTS — seguro de correr múltiples veces
-- ============================================================

-- ============================================================
-- 1. Columna country_filter en video_sessions
--    Permite filtrar por país en videollamadas aleatorias
-- ============================================================
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS country_filter TEXT DEFAULT 'any';

CREATE INDEX IF NOT EXISTS idx_video_sessions_country ON video_sessions(country_filter);
