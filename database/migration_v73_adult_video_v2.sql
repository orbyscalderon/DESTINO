-- ════════════════════════════════════════════════════════════════════════════
-- Migration v73 — Adult video v2 (10 features)
--
-- Sprint A — Revenue + retención:
--   1) Floating tip during video (no schema, solo UI)
--   2) video_watch_history — resume position + completed tracking
--   3) video_comments + video_comment_likes
--   4) Speed/PiP/Loop (no schema, solo UI)
--
-- Sprint B — Discovery + binge:
--   5) video_series + video_series_items + video_series_purchases
--   6) video_costars (taggear creators, revenue split opcional)
--   7) profile_videos.scheduled_for + published_at + premiere_at
--
-- Sprint C — Calidad técnica:
--   8) video_captions (auto-Whisper o creator-uploaded VTT)
--   9) profile_videos.sprite_url + sprite_interval_sec (preview hover)
--   10) profile_videos.intro_end_sec + credits_start_sec (skip intro)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 2) Watch history + resume ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_watch_history (
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id         UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  resume_position_seconds INT NOT NULL DEFAULT 0,
  watched_seconds  INT NOT NULL DEFAULT 0,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  last_watched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count       INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_wh_user_recent
  ON video_watch_history (user_id, last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_unfinished
  ON video_watch_history (user_id, last_watched_at DESC)
  WHERE completed = FALSE AND resume_position_seconds > 30;

ALTER TABLE video_watch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watch_history own" ON video_watch_history FOR ALL USING (auth.uid() = user_id);

-- ─── 3) Video comments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id         UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id        UUID REFERENCES video_comments(id) ON DELETE CASCADE,
  content          TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  likes_count      INT NOT NULL DEFAULT 0,
  is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vcomments_video    ON video_comments (video_id, created_at DESC) WHERE is_hidden = FALSE;
CREATE INDEX IF NOT EXISTS idx_vcomments_parent   ON video_comments (parent_id, created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vcomments_pinned   ON video_comments (video_id) WHERE is_pinned = TRUE;

CREATE TABLE IF NOT EXISTS video_comment_likes (
  comment_id  UUID NOT NULL REFERENCES video_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcomments public read"  ON video_comments FOR SELECT USING (is_hidden = FALSE);
CREATE POLICY "vcomments own write"    ON video_comments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "vcomment_likes own"     ON video_comment_likes FOR ALL USING (auth.uid() = user_id);

-- Mantener likes_count actualizado vía trigger
CREATE OR REPLACE FUNCTION update_vcomment_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE video_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE video_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_vcomment_likes ON video_comment_likes;
CREATE TRIGGER trg_vcomment_likes
  AFTER INSERT OR DELETE ON video_comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_vcomment_likes_count();

-- ─── 5) Video series ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_url       TEXT,
  is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
  price_coins     INT NOT NULL DEFAULT 0,
  is_adult        BOOLEAN NOT NULL DEFAULT FALSE,
  videos_count    INT NOT NULL DEFAULT 0,
  purchases_count INT NOT NULL DEFAULT 0,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vseries_creator ON video_series (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_series_items (
  series_id    UUID NOT NULL REFERENCES video_series(id) ON DELETE CASCADE,
  video_id     UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  position     INT NOT NULL DEFAULT 0,
  episode_title TEXT,
  PRIMARY KEY (series_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_vseries_items_pos ON video_series_items (series_id, position);

CREATE TABLE IF NOT EXISTS video_series_purchases (
  id           BIGSERIAL PRIMARY KEY,
  series_id    UUID NOT NULL REFERENCES video_series(id) ON DELETE CASCADE,
  buyer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid   INT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_id, buyer_id)
);

ALTER TABLE video_series           ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_series_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_series_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vseries public read"      ON video_series FOR SELECT USING (is_published = TRUE);
CREATE POLICY "vseries own write"        ON video_series FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "vseries items public"     ON video_series_items FOR SELECT USING (TRUE);
CREATE POLICY "vseries items own"        ON video_series_items FOR ALL USING (
  EXISTS (SELECT 1 FROM video_series WHERE id = series_id AND creator_id = auth.uid())
);
CREATE POLICY "vseries purchases own"    ON video_series_purchases FOR SELECT USING (auth.uid() = buyer_id);

CREATE OR REPLACE FUNCTION update_vseries_videos_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE video_series SET videos_count = videos_count + 1 WHERE id = NEW.series_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE video_series SET videos_count = GREATEST(0, videos_count - 1) WHERE id = OLD.series_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_vseries_count ON video_series_items;
CREATE TRIGGER trg_vseries_count
  AFTER INSERT OR DELETE ON video_series_items
  FOR EACH ROW EXECUTE FUNCTION update_vseries_videos_count();

-- ─── 6) Co-stars tagging ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_costars (
  video_id           UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  costar_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Owner del video puede ofrecer % de ingresos al co-star (0-100)
  revenue_split_pct  INT NOT NULL DEFAULT 0 CHECK (revenue_split_pct BETWEEN 0 AND 100),
  -- El co-star debe confirmar para que el tag sea público
  confirmed          BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, costar_user_id)
);
CREATE INDEX IF NOT EXISTS idx_costars_user
  ON video_costars (costar_user_id, confirmed, created_at DESC);

ALTER TABLE video_costars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "costars public read confirmed"
  ON video_costars FOR SELECT USING (confirmed = TRUE);
CREATE POLICY "costars own (owner)"
  ON video_costars FOR ALL USING (
    EXISTS (SELECT 1 FROM profile_videos WHERE id = video_id AND user_id = auth.uid())
  );
CREATE POLICY "costars own (costar) accept"
  ON video_costars FOR UPDATE USING (auth.uid() = costar_user_id);

-- ─── 7) Scheduled premiere ────────────────────────────────────────────────
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS scheduled_for   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premiere_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pv_scheduled
  ON profile_videos (scheduled_for)
  WHERE scheduled_for IS NOT NULL AND published_at IS NULL;

-- ─── 8) Captions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_captions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  language        TEXT NOT NULL DEFAULT 'es',
  vtt_url         TEXT,
  vtt_storage_path TEXT,
  source          TEXT NOT NULL DEFAULT 'creator' CHECK (source IN ('auto-whisper', 'creator', 'community')),
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  generated_by_job UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_captions_video ON video_captions (video_id, language);

