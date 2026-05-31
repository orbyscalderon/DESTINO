-- ────────────────────────────────────────────────────────────────────────────
-- Migration v29 — Adult video catalog (modelo Pornhub/Xvideos)
-- TODO en esta sección está aislado tras AgeGate (age_verified_at requerido)
--
-- 1. Tags + categorías taxonómicas
-- 2. Rating up/down + view tracking
-- 3. Playlists / favoritos
-- 4. 2257 records (US Title 18 § 2257 compliance)
-- 5. DMCA strikes (3-strikes → auto-ban)
-- 6. Geo-blocking config
-- 7. Extensiones a profile_videos para catálogo
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1) EXTENSIONES A profile_videos ────────────────────────────────────────
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS adult_category    TEXT,         -- 'amateur' | 'studio' | 'cam' etc.
  ADD COLUMN IF NOT EXISTS rating_up         INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_down       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score      NUMERIC GENERATED ALWAYS AS (
    CASE WHEN (rating_up + rating_down) > 0
         THEN rating_up::NUMERIC / (rating_up + rating_down)
         ELSE 0 END
  ) STORED,
  ADD COLUMN IF NOT EXISTS embed_enabled     BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_hidden         BOOLEAN DEFAULT FALSE,  -- moderación
  ADD COLUMN IF NOT EXISTS dmca_taken_down   BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_videos_adult_published
  ON profile_videos (is_adult, published_at DESC)
  WHERE is_adult = TRUE AND is_hidden = FALSE AND dmca_taken_down = FALSE;
CREATE INDEX IF NOT EXISTS idx_videos_views
  ON profile_videos (views_count DESC) WHERE is_adult = TRUE;
CREATE INDEX IF NOT EXISTS idx_videos_rating
  ON profile_videos (rating_score DESC) WHERE is_adult = TRUE AND (rating_up + rating_down) >= 10;

-- ─── 2) TAGS / CATEGORÍAS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,             -- 'milf', 'amateur', 'latina'
  name        TEXT NOT NULL,                    -- 'MILF', 'Amateur', 'Latina'
  category    TEXT,                             -- 'body', 'ethnicity', 'scenario', 'fetish'
  videos_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_tags_category ON video_tags (category, videos_count DESC);
CREATE INDEX IF NOT EXISTS idx_video_tags_popular  ON video_tags (videos_count DESC);

