-- Migration v54 — push notifications multi-device + cleanup
--
-- Problema: push_subscriptions tenía UNIQUE(user_id) → un user con web +
-- mobile + tablet solo recibía push en el último dispositivo registrado
-- (upsert reemplazaba). Resultado: muchas notificaciones no llegan porque
-- el endpoint guardado está stale.
--
-- Fix:
-- · Cambiar UNIQUE a (user_id, endpoint) — el endpoint es único globalmente
--   por suscripción web push.
-- · Añadir last_seen para poder limpiar suscripciones inactivas (>90 días).
-- · Helper para cleanup automático.

-- Detectar el endpoint dentro del JSONB de subscription
-- (subscription.endpoint es el ID único de cada device en Web Push API)

-- Si existe el constraint UNIQUE(user_id) lo quitamos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(user_id)%'
      AND pg_get_constraintdef(oid) NOT LIKE '%endpoint%'
  ) THEN
    -- El nombre exacto puede variar — buscamos por contype y lo droppeamos
    EXECUTE (
      SELECT 'ALTER TABLE public.push_subscriptions DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'public.push_subscriptions'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE '%(user_id)%'
        AND pg_get_constraintdef(oid) NOT LIKE '%endpoint%'
      LIMIT 1
    );
  END IF;
END $$;

-- Columna endpoint generada del JSONB para unicidad eficiente
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint TEXT
    GENERATED ALWAYS AS (subscription ->> 'endpoint') STORED;

-- last_seen para cleanup de suscripciones zombi (browser desinstalado, etc.)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Constraint nuevo: (user_id, endpoint). Permite que un user tenga N devices.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND conname = 'push_subs_user_endpoint_uniq'
  ) THEN
    -- Limpiar duplicados antes de añadir el unique (solo por seguridad)
    DELETE FROM public.push_subscriptions a
    USING public.push_subscriptions b
    WHERE a.id > b.id
      AND a.user_id = b.user_id
      AND a.endpoint = b.endpoint;

    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subs_user_endpoint_uniq UNIQUE (user_id, endpoint);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_last_seen ON public.push_subscriptions(last_seen);

-- Mismo tratamiento para mobile_push_tokens (de la migration v46) —
-- ya tiene UNIQUE(user_id, token) lo cual está bien. Solo añadimos last_seen.
ALTER TABLE public.mobile_push_tokens
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mobile_tokens_user ON public.mobile_push_tokens(user_id);

-- Función de cleanup: borra suscripciones no vistas en 90 días.
-- Se llama desde el cron job cleanup.js del backend.
CREATE OR REPLACE FUNCTION public.cleanup_stale_push_subs()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH del AS (
    DELETE FROM public.push_subscriptions
    WHERE last_seen < NOW() - INTERVAL '90 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM del;

  WITH del2 AS (
    DELETE FROM public.mobile_push_tokens
    WHERE last_seen < NOW() - INTERVAL '90 days'
    RETURNING 1
  )
  SELECT deleted_count + COUNT(*) INTO deleted_count FROM del2;

  RETURN deleted_count;
END $$;

COMMENT ON FUNCTION public.cleanup_stale_push_subs IS 'Borra subscriptions no vistas en 90d. Llamar desde cron job semanal.';
