-- ============================================================
-- MIGRACIÓN v5: Sistema de monetización de creadores
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- ── Columnas nuevas en profiles ───────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_creator          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_account_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS creator_bio         TEXT;

-- ── Columnas nuevas en profile_photos ────────────────────────
ALTER TABLE profile_photos
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price   NUMERIC(10,2) DEFAULT NULL;

-- ============================================================
-- TABLA: live_shows
-- Shows en vivo (broadcast 1→N o privado 1→1)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_shows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  show_type     TEXT NOT NULL DEFAULT 'broadcast' CHECK (show_type IN ('broadcast', 'private')),
  ticket_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  channel_name  TEXT UNIQUE,
  cover_url     TEXT,
  scheduled_at  TIMESTAMP WITH TIME ZONE,
  started_at    TIMESTAMP WITH TIME ZONE,
  ended_at      TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: show_tickets
-- Tickets de acceso a shows de pago
-- ============================================================
CREATE TABLE IF NOT EXISTS show_tickets (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id                 UUID NOT NULL REFERENCES live_shows(id) ON DELETE CASCADE,
  buyer_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_paid             NUMERIC(10,2) NOT NULL,
  creator_earnings        NUMERIC(10,2) NOT NULL,
  platform_fee            NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded')),
  purchased_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(show_id, buyer_id)
);

-- ============================================================
-- TABLA: content_purchases
-- Compras de fotos de pago
-- ============================================================
CREATE TABLE IF NOT EXISTS content_purchases (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type            TEXT NOT NULL CHECK (content_type IN ('photo')),
  content_id              UUID NOT NULL,
  amount_paid             NUMERIC(10,2) NOT NULL,
  creator_earnings        NUMERIC(10,2) NOT NULL,
  platform_fee            NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(buyer_id, content_type, content_id)
);

-- ============================================================
-- TABLA: creator_earnings
-- Balance acumulado por creador
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_earnings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  total_earned     NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_balance  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_paid_out   NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLA: creator_payouts
-- Historial de retiros
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_payouts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount             NUMERIC(10,2) NOT NULL,
  stripe_transfer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE live_shows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_earnings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_payouts   ENABLE ROW LEVEL SECURITY;

-- live_shows: todos los autenticados pueden leer; solo el host puede escribir
CREATE POLICY "Shows visibles para autenticados"
  ON live_shows FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Host crea su show"
  ON live_shows FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host actualiza su show"
  ON live_shows FOR UPDATE TO authenticated USING (auth.uid() = host_id);

CREATE POLICY "Host elimina su show"
  ON live_shows FOR DELETE TO authenticated USING (auth.uid() = host_id);

-- show_tickets: comprador y host pueden ver
CREATE POLICY "Comprador ve sus tickets"
  ON show_tickets FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR EXISTS (
    SELECT 1 FROM live_shows WHERE live_shows.id = show_tickets.show_id AND live_shows.host_id = auth.uid()
  ));

CREATE POLICY "Sistema inserta tickets"
  ON show_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- content_purchases: comprador y vendedor pueden ver
CREATE POLICY "Partes ven sus compras"
  ON content_purchases FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Sistema inserta compras"
  ON content_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- creator_earnings: solo el creador ve sus earnings
CREATE POLICY "Creador ve sus ganancias"
  ON creator_earnings FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Creador actualiza sus ganancias"
  ON creator_earnings FOR ALL TO authenticated USING (auth.uid() = creator_id);

-- creator_payouts: solo el creador ve sus retiros
CREATE POLICY "Creador ve sus retiros"
  ON creator_payouts FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Creador inserta retiro"
  ON creator_payouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_live_shows_host       ON live_shows(host_id);
CREATE INDEX IF NOT EXISTS idx_live_shows_status     ON live_shows(status);
CREATE INDEX IF NOT EXISTS idx_show_tickets_show     ON show_tickets(show_id);
CREATE INDEX IF NOT EXISTS idx_show_tickets_buyer    ON show_tickets(buyer_id);
CREATE INDEX IF NOT EXISTS idx_content_purchases_buyer  ON content_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_content_purchases_seller ON content_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_content_purchases_content ON content_purchases(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator ON creator_earnings(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator  ON creator_payouts(creator_id);
CREATE INDEX IF NOT EXISTS idx_profile_photos_paid   ON profile_photos(user_id, is_paid);

-- ============================================================
-- REALTIME para shows en vivo
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE live_shows;
ALTER PUBLICATION supabase_realtime ADD TABLE show_tickets;
