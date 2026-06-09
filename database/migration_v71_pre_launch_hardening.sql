-- ════════════════════════════════════════════════════════════════════════════
-- Migration v71 — Pre-launch hardening
--
-- Cierra los gaps de seguridad y performance detectados en la auditoría:
--   1) RLS policies en las 12 tablas v70 que faltaban
--   2) Índices de performance que faltan
--   3) Helper RPCs para incrementFanStats (transaccional)
--   4) updated_at trigger generic
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) RLS en tablas v70 expuestas ─────────────────────────────────────────

-- creator_dm_pricing: solo el creator ve/edita el suyo. Público lee precio para mostrar warning antes de enviar DM.
ALTER TABLE creator_dm_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_pricing public read"  ON creator_dm_pricing FOR SELECT USING (TRUE);
CREATE POLICY "dm_pricing own write"    ON creator_dm_pricing FOR ALL USING (auth.uid() = creator_id);

-- dm_paywall_charges: solo el payer y el receiver pueden leer su historial. Backend escribe via service_role.
ALTER TABLE dm_paywall_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_charges own read" ON dm_paywall_charges
  FOR SELECT USING (auth.uid() = payer_id OR auth.uid() = receiver_id);

-- content_geo_blocks: público lee (necesario para edge check). Solo el creator escribe.
ALTER TABLE content_geo_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_blocks public read" ON content_geo_blocks FOR SELECT USING (TRUE);
CREATE POLICY "geo_blocks own write"   ON content_geo_blocks FOR ALL USING (auth.uid() = creator_id);

-- promo_codes: público lee (necesario para validar al canjear). Solo creator/admin escribe.
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_codes public read" ON promo_codes FOR SELECT USING (active = TRUE);
CREATE POLICY "promo_codes own write"   ON promo_codes FOR ALL
  USING (creator_id IS NOT NULL AND auth.uid() = creator_id);

-- promo_redemptions: solo el user ve sus redenciones.
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_redemptions own read" ON promo_redemptions FOR SELECT USING (auth.uid() = user_id);

-- show_spy_sessions: solo el viewer ve la suya.
ALTER TABLE show_spy_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spy_sessions own read" ON show_spy_sessions FOR SELECT USING (auth.uid() = viewer_id);

-- show_queue_skips: solo el viewer ve los suyos.
ALTER TABLE show_queue_skips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_skips own read" ON show_queue_skips FOR SELECT USING (auth.uid() = viewer_id);

-- creator_auto_replies: solo el creator lee/escribe el suyo.
ALTER TABLE creator_auto_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_replies own" ON creator_auto_replies FOR ALL USING (auth.uid() = creator_id);

-- creator_quick_replies: idem.
ALTER TABLE creator_quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_replies own" ON creator_quick_replies FOR ALL USING (auth.uid() = creator_id);

-- creator_ai_persona: solo el creator. Fans solo ven el disclosure (via backend).
ALTER TABLE creator_ai_persona ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_persona own" ON creator_ai_persona FOR ALL USING (auth.uid() = creator_id);

-- ai_persona_messages: creator ve los suyos; fan ve los que le llegaron.
ALTER TABLE ai_persona_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_msgs own read" ON ai_persona_messages
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = fan_id);

-- fan_stats: fan ve sus stats con CADA creator; creator ve stats agregados de sus fans.
ALTER TABLE fan_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fan_stats own read" ON fan_stats
  FOR SELECT USING (auth.uid() = fan_id OR auth.uid() = creator_id);

-- mass_dm_broadcasts (v68): solo el creator ve los suyos.
ALTER TABLE mass_dm_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mass_dm own" ON mass_dm_broadcasts FOR ALL USING (auth.uid() = creator_id);

-- creator_welcome_messages (v68): solo el creator.
ALTER TABLE creator_welcome_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "welcome_msgs own" ON creator_welcome_messages FOR ALL USING (auth.uid() = creator_id);

