-- Migration v23: Geo, story replies, travel mode, looking_for, selfie verification

-- 1. Geolocalización en profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_consent BOOLEAN DEFAULT FALSE;

-- 2. Looking for (qué busca el usuario)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS looking_for TEXT DEFAULT NULL;
-- valores: 'relationship' | 'casual' | 'friendship' | 'unsure'

-- 3. Travel mode
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_latitude  NUMERIC(10, 7);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_longitude NUMERIC(10, 7);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS travel_until TIMESTAMPTZ;

-- 4. Search preferences (filtros guardados)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_preferences JSONB DEFAULT '{}'::jsonb;
-- ejemplo: { minAge: 20, maxAge: 35, gender: 'female', max_distance_km: 50, looking_for: 'relationship' }

-- 5. Selfie verification photo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selfie_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selfie_url TEXT;

-- 6. Story replies (mensajes a partir de una story)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_story_id UUID REFERENCES stories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_story ON messages(reply_to_story_id);

-- 7. Video messages — ya existe message_type column. Solo aseguramos índice
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type) WHERE message_type IS NOT NULL;

-- 8. Función Haversine para distancia (km entre dos lat/lng)
CREATE OR REPLACE FUNCTION calc_distance_km(
  lat1 NUMERIC, lng1 NUMERIC,
  lat2 NUMERIC, lng2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  R CONSTANT NUMERIC := 6371;
  dLat NUMERIC;
  dLng NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  dLat := RADIANS(lat2 - lat1);
  dLng := RADIANS(lng2 - lng1);
  a := SIN(dLat/2) * SIN(dLat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dLng/2) * SIN(dLng/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 9. Índice GIST para geo búsqueda rápida (opcional, requiere extensión earthdistance)
-- Comentado porque puede no estar disponible:
-- CREATE EXTENSION IF NOT EXISTS cube;
-- CREATE EXTENSION IF NOT EXISTS earthdistance;
-- CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles USING gist(ll_to_earth(latitude::float8, longitude::float8));
