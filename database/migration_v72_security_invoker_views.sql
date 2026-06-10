-- ════════════════════════════════════════════════════════════════════════════
-- Migration v72 — Security Definer → Invoker views
--
-- Supabase Security Advisor (CRITICAL) detectó 4 views con SECURITY DEFINER:
--   - public.follows               (v43)
--   - public.profiles_public       (v34)
--   - public.user_consents_current (v67)
--   - public.top_spenders_monthly  (v70)
--
-- Problema: SECURITY DEFINER hace que el view corra con los privilegios del
-- OWNER (postgres/superuser), bypassing las RLS policies del usuario que
-- consulta. Esto es exactamente lo opuesto a lo que queremos: rompe el
-- modelo de seguridad fila-por-fila.
--
-- Fix: cambiar a SECURITY INVOKER (default desde Postgres 15 con la opción
-- explícita), para que cada query respete las RLS del caller.
--
-- Requisitos: Postgres 15+ (Supabase Pro plan usa Postgres 15+).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- En Postgres 15+, ALTER VIEW SET (security_invoker = true) flippa el modo
-- sin necesidad de recrear el view.

DO $$
BEGIN
  -- follows (v43)
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'follows') THEN
    EXECUTE 'ALTER VIEW public.follows SET (security_invoker = true)';
  END IF;

  -- profiles_public (v34)
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'profiles_public') THEN
    EXECUTE 'ALTER VIEW public.profiles_public SET (security_invoker = true)';
  END IF;

  -- user_consents_current (v67)
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_consents_current') THEN
    EXECUTE 'ALTER VIEW public.user_consents_current SET (security_invoker = true)';
  END IF;

  -- top_spenders_monthly (v70)
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'top_spenders_monthly') THEN
    EXECUTE 'ALTER VIEW public.top_spenders_monthly SET (security_invoker = true)';
  END IF;
END $$;

-- Verificación: listar views con security_invoker=off para auditar
-- (la query siguiente devuelve filas si quedó alguna mal — debería ser vacía)
--
--   SELECT n.nspname AS schema, c.relname AS view, c.reloptions AS options
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE c.relkind = 'v'
--     AND n.nspname NOT IN ('pg_catalog', 'information_schema')
--     AND NOT EXISTS (
--       SELECT 1 FROM unnest(c.reloptions) opt
--       WHERE opt LIKE 'security_invoker=%'
--     );

COMMIT;
