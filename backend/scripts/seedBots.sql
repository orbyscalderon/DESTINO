-- =============================================================================
-- seedBots.sql — 10 perfiles femeninos para el lanzamiento de Destino
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Idempotente: ON CONFLICT DO NOTHING evita duplicados si se corre dos veces
-- =============================================================================

-- 1) Deshabilitar trigger para evitar conflicto con handle_new_user
--    (el trigger falla si la tabla profiles tiene columnas NOT NULL sin default)
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

-- 2) Insertar los usuarios en auth.users
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  aud, role, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'valentina.garcia@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Valentina García","avatar_url":"https://randomuser.me/api/portraits/women/1.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'isabella.martinez@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Isabella Martínez","avatar_url":"https://randomuser.me/api/portraits/women/2.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'camila.rodriguez@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Camila Rodríguez","avatar_url":"https://randomuser.me/api/portraits/women/3.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'sofia.herrera@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Sofía Herrera","avatar_url":"https://randomuser.me/api/portraits/women/4.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'daniela.torres@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Daniela Torres","avatar_url":"https://randomuser.me/api/portraits/women/5.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'alejandra.flores@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Alejandra Flores","avatar_url":"https://randomuser.me/api/portraits/women/6.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'natalia.ramirez@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Natalia Ramírez","avatar_url":"https://randomuser.me/api/portraits/women/7.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'gabriela.castro@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Gabriela Castro","avatar_url":"https://randomuser.me/api/portraits/women/8.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'luciana.morales@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Luciana Morales","avatar_url":"https://randomuser.me/api/portraits/women/9.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', ''),

  (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
   'mariana.vargas@destino-bot.com',
   crypt('Destino@Bot2025!#', gen_salt('bf')), NOW(),
   '{"full_name":"Mariana Vargas","avatar_url":"https://randomuser.me/api/portraits/women/10.jpg"}'::jsonb,
   '{"provider":"email","providers":["email"]}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', '')

ON CONFLICT (email) DO NOTHING;

-- 3) Re-habilitar trigger
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

-- 4) Insertar perfiles usando los IDs que se acaban de crear
INSERT INTO public.profiles (
  id, full_name, username, age, gender, bio, country, language,
  interests, avatar_url, is_creator, is_adult_creator, is_incognito,
  premium_tier, is_premium, is_verified, last_active
)
SELECT
  u.id,
  (u.raw_user_meta_data->>'full_name'),
  split_part(u.email, '.', 1),  -- username temporal, se sobreescribe abajo
  0, 'female', '', 'CO', 'es', ARRAY[]::text[],
  (u.raw_user_meta_data->>'avatar_url'),
  false, false, false, 'basic', false, false, NOW()
FROM auth.users u
WHERE u.email LIKE '%@destino-bot.com'
ON CONFLICT (id) DO NOTHING;

-- 5) Actualizar cada perfil con los datos completos
UPDATE public.profiles SET
  username = 'valentina_gc', age = 23, country = 'CO',
  bio = 'Amante de la música en vivo y los viajes espontáneos 🎶✈️ Me encanta descubrir cafés escondidos y buenas conversaciones.',
  interests = ARRAY['🎵 Música','✈️ Viajes','☕ Café','🎬 Cine','📸 Fotografía'],
  last_active = NOW() - INTERVAL '45 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'valentina.garcia@destino-bot.com');

UPDATE public.profiles SET
  username = 'isa_mtz', age = 26, country = 'MX',
  bio = 'Nutricionista de día, runner de noche 🏃‍♀️ Busco a alguien que también disfrute un domingo en el parque o una buena película.',
  interests = ARRAY['💪 Fitness','🧘 Yoga','🌱 Naturaleza','🍳 Cocina','📚 Lectura'],
  last_active = NOW() - INTERVAL '20 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'isabella.martinez@destino-bot.com');

