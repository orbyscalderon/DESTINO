-- encuentros — schema standalone para producto separado
--
-- IMPORTANTE: Este schema NO debe correrse en la misma DB de Destino TV.
-- Va en una Postgres/Supabase project SEPARADO de la entidad legal
-- offshore que opere encuentros.
--
-- Modelo: classifieds-style adult listings (estilo Skokka/Slixa) donde
-- los publishers ponen su propia info incluyendo tarifas, contacto externo,
-- servicios, dirección. La plataforma NO procesa pagos por encuentros
-- físicos — solo cobra subscription al publisher por aparecer en el
-- directorio (Verotel/MobiusPay escort-licensed processor).

BEGIN;

-- ── Tabla principal de listings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encuentros_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identidad del publisher
  publisher_email text NOT NULL,
  publisher_phone text,            -- opcional, contacto interno
  display_name    text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),
  age             int  NOT NULL CHECK (age BETWEEN 18 AND 99),
  gender          text NOT NULL CHECK (gender IN ('female','male','trans','couple','other')),

  -- Ubicación
  country_code    text NOT NULL CHECK (length(country_code) = 2),
  city            text NOT NULL CHECK (length(city) BETWEEN 2 AND 80),
  zone            text,            -- barrio/zona específica
  address         text,            -- dirección si publica con visita

  -- Descripción
  headline        text NOT NULL CHECK (length(headline) BETWEEN 5 AND 100),
  description     text CHECK (length(description) <= 2000),

  -- Demografía física (opcional)
  height_cm       int  CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 230),
  weight_kg       int  CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 300),
  bust_size       text,
  body_type       text CHECK (body_type IS NULL OR body_type IN ('delgada','atletica','curvy','plus','fitness')),
  ethnicity       text CHECK (ethnicity IS NULL OR ethnicity IN ('latina','caucasica','afro','asiatica','mixta')),
  eye_color       text,
  hair_color      text,
  languages       text[],

  -- Servicios (texto libre + tags estructurados)
  services        text[],          -- ej: ['novia gfe','masaje','striptease',...]
  services_notes  text CHECK (services_notes IS NULL OR length(services_notes) <= 1000),

  -- Tarifas (Skokka-style, abiertas — la plataforma NO procesa estos pagos)
  rate_30min      int,             -- en moneda local del country
  rate_60min      int,
  rate_2h         int,
  rate_overnight  int,
  rate_currency   text DEFAULT 'USD' CHECK (length(rate_currency) = 3),
  rate_notes      text CHECK (rate_notes IS NULL OR length(rate_notes) <= 300),

  -- Contacto externo (la diferencia clave con el modelo Destino TV)
  whatsapp        text,
  telegram        text,
  signal_number   text,
  external_url    text,

  -- Modalidades
  available_incall   boolean DEFAULT false,   -- recibe en su lugar
  available_outcall  boolean DEFAULT false,   -- va a hotel/lugar del cliente
  available_online   boolean DEFAULT false,   -- videocall, fotos, sexting

  -- Fotos
  photos          jsonb DEFAULT '[]'::jsonb,  -- [{url, is_verified, position}]
  cover_photo_url text,

  -- Verificación opcional (foto con cartel "encuentros.com" + ID en mano)
  is_verified         boolean DEFAULT false,
  verification_photo  text,
  verified_at         timestamptz,

  -- Disponibilidad
  available_now    boolean DEFAULT false,
  available_today  boolean DEFAULT false,
  schedule         jsonb,           -- { mon: [{from,to}], tue: ..., ... }

  -- Premium tier (paid placement)
  tier            text DEFAULT 'standard' CHECK (tier IN ('standard','premium','vip','top')),
  tier_expires_at timestamptz,

  -- Estado
  status          text DEFAULT 'pending_review' CHECK (status IN ('pending_review','active','paused','rejected','expired')),
  rejection_reason text,
  reviewed_at      timestamptz,

  -- Métricas
  views_count     int DEFAULT 0,
  contacts_count  int DEFAULT 0,    -- click en whatsapp/telegram

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),

  -- Compliance: 18 USC 2257 record for each model in photos
  age_verified            boolean DEFAULT false,
  age_verification_method text,      -- 'id_document','onfido','jumio','manual'
  age_verified_at         timestamptz,
  age_verification_doc_url text,     -- encriptado en storage
  ip_at_signup            inet,
  ua_at_signup            text
);

-- Indexes
CREATE INDEX idx_encuentros_listings_active
  ON encuentros_listings (country_code, lower(city), tier DESC, created_at DESC)
  WHERE status = 'active';

CREATE INDEX idx_encuentros_listings_available_now
  ON encuentros_listings (country_code, lower(city), created_at DESC)
  WHERE status = 'active' AND available_now = true;

CREATE INDEX idx_encuentros_listings_gender
  ON encuentros_listings (gender, country_code, lower(city))
  WHERE status = 'active';

-- ── Subscription / billing ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encuentros_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id         uuid REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  publisher_email    text NOT NULL,
  tier               text NOT NULL CHECK (tier IN ('standard','premium','vip','top')),
  price_usd          numeric(10,2) NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','past_due')),
  processor          text NOT NULL CHECK (processor IN ('verotel','mobiuspay','segpay','ccbill_safetynet')),
  processor_sub_id   text NOT NULL,
  current_period_end timestamptz NOT NULL,
  auto_renew         boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE INDEX idx_enc_subs_publisher ON encuentros_subscriptions (publisher_email);
CREATE INDEX idx_enc_subs_listing ON encuentros_subscriptions (listing_id);

-- ── Reportes (DSA/safety compliance) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS encuentros_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  reporter_ip     inet,
  reporter_email  text,
  category        text NOT NULL CHECK (category IN (
    'underage_suspected',     -- DSA + 2257: PRIORIDAD MÁXIMA
    'trafficking_suspected',  -- escalación inmediata a NCMEC + autoridades
    'fake_photos',
    'scam_payment',
    'aggressive_behavior',
    'fake_identity',
    'spam',
    'other'
  )),
  description     text NOT NULL,
  evidence_url    text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  action_taken    text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_enc_reports_listing ON encuentros_reports (listing_id, created_at DESC);
CREATE INDEX idx_enc_reports_urgent ON encuentros_reports (category, created_at DESC)
  WHERE category IN ('underage_suspected', 'trafficking_suspected') AND status = 'pending';

-- ── Audit log de actions de publisher ─────────────────────────────────
CREATE TABLE IF NOT EXISTS encuentros_publisher_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid REFERENCES encuentros_listings(id) ON DELETE CASCADE,
  action      text NOT NULL,  -- 'created','updated','renewed','paused','reactivated'
  ip          inet,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_enc_pub_log ON encuentros_publisher_log (listing_id, created_at DESC);

COMMIT;
