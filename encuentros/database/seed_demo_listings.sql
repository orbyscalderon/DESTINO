-- Seed data para demo del producto Encuentros.
-- Listings ficticios — solo para vista de UI.
-- NO usar en producción.

INSERT INTO encuentros_listings (
  publisher_email, display_name, age, gender, country_code, city, zone,
  headline, description, height_cm, body_type, ethnicity, languages,
  services, rate_30min, rate_60min, rate_overnight, rate_currency,
  whatsapp, available_incall, available_outcall, available_online,
  cover_photo_url, photos, is_verified, tier, available_now, status,
  age_verified, expires_at
) VALUES
(
  'demo1@example.com', 'Camila', 26, 'female', 'DO', 'Santo Domingo', 'Piantini',
  'Disponible esta noche · Trato VIP',
  'Hola amor, soy Camila. Te ofrezco un encuentro relajado y discreto. Tengo lugar propio en zona segura. Solo personas educadas.',
  168, 'atletica', 'latina', ARRAY['es', 'en'],
  ARRAY['novia GFE', 'masaje', 'lluvia dorada', 'parejas'],
  3000, 5000, 25000, 'DOP',
  '+18095551234', true, true, true,
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
  '[]'::jsonb, true, 'top', true, 'active', true,
  now() + interval '30 days'
),
(
  'demo2@example.com', 'Valentina', 24, 'female', 'DO', 'Santo Domingo', 'Naco',
  'Recién llegada · Solo hoteles',
  'Soy Valentina, recién llegada a Santo Domingo. Solo voy a hoteles de categoría. Trato cariñoso, sin apuro.',
  170, 'curvy', 'latina', ARRAY['es'],
  ARRAY['novia GFE', 'beso negro', 'duo con amiga'],
  4000, 7000, NULL, 'DOP',
  '+18095555678', false, true, false,
  'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400',
  '[]'::jsonb, false, 'premium', true, 'active', true,
  now() + interval '30 days'
),
(
  'demo3@example.com', 'Sofía', 29, 'female', 'DO', 'Santiago', 'Centro',
  'Madura experimentada · Lugar discreto',
  'Mujer madura, experimentada y educada. Tengo apartamento discreto en zona céntrica. Solo profesionales y caballeros respetuosos.',
  165, 'atletica', 'latina', ARRAY['es', 'en', 'fr'],
  ARRAY['novia GFE', 'masaje tantrico', 'roleplay', 'fetiche'],
  2500, 4500, 20000, 'DOP',
  '+18098889999', true, false, false,
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
  '[]'::jsonb, true, 'vip', false, 'active', true,
  now() + interval '30 days'
),
(
  'demo4@example.com', 'Diego', 28, 'male', 'DO', 'Santo Domingo', 'Bella Vista',
  'Hombre fitness · Para parejas y mujeres',
  'Hombre fitness, atlético, discreto. Disponible para parejas, mujeres solas o eventos. Hablo inglés.',
  185, 'fitness', 'caucasica', ARRAY['es', 'en'],
  ARRAY['parejas', 'mujeres solas', 'eventos', 'acompañante'],
  3500, 6000, NULL, 'DOP',
  '+18099991111', true, true, true,
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
  '[]'::jsonb, false, 'premium', true, 'active', true,
  now() + interval '30 days'
),
(
  'demo5@example.com', 'Andrea', 23, 'female', 'DO', 'Punta Cana', 'Bávaro',
  'Universitaria · Inglés fluido · Turismo',
  'Universitaria, joven, dulce. Trato cariñoso. Disponible para turistas y locales por igual. Inglés fluido.',
  162, 'delgada', 'latina', ARRAY['es', 'en', 'pt'],
  ARRAY['novia GFE', 'turismo', 'acompañante eventos'],
  5000, 8000, 35000, 'DOP',
  '+18097773333', false, true, true,
  'https://images.unsplash.com/photo-1499714608240-22fc6ad53fb2?w=400',
  '[]'::jsonb, true, 'top', true, 'active', true,
  now() + interval '30 days'
),
(
  'demo6@example.com', 'Roxy', 27, 'trans', 'DO', 'Santo Domingo', 'Gazcue',
  'Trans pasiva · Operada · Discreta',
  'Trans operada, femenina, discreta. Lugar propio en zona segura. Solo personas serias.',
  175, 'curvy', 'latina', ARRAY['es'],
  ARRAY['novia GFE', 'fetiche', 'roleplay'],
  3000, 5500, NULL, 'DOP',
  '+18094445555', true, false, false,
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
  '[]'::jsonb, false, 'standard', true, 'active', true,
  now() + interval '30 days'
);