UPDATE public.profiles SET
  username = 'cami_rod', age = 22, country = 'AR',
  bio = 'Estudiante de diseño, fanática del arte callejero 🎨 Si conoces buen plan cultural o tienes buenas recomendaciones, escribeme.',
  interests = ARRAY['🎨 Arte','📸 Fotografía','🎭 Teatro','🎵 Música','☕ Café'],
  last_active = NOW() - INTERVAL '70 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'camila.rodriguez@destino-bot.com');

UPDATE public.profiles SET
  username = 'sofi_hrr', age = 25, country = 'ES',
  bio = 'Abogada en proceso, lectora empedernida 📚 Me gustan los planes tranquilos pero no me niego a una noche de baile.',
  interests = ARRAY['📚 Lectura','🎬 Cine','🍷 Vinos','✈️ Viajes','💃 Baile'],
  last_active = NOW() - INTERVAL '30 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'sofia.herrera@destino-bot.com');

UPDATE public.profiles SET
  username = 'dani_trs', age = 28, country = 'VE',
  bio = 'Chef amateur y bailarina de salsa los fines de semana 💃🍳 La cocina y la música son mi idioma. ¿El tuyo?',
  interests = ARRAY['🍳 Cocina','💃 Baile','🎵 Música','🏖️ Playa','📸 Fotografía'],
  last_active = NOW() - INTERVAL '55 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'daniela.torres@destino-bot.com');

UPDATE public.profiles SET
  username = 'ale_flores', age = 21, country = 'PE',
  bio = 'Gamer, cinéfila y amante de la comida peruana 🎮🎬 No te asustes, también salgo del cuarto jaja.',
  interests = ARRAY['🎮 Gaming','🎵 Música','🎬 Cine','🍳 Cocina','📚 Lectura'],
  last_active = NOW() - INTERVAL '90 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'alejandra.flores@destino-bot.com');

UPDATE public.profiles SET
  username = 'nati_rmz', age = 27, country = 'CL',
  bio = 'Profesora de yoga y senderismo los fines de semana 🧘‍♀️🏔️ Creo en el equilibrio: meditación mañana, pisco sour en la tarde.',
  interests = ARRAY['🧘 Yoga','🌱 Naturaleza','💪 Fitness','📚 Lectura','☕ Café'],
  last_active = NOW() - INTERVAL '15 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'natalia.ramirez@destino-bot.com');

UPDATE public.profiles SET
  username = 'gabi_cst', age = 24, country = 'EC',
  bio = 'Periodista, viajera incansable y adicta al café ☕✈️ He visitado 12 países y no pienso parar. ¿Me acompañas al siguiente?',
  interests = ARRAY['✈️ Viajes','☕ Café','📸 Fotografía','📚 Lectura','🎭 Teatro'],
  last_active = NOW() - INTERVAL '40 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'gabriela.castro@destino-bot.com');

UPDATE public.profiles SET
  username = 'luci_mrl', age = 29, country = 'CR',
  bio = 'Bióloga marina y surfista de corazón 🌊🐠 La playa es mi lugar favorito. Busco alguien a quien no le asuste mojarse.',
  interests = ARRAY['🏖️ Playa','🌱 Naturaleza','💪 Fitness','🐶 Mascotas','📸 Fotografía'],
  last_active = NOW() - INTERVAL '120 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'luciana.morales@destino-bot.com');

UPDATE public.profiles SET
  username = 'mari_vrg', age = 23, country = 'MX',
  bio = 'Actriz amateur, cinéfila y fan de los conciertos 🎭🎸 Si tienes buenas recomendaciones de películas o planes, ya tenemos de qué hablar.',
  interests = ARRAY['🎭 Teatro','🎬 Cine','🎵 Música','🎸 Guitarra','💃 Baile'],
  last_active = NOW() - INTERVAL '25 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'mariana.vargas@destino-bot.com');

-- 6) Verificar resultado
SELECT p.full_name, p.username, p.age, p.country, p.gender
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email LIKE '%@destino-bot.com'
ORDER BY p.full_name;