ALTER TABLE video_captions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "captions public read" ON video_captions FOR SELECT USING (TRUE);

-- Cola de jobs para procesamiento async (Whisper + sprite generation)
CREATE TABLE IF NOT EXISTS video_processing_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id       UUID NOT NULL REFERENCES profile_videos(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('whisper_captions', 'sprite_thumbnails', 'intro_detect')),
  source_url     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  output_url     TEXT,
  worker_id      TEXT,
  error          TEXT,
  retries        INT NOT NULL DEFAULT 0,
  enqueued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vpj_queue
  ON video_processing_jobs (kind, enqueued_at)
  WHERE status = 'queued';

-- ─── 9) Sprite thumbnails + 10) Skip intro ────────────────────────────────
ALTER TABLE profile_videos
  ADD COLUMN IF NOT EXISTS sprite_url           TEXT,
  ADD COLUMN IF NOT EXISTS sprite_interval_sec  INT,
  ADD COLUMN IF NOT EXISTS sprite_columns       INT,
  ADD COLUMN IF NOT EXISTS intro_end_sec        INT,
  ADD COLUMN IF NOT EXISTS credits_start_sec    INT;

-- ─── Compliance config: nuevas claves ─────────────────────────────────────
INSERT INTO compliance_config (key, value, description) VALUES
  ('feature_flag_video_comments',  'true',  'Si los comentarios en videos están habilitados'),
  ('feature_flag_video_series',    'true',  'Si las series de video están habilitadas'),
  ('feature_flag_whisper_captions','false', 'Si Whisper captions auto se genera al subir video adult'),
  ('feature_flag_sprite_thumbnails','false','Si se generan sprite sheets para hover preview'),
  ('whisper_max_minutes_per_day',  '300',   'Tope de minutos de audio procesados por Whisper por día')
ON CONFLICT (key) DO NOTHING;

COMMIT;
