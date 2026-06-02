-- ────────────────────────────────────────────────────────────────────────────
-- Migration v41 — Categorías + filtros avanzados para adult creators
--
-- Permite que un fan filtre creators por: estilo (cosplay, fitness, MILF,
-- etc.), kinks (BDSM, foot, latex, etc.), etnia, body type, edad,
-- características físicas. Cada creator se auto-clasifica con N tags.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Catálogo central de categorías (admin-curated)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS adult_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,        -- "fitness", "cosplay", "milf"
  name        TEXT NOT NULL,               -- "Fitness", "Cosplay", "MILF"
  group_name  TEXT NOT NULL,               -- "style", "kink", "body", "ethnicity", "age"
  emoji       TEXT,                        -- "💪", "🎭"
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adult_cats_group_active
  ON adult_categories (group_name, sort_order)
  WHERE is_active = TRUE;

-- Seed con categorías comunes (idempotente vía ON CONFLICT)
INSERT INTO adult_categories (slug, name, group_name, emoji, sort_order) VALUES
  -- STYLE / NICHO
  ('cosplay',     'Cosplay',          'style', '🎭', 10),
  ('fitness',     'Fitness',          'style', '💪', 20),
  ('amateur',     'Amateur',          'style', '🏠', 30),
  ('glamour',     'Glamour',          'style', '✨', 40),
  ('alternative', 'Alternative',      'style', '🖤', 50),
  ('teacher',     'Profesora',        'style', '🍎', 60),
  ('roleplay',    'Roleplay',         'style', '🎬', 70),
  ('voyeur',      'Voyeur',           'style', '👁️', 80),
  ('exhibitionist','Exhibicionista',  'style', '🌆', 90),
  ('couples',     'Pareja',           'style', '💑', 100),

  -- BODY TYPE
  ('slim',        'Delgada',          'body',  '🌿', 10),
  ('curvy',       'Curvy',            'body',  '🍑', 20),
  ('bbw',         'BBW',              'body',  '🌺', 30),
  ('petite',      'Petite',           'body',  '🌸', 40),
  ('athletic',    'Atlética',         'body',  '🏋️', 50),
  ('busty',       'Busty',            'body',  '🌷', 60),
  ('tatuada',     'Tatuada',          'body',  '🎨', 70),
  ('pierced',     'Piercings',        'body',  '💎', 80),

  -- ETHNICITY (sensitive — uses neutral terms)
  ('latina',      'Latina',           'ethnicity', '🌎', 10),
  ('caucasica',   'Caucásica',        'ethnicity', '🌍', 20),
  ('asiatica',    'Asiática',         'ethnicity', '🌏', 30),
  ('afro',        'Afro',             'ethnicity', '🌍', 40),
  ('mixed',       'Mixta',            'ethnicity', '🌐', 50),

  -- AGE GROUPS (informative — todos +18 verificados)
  ('20s',         '20s',              'age',   '🎂', 10),
  ('30s',         '30s',              'age',   '🎂', 20),
  ('40s',         '40s',              'age',   '🎂', 30),
  ('50plus',      '50+',              'age',   '🎂', 40),
  ('milf',        'MILF',             'age',   '🔥', 50),

  -- KINKS / NICHE (todo legal y consensual)
  ('feet',        'Pies',             'kink',  '🦶', 10),
  ('bdsm',        'BDSM',             'kink',  '⛓️', 20),
  ('domme',       'Domme',            'kink',  '👠', 30),
  ('sub',         'Submisa',          'kink',  '🎀', 40),
  ('latex',       'Latex/Cuero',      'kink',  '🖤', 50),
  ('lingerie',    'Lencería',         'kink',  '👙', 60),
  ('joi',         'JOI',              'kink',  '🎙️', 70),
  ('asmr',        'ASMR',             'kink',  '🎧', 80),
  ('financial',   'FinDom',           'kink',  '💸', 90),
  ('cuckolding',  'Cuckolding',       'kink',  '👀', 100),
  ('roleplay_k',  'Roleplay kink',    'kink',  '🎭', 110)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  group_name = EXCLUDED.group_name,
  emoji = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Relación many-to-many creator ↔ categoría
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS creator_adult_categories (
  creator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES adult_categories(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (creator_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_cac_creator
  ON creator_adult_categories (creator_id);
CREATE INDEX IF NOT EXISTS idx_cac_category
  ON creator_adult_categories (category_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE adult_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_adult_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adult cats public read" ON adult_categories;
DROP POLICY IF EXISTS "cac public read"        ON creator_adult_categories;
DROP POLICY IF EXISTS "cac own manage"         ON creator_adult_categories;

CREATE POLICY "adult cats public read"
  ON adult_categories FOR SELECT USING (is_active = TRUE);

CREATE POLICY "cac public read"
  ON creator_adult_categories FOR SELECT USING (true);

CREATE POLICY "cac own manage"
  ON creator_adult_categories FOR ALL
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Helpers
-- ════════════════════════════════════════════════════════════════════════════
-- Cantidad de categorías de un creator (para validar máx 12 por ejemplo)
CREATE OR REPLACE FUNCTION count_creator_adult_categories(p_creator_id UUID)
RETURNS INT AS $$
  SELECT COUNT(*)::INT FROM creator_adult_categories WHERE creator_id = p_creator_id;
$$ LANGUAGE sql STABLE;
