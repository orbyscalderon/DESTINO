-- ════════════════════════════════════════════════════════════════════════════
-- Migration v76 — RLS Hardening (auditoría profunda)
--
-- Corrige hallazgos CRÍTICOS/ALTOS de la auditoría de RLS:
--   C1. profiles UPDATE permitía cambiar is_admin / coins_balance (escalada).
--   C2. creator_earnings FOR ALL a authenticated → editar balance propio.
--   C3. Funciones SECURITY DEFINER de dinero ejecutables por authenticated.
--   H1. INSERT directo por authenticated en tablas de acceso/finanzas
--       (ppv_unlocks, content_purchases, coin_transactions, show_tips,
--        show_gifts, creator_payouts) → bypass de paywall / ledger falso.
--   M1. Tablas sin RLS.
--   M2. SECURITY DEFINER sin SET search_path (secuestro por shadowing).
--
-- Modelo: TODA escritura de dinero/acceso/privilegios pasa por el backend
-- (service_role, que bypassa RLS). El rol `authenticated` solo debe LEER.
-- Verificado: el frontend NO hace .rpc() ni escrituras directas a estas tablas.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- C1. profiles: impedir que el usuario modifique columnas privilegiadas.
--     La policy USING(auth.uid()=id) no restringe columnas. Trigger que
--     revierte cambios a columnas sensibles salvo desde service_role.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo se restringe a los roles alcanzables vía PostgREST con JWT de usuario.
  -- service_role (backend), postgres y los owners de funciones SECURITY DEFINER
  -- (p.ej. spend_coins / add_coins mutan coins_balance legítimamente) pasan.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- authenticated / anon: forzar columnas sensibles a su valor anterior
  NEW.is_admin            := OLD.is_admin;
  NEW.coins_balance       := OLD.coins_balance;
  NEW.is_verified         := OLD.is_verified;
  NEW.verification_status := OLD.verification_status;
  NEW.age_verified_at     := OLD.age_verified_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_privileged ON public.profiles;
CREATE TRIGGER trg_guard_profiles_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_cols();

-- ─────────────────────────────────────────────────────────────────────────
-- C1b. profiles SELECT: la tabla base contiene PII (date_of_birth, coins_balance,
--      is_admin, verification_status, referred_by). Había una policy
--      `profiles_select_all TO authenticated USING(true)` → cualquier usuario
--      logueado podía leer TODAS las columnas de TODOS los perfiles y cosechar
--      fechas de nacimiento, balances, etc.
--      Fix: lectura de la tabla base SOLO de la fila propia. Para ver perfiles
--      ajenos, los clientes usan la vista `profiles_public` (columnas seguras),
--      que ya está GRANTeada a anon/authenticated y es security_invoker (v72).
--      Verificado: el frontend solo lee su propia fila (.eq('id', uid)).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_all"                          ON public.profiles;
DROP POLICY IF EXISTS "Profiles visibles para todos los autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visibles para todos"                  ON public.profiles;
DROP POLICY IF EXISTS "profiles public limited read"                  ON public.profiles;
DROP POLICY IF EXISTS "profiles own full read"                        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"                           ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────
-- C2 + H1. Reemplazar policies de escritura permisivas por SOLO-LECTURA
--          para authenticated. service_role conserva acceso total.
-- ─────────────────────────────────────────────────────────────────────────

-- creator_earnings: quitar el FOR ALL, dejar solo SELECT propio
DROP POLICY IF EXISTS "Creador actualiza sus ganancias" ON public.creator_earnings;
DROP POLICY IF EXISTS "Creador ve sus ganancias"        ON public.creator_earnings;
DROP POLICY IF EXISTS "creator_earnings_select_own"     ON public.creator_earnings;
CREATE POLICY "creator_earnings_select_own"
  ON public.creator_earnings FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

-- ppv_unlocks: el backend inserta (service_role). authenticated solo lee.
DROP POLICY IF EXISTS "Buyer desbloquea PPV"     ON public.ppv_unlocks;
DROP POLICY IF EXISTS "ppv_unlocks_select_own"   ON public.ppv_unlocks;
CREATE POLICY "ppv_unlocks_select_own"
  ON public.ppv_unlocks FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- content_purchases: quitar INSERT del cliente (las policies SELECT se conservan)
DROP POLICY IF EXISTS "Sistema inserta compras" ON public.content_purchases;

-- coin_transactions: ledger — authenticated NO debe insertar
DROP POLICY IF EXISTS "Sistema inserta transacciones" ON public.coin_transactions;

-- show_tips / show_gifts: el backend registra tras cobrar coins
DROP POLICY IF EXISTS "Tipper inserta tip"  ON public.show_tips;
DROP POLICY IF EXISTS "show_gifts_insert"   ON public.show_gifts;

-- creator_payouts: la solicitud de retiro se valida contra balance real en backend
DROP POLICY IF EXISTS "Creador inserta retiro" ON public.creator_payouts;

