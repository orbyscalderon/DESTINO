-- ────────────────────────────────────────────────────────────────────────────
-- Migration v27 — Engagement features
-- 1. Shows programados (scheduled_for + recordatorios)
-- 2. Polls en shows en vivo
-- 3. Achievements + niveles (XP) para usuarios
-- 4. Multi-host placeholder (co-broadcasters)
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) SHOWS PROGRAMADOS ────────────────────────────────────────────────────
-- live_shows.scheduled_at ya existe desde v5. Agregamos reminder tracking.
ALTER TABLE live_shows
  ADD COLUMN IF NOT EXISTS reminder_notified_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_shows_scheduled
  ON live_shows (scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- Reminders se manejan vía show_interests (ya existente) + flag para evitar duplicados
ALTER TABLE show_interests
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- ─── 2) POLLS — usar sistema existente en showController (live_shows.poll_*) ──
-- (no se necesitan tablas nuevas)

-- ─── 3) ACHIEVEMENTS / NIVELES ───────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS xp_points  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_level INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS active_badge TEXT;

-- Catálogo de achievements (hardcoded en código pero también en DB para mostrar)
CREATE TABLE IF NOT EXISTS achievements (
  id              TEXT PRIMARY KEY, -- 'first_match', 'first_tip', etc.
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  icon            TEXT,             -- emoji o url
  xp_reward       INT DEFAULT 0,
  coin_reward     INT DEFAULT 0,
  category        TEXT,             -- 'social' | 'creator' | 'spender' | 'milestone'
  rarity          TEXT DEFAULT 'common', -- common | rare | epic | legendary
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Achievements ganados por usuario
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id);

-- Seed del catálogo (idempotente: ON CONFLICT)
INSERT INTO achievements (id, name, description, icon, xp_reward, coin_reward, category, rarity) VALUES
  ('first_match',     'Primer Match',         'Hiciste tu primer match',                '💘', 50,  10,  'social',  'common'),
  ('ten_matches',     'Conector',             '10 matches en total',                    '💖', 100, 25,  'social',  'common'),
  ('hundred_matches', 'Magnético',            '100 matches en total',                   '💝', 500, 100, 'social',  'rare'),
  ('first_tip',       'Primera Propina',      'Diste tu primera propina',               '💸', 30,  0,   'spender', 'common'),
  ('big_spender',     'Generoso',             'Diste $50 USD en propinas/regalos',      '💰', 200, 50,  'spender', 'rare'),
  ('whale',           'Ballena',              '$500 USD en propinas/regalos',           '🐋', 1000,200, 'spender', 'epic'),
  ('first_show',      'Debut',                'Hiciste tu primer show en vivo',         '🎬', 100, 25,  'creator', 'common'),
  ('first_sub',       'Tu Primer Fan',        'Conseguiste tu primer suscriptor',       '⭐', 100, 25,  'creator', 'common'),
  ('ten_subs',        'Comunidad',            '10 suscriptores activos',                '👥', 300, 75,  'creator', 'rare'),
  ('hundred_subs',    'Influencer',           '100 suscriptores activos',               '👑', 2000,500, 'creator', 'legendary'),
  ('first_referral',  'Embajador',            'Trajiste tu primer referido',            '🎁', 100, 50,  'social',  'common'),
  ('ten_referrals',   'Embajador Plata',      '10 referidos activos',                   '🥈', 500, 250, 'social',  'rare'),
  ('verified',        'Verificado',           'Tu identidad fue verificada',            '✓',  100, 0,   'milestone','common'),
  ('profile_complete','Perfil Completo',      'Completaste todo tu perfil',             '📝', 50,  50,  'milestone','common'),
  ('week_streak',     'Constancia',           '7 días seguidos abriendo la app',        '🔥', 100, 25,  'milestone','common'),
  ('month_streak',    'Devoto',               '30 días seguidos abriendo la app',       '⚡', 500, 100, 'milestone','rare')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  xp_reward = EXCLUDED.xp_reward,
  coin_reward = EXCLUDED.coin_reward;

-- ─── 4) MULTI-HOST: skip por ahora (requiere refactor importante de LiveKit) ──

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements  ENABLE ROW LEVEL SECURITY;

-- Achievements: catálogo público de lectura
CREATE POLICY "achievements public read" ON achievements FOR SELECT USING (TRUE);

-- user_achievements: cada uno ve los suyos + los de cualquiera (para vitrina)
CREATE POLICY "user_achievements public read" ON user_achievements FOR SELECT USING (TRUE);