CREATE TABLE IF NOT EXISTS video_tag_assignments (
  video_id UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES video_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (video_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_vta_tag ON video_tag_assignments (tag_id);

-- Seed tags comunes (idempotente)
INSERT INTO video_tags (slug, name, category) VALUES
  ('amateur',    'Amateur',    'scenario'),
  ('studio',     'Studio',     'scenario'),
  ('hd',         'HD',         'quality'),
  ('verified',   'Verified',   'quality'),
  ('cam',        'Cam',        'scenario'),
  ('couple',     'Couple',     'scenario'),
  ('solo-girl',  'Solo Girl',  'scenario'),
  ('solo-guy',   'Solo Guy',   'scenario'),
  ('threesome',  'Threesome',  'scenario'),
  ('orgy',       'Orgy',       'scenario'),
  ('teen',       'Teen 18+',   'age'),
  ('milf',       'MILF',       'age'),
  ('mature',     'Mature',     'age'),
  ('latina',     'Latina',     'ethnicity'),
  ('asian',      'Asian',      'ethnicity'),
  ('ebony',      'Ebony',      'ethnicity'),
  ('white',      'White',      'ethnicity'),
  ('arab',       'Arab',       'ethnicity'),
  ('indian',     'Indian',     'ethnicity'),
  ('petite',     'Petite',     'body'),
  ('bbw',        'BBW',        'body'),
  ('big-tits',   'Big Tits',   'body'),
  ('small-tits', 'Small Tits', 'body'),
  ('big-ass',    'Big Ass',    'body'),
  ('blonde',     'Blonde',     'body'),
  ('brunette',   'Brunette',   'body'),
  ('redhead',    'Redhead',    'body'),
  ('lesbian',    'Lesbian',    'orientation'),
  ('gay',        'Gay',        'orientation'),
  ('trans',      'Trans',      'orientation'),
  ('bisexual',   'Bisexual',   'orientation'),
  ('bondage',    'BDSM',       'fetish'),
  ('feet',       'Feet',       'fetish'),
  ('roleplay',   'Roleplay',   'fetish'),
  ('cosplay',    'Cosplay',    'fetish'),
  ('public',     'Public',     'fetish'),
  ('outdoor',    'Outdoor',    'scenario'),
  ('pov',        'POV',        'scenario'),
  ('massage',    'Massage',    'scenario'),
  ('vr',         'VR / 360',   'quality')
ON CONFLICT (slug) DO NOTHING;

-- ─── 3) RATING up/down ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_ratings (
  video_id   UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value      SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_video_ratings_video ON video_ratings (video_id);

-- ─── 4) VIEWS / WATCH TIME ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable: anónimos
  ip_hash         TEXT,                                                -- para dedup anónimos
  duration_watched INT DEFAULT 0,                                       -- segundos
  is_embed        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_views_user  ON video_views (user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ─── 5) PLAYLISTS / FAVORITOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_playlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_public   BOOLEAN DEFAULT FALSE,
  is_favorites BOOLEAN DEFAULT FALSE,             -- una por usuario, sistema
  cover_video_id UUID REFERENCES profile_videos(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON video_playlists (user_id);

CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id UUID NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
  video_id    UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  position    INT DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (playlist_id, video_id)
);

-- ─── 6) 2257 COMPLIANCE RECORDS ──────────────────────────────────────────────
-- US Title 18 § 2257: required records for ALL performers in adult content
CREATE TABLE IF NOT EXISTS video_2257_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id           UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  uploaded_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  performer_legal_name TEXT NOT NULL,
  performer_dob      DATE NOT NULL,                                  -- date of birth (encriptado idealmente)
  performer_id_type  TEXT,                                           -- 'passport' | 'drivers_license' | 'national_id'
  performer_id_document_url TEXT,                                    -- storage URL del ID escaneado
  consent_signed_at  TIMESTAMPTZ NOT NULL,
  produced_at        DATE,                                           -- fecha de producción del contenido
  custodian_name     TEXT,                                           -- nombre del custodio de records (admin)
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_2257_video ON video_2257_records (video_id);

-- Flag de "tiene records 2257 completos" en profile_videos
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS has_2257_records BOOLEAN DEFAULT FALSE;

-- ─── 7) DMCA STRIKES (3-strikes auto-ban) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS dmca_strikes (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  strike_count   INT DEFAULT 0,
  last_strike_at TIMESTAMPTZ,
  last_dmca_id   UUID REFERENCES dmca_requests(id) ON DELETE SET NULL,
  banned_at      TIMESTAMPTZ
);

-- Flag de ban en profiles (genérico — puede ser por DMCA o cualquier otra razón)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_banned     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ban_reason    TEXT;

-- ─── 8) GEO-BLOCKS ───────────────────────────────────────────────────────────
-- Configuración de regiones donde NO se sirve contenido adulto.
CREATE TABLE IF NOT EXISTS geo_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,           -- ISO 3166-1 alpha-2: 'US', 'AE'
  region_code  TEXT,                    -- ISO 3166-2 (state/province): 'US-TX', 'US-UT'
  reason       TEXT,                    -- 'age_verification_law' | 'illegal' | 'tos'
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_geo_blocks_active ON geo_blocks (country_code, region_code) WHERE active = TRUE;

-- Seed: estados US con leyes anti-porn requiriendo age verification estricta
INSERT INTO geo_blocks (country_code, region_code, reason) VALUES
  ('US', 'US-TX', 'age_verification_law'),
  ('US', 'US-UT', 'age_verification_law'),
  ('US', 'US-MS', 'age_verification_law'),
  ('US', 'US-LA', 'age_verification_law'),
  ('US', 'US-AR', 'age_verification_law'),
  ('US', 'US-VA', 'age_verification_law'),
  ('US', 'US-MT', 'age_verification_law'),
  ('US', 'US-NC', 'age_verification_law'),
  ('US', 'US-ID', 'age_verification_law'),
  -- países con leyes anti-porn explícitas:
  ('CN', NULL, 'illegal'),
  ('IR', NULL, 'illegal'),
  ('SA', NULL, 'illegal'),
  ('AE', NULL, 'illegal'),
  ('KP', NULL, 'illegal')
