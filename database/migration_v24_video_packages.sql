-- Migration v24: Catálogo de paquetes de video personalizado por creador

CREATE TABLE IF NOT EXISTS video_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,          -- coins
  delivery_days INTEGER DEFAULT 7,  -- plazo de entrega
  max_duration_sec INTEGER DEFAULT 60, -- duración máxima del video
  cover_url TEXT,                   -- preview/portada opcional
  active BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_packages_creator ON video_packages(creator_id) WHERE active = TRUE;

-- Referencia opcional al paquete en video_requests
ALTER TABLE video_requests ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES video_packages(id) ON DELETE SET NULL;

-- Precio mínimo para video custom (lo define el creador en profiles)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_video_min_price INTEGER DEFAULT 50;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepts_video_requests BOOLEAN DEFAULT TRUE;