-- ─────────────────────────────────────────────────────────────────────────
-- C3. Revocar EXECUTE de las funciones invocadas por el backend a
--     anon/authenticated, y garantizar EXECUTE a service_role.
--     Se resuelven las firmas dinámicamente (maneja overloads).
--     Verificado: el frontend no llama .rpc(); ninguna de estas funciones
--     se referencia dentro de policies RLS ni vistas.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  target_names TEXT[] := ARRAY[
    'add_creator_earnings','apply_auto_payout','battle_end','deduct_creator_balance',
    'generate_transparency_report','gift_subscription_atomic','has_valid_tax_form',
    'increment_affiliate_earnings','increment_balance','increment_coins',
    'increment_creator_earnings','increment_dmca_strike','increment_failed_renewal',
    'increment_fan_stats','increment_message_count','increment_profile_views',
    'increment_reel_comment_likes','increment_reel_comments','increment_reel_likes',
    'increment_reel_reply_count','increment_reel_views','increment_vault_use',
    'increment_video_views','purchase_sticker_pack','rank_reels_for_user',
    'reels_following_feed','spend_coins','sum_user_spent_usd','tip_battle_atomic',
    'transfer_coins','update_post_comments','update_post_likes','update_post_views',
    'update_story_views','upsert_video_rating','add_bonus_likes_atomic'
  ];
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- M2. Fijar search_path en TODAS las funciones SECURITY DEFINER de public
--     que no lo tengan. Hardening puro: nunca rompe funciones bien escritas.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- M1. Tablas sin RLS → habilitar + policies mínimas.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.creator_gifts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.video_packages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.post_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.show_poll_votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.show_chat_user_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reel_comment_mentions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.video_processing_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fucknow_moderation_log ENABLE ROW LEVEL SECURITY;

-- Lectura pública de catálogos de creador (gifts/packages)
DROP POLICY IF EXISTS creator_gifts_read ON public.creator_gifts;
CREATE POLICY creator_gifts_read ON public.creator_gifts
  FOR SELECT USING (true);
DROP POLICY IF EXISTS creator_gifts_service ON public.creator_gifts;
CREATE POLICY creator_gifts_service ON public.creator_gifts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS video_packages_read ON public.video_packages;
CREATE POLICY video_packages_read ON public.video_packages
  FOR SELECT USING (true);
DROP POLICY IF EXISTS video_packages_service ON public.video_packages;
CREATE POLICY video_packages_service ON public.video_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tablas internas: solo backend (default-deny para authenticated)
DROP POLICY IF EXISTS post_views_service ON public.post_views;
CREATE POLICY post_views_service ON public.post_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS show_poll_votes_service ON public.show_poll_votes;
CREATE POLICY show_poll_votes_service ON public.show_poll_votes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS show_poll_votes_read_own ON public.show_poll_votes;
CREATE POLICY show_poll_votes_read_own ON public.show_poll_votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS show_chat_user_state_service ON public.show_chat_user_state;
CREATE POLICY show_chat_user_state_service ON public.show_chat_user_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS reel_comment_mentions_service ON public.reel_comment_mentions;
CREATE POLICY reel_comment_mentions_service ON public.reel_comment_mentions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS reel_comment_mentions_read ON public.reel_comment_mentions;
CREATE POLICY reel_comment_mentions_read ON public.reel_comment_mentions
  FOR SELECT TO authenticated USING (auth.uid() = mentioned_id OR auth.uid() = mentioned_by);

DROP POLICY IF EXISTS video_processing_jobs_service ON public.video_processing_jobs;
CREATE POLICY video_processing_jobs_service ON public.video_processing_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fucknow_moderation_log_service ON public.fucknow_moderation_log;
CREATE POLICY fucknow_moderation_log_service ON public.fucknow_moderation_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- M3. storage.objects: el frontend NUNCA sube a storage directamente (todo
--     pasa por el backend API con service_role). Las policies de escritura
--     para `authenticated` solo eran superficie de ataque (permitían nombre
--     de archivo arbitrario en avatars/ y show-covers/, p.ej. sobrescribir/
--     crear objetos ajenos). Se eliminan; quedan lectura pública + service_role.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "DESTINO: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner update"         ON storage.objects;
DROP POLICY IF EXISTS "DESTINO: owner delete"         ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────
-- C4. Vista public.users_without_dob → FUGA DE EMAILS (Supabase linter:
--     "Security Definer View" + "Exposed Auth Users").
--     La vista hace JOIN a auth.users(email), es SECURITY DEFINER (corre como
--     owner → bypassa RLS y lee auth.users) y vive en `public` (PostgREST la
--     expone). Sin REVOKE, hereda el GRANT SELECT por defecto a anon/authenticated
--     → cualquiera con la anon key podía volcar el email de todos los usuarios
--     vía GET /rest/v1/users_without_dob.
--     No la usa ninguna app (era un helper de admin). Se elimina.
--     Si se necesita de nuevo, recrearla en un esquema PRIVADO no expuesto a
--     PostgREST (ej: `private.users_without_dob`) y consultarla solo desde el
--     backend con service_role — nunca en `public`.
-- ─────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.users_without_dob;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verificación post-migración (ejecutar aparte, deben devolver 0 filas):
--
--   -- Tablas públicas sin RLS:
--   SELECT tablename FROM pg_tables t
--   WHERE schemaname='public'
--     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--                     WHERE c.relname=t.tablename AND n.nspname='public' AND c.relrowsecurity);
--
--   -- SECURITY DEFINER sin search_path:
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef
--     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
-- ════════════════════════════════════════════════════════════════════════════