ON CONFLICT DO NOTHING;

-- ─── 9) RPC helpers ─────────────────────────────────────────────────────────
-- Incrementar contador de tag al añadir
CREATE OR REPLACE FUNCTION increment_tag_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE video_tags SET videos_count = videos_count + 1 WHERE id = NEW.tag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE video_tags SET videos_count = GREATEST(0, videos_count - 1) WHERE id = OLD.tag_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tag_count ON video_tag_assignments;
CREATE TRIGGER trg_tag_count
  AFTER INSERT OR DELETE ON video_tag_assignments
  FOR EACH ROW EXECUTE FUNCTION increment_tag_count();

-- Rate vote helper (upsert atomic)
CREATE OR REPLACE FUNCTION upsert_video_rating(p_video_id UUID, p_user_id UUID, p_value SMALLINT)
RETURNS JSON AS $$
DECLARE
  old_value SMALLINT;
  new_up INT;
  new_down INT;
BEGIN
  SELECT value INTO old_value FROM video_ratings
   WHERE video_id = p_video_id AND user_id = p_user_id;

  IF old_value IS NULL THEN
    INSERT INTO video_ratings (video_id, user_id, value) VALUES (p_video_id, p_user_id, p_value);
  ELSIF old_value = p_value THEN
    DELETE FROM video_ratings WHERE video_id = p_video_id AND user_id = p_user_id;
  ELSE
    UPDATE video_ratings SET value = p_value WHERE video_id = p_video_id AND user_id = p_user_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE value = 1),
    COUNT(*) FILTER (WHERE value = -1)
  INTO new_up, new_down
  FROM video_ratings WHERE video_id = p_video_id;

  UPDATE profile_videos SET rating_up = new_up, rating_down = new_down WHERE id = p_video_id;

  RETURN json_build_object('rating_up', new_up, 'rating_down', new_down,
                           'my_vote', CASE
                             WHEN old_value IS NULL THEN p_value
                             WHEN old_value = p_value THEN NULL
                             ELSE p_value
                           END);
END;
$$ LANGUAGE plpgsql;

-- Incrementar contador de views atómico
CREATE OR REPLACE FUNCTION increment_video_views(p_video_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profile_videos SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_video_id;
END;
$$ LANGUAGE plpgsql;

-- Incrementar DMCA strike y auto-banear al 3º
CREATE OR REPLACE FUNCTION increment_dmca_strike(p_user_id UUID, p_dmca_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  new_count INT;
  banned BOOLEAN := FALSE;
BEGIN
  INSERT INTO dmca_strikes (user_id, strike_count, last_strike_at, last_dmca_id)
    VALUES (p_user_id, 1, NOW(), p_dmca_id)
  ON CONFLICT (user_id) DO UPDATE SET
    strike_count = dmca_strikes.strike_count + 1,
    last_strike_at = NOW(),
    last_dmca_id = COALESCE(p_dmca_id, dmca_strikes.last_dmca_id)
  RETURNING strike_count INTO new_count;

  IF new_count >= 3 THEN
    UPDATE dmca_strikes SET banned_at = NOW() WHERE user_id = p_user_id;
    UPDATE profiles SET is_banned = TRUE, banned_at = NOW(),
                        ban_reason = 'DMCA repeat infringer (3 strikes)'
      WHERE id = p_user_id;
    banned := TRUE;
  END IF;

  RETURN json_build_object('strike_count', new_count, 'banned', banned);
END;
$$ LANGUAGE plpgsql;

-- ─── 10) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE video_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tag_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_views            ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_playlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_2257_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dmca_strikes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_blocks             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags public read"          ON video_tags FOR SELECT USING (TRUE);
CREATE POLICY "tag_assignments public read" ON video_tag_assignments FOR SELECT USING (TRUE);
CREATE POLICY "ratings own write"         ON video_ratings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "playlists own"             ON video_playlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "playlists public read"     ON video_playlists FOR SELECT USING (is_public = TRUE OR auth.uid() = user_id);
CREATE POLICY "playlist_items own"        ON playlist_items FOR ALL USING (
  EXISTS (SELECT 1 FROM video_playlists WHERE id = playlist_id AND user_id = auth.uid())
);
-- 2257, dmca_strikes, geo_blocks: backend service_role only (sin policies de lectura)