-- watermark_jobs (v68): backend service_role only. No public policy.
ALTER TABLE watermark_jobs ENABLE ROW LEVEL SECURITY;

-- ─── 2) Índices que faltan para queries comunes ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fan_stats_fan         ON fan_stats (fan_id, last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_show_spy_show         ON show_spy_sessions (show_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_skips_show      ON show_queue_skips (show_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_charges_pair       ON dm_paywall_charges (payer_id, receiver_id, created_at DESC);

-- ─── 3) RPC para incrementar fan_stats atomically ──────────────────────────
CREATE OR REPLACE FUNCTION increment_fan_stats(
  p_fan_id UUID, p_creator_id UUID, p_coins INT, p_kind TEXT
) RETURNS VOID AS $$
DECLARE
  cur_total INT;
  cur_subs  INT;
  new_badges TEXT[];
BEGIN
  INSERT INTO fan_stats (fan_id, creator_id, total_spent_coins,
                          tips_count, ppv_purchases, subscription_months,
                          first_interaction_at, last_interaction_at)
  VALUES (p_fan_id, p_creator_id, p_coins,
          CASE WHEN p_kind = 'tip' THEN 1 ELSE 0 END,
          CASE WHEN p_kind = 'ppv' THEN 1 ELSE 0 END,
          CASE WHEN p_kind = 'sub' THEN 1 ELSE 0 END,
          NOW(), NOW())
  ON CONFLICT (fan_id, creator_id) DO UPDATE SET
    total_spent_coins    = fan_stats.total_spent_coins    + p_coins,
    tips_count           = fan_stats.tips_count           + CASE WHEN p_kind = 'tip' THEN 1 ELSE 0 END,
    ppv_purchases        = fan_stats.ppv_purchases        + CASE WHEN p_kind = 'ppv' THEN 1 ELSE 0 END,
    subscription_months  = fan_stats.subscription_months  + CASE WHEN p_kind = 'sub' THEN 1 ELSE 0 END,
    last_interaction_at  = NOW()
  RETURNING total_spent_coins, subscription_months INTO cur_total, cur_subs;

  new_badges := ARRAY[]::TEXT[];
  IF cur_total >= 100   THEN new_badges := array_append(new_badges, 'bronze_supporter'); END IF;
  IF cur_total >= 1000  THEN new_badges := array_append(new_badges, 'silver_supporter'); END IF;
  IF cur_total >= 10000 THEN new_badges := array_append(new_badges, 'gold_supporter'); END IF;
  IF cur_total >= 50000 THEN new_badges := array_append(new_badges, 'diamond_supporter'); END IF;
  IF cur_subs  >= 6     THEN new_badges := array_append(new_badges, 'loyal_6m'); END IF;
  IF cur_subs  >= 12    THEN new_badges := array_append(new_badges, 'anniversary_1y'); END IF;

  UPDATE fan_stats SET badges = new_badges
    WHERE fan_id = p_fan_id AND creator_id = p_creator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4) RPC vault use counter ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_vault_use(p_item_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE creator_vault_items
    SET use_count = COALESCE(use_count, 0) + 1,
        last_used_at = NOW()
    WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5) compliance_config: launch readiness flags ──────────────────────────
INSERT INTO compliance_config (key, value, description) VALUES
  ('launch_phase',          'pre-launch',  'Estado de lanzamiento: pre-launch | beta-latam | production'),
  ('health_check_url',      '/healthz',    'Health check endpoint'),
  ('changelog_version',     'v71',         'Última migration aplicada'),
  ('signups_open',          'true',        'Si registros públicos están abiertos'),
  ('maintenance_mode',      'false',       'Si la app está en mantenimiento'),
  ('feature_flag_ai_persona_workers',  'false', 'Si los workers de AI persona auto-respuesta están activos'),
  ('feature_flag_autoreply_workers',   'false', 'Si los workers de auto-reply están activos'),
  ('feature_flag_vr_player', 'true',       'Si el player VR/360 está habilitado')
ON CONFLICT (key) DO NOTHING;

COMMIT;
