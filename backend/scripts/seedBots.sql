-- =============================================================================
-- seedBots.sql — 10 perfiles femeninos para el lanzamiento de Destino
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query → Run
-- Idempotente: WHERE NOT EXISTS evita duplicados sin depender de ON CONFLICT
-- =============================================================================

-- PASO 1: Insertar en auth.users solo si el email no existe aún
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  aud, role, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  v.email,
  crypt('Destino@Bot2025!#', gen_salt('bf')),
  NOW(),
  v.meta::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  'authenticated', 'authenticated',
  NOW(), NOW(), '', '', '', ''
FROM (VALUES
  ('valentina.garcia@destino-bot.com',
   '{"full_name":"Valentina García","username":"valentina_gc","avatar_url":"https://randomuser.me/api/portraits/women/1.jpg","age":23,"gender":"female"}'),
  ('isabella.martinez@destino-bot.com',
   '{"full_name":"Isabella Martínez","username":"isa_mtz","avatar_url":"https://randomuser.me/api/portraits/women/2.jpg","age":26,"gender":"female"}'),
  ('camila.rodriguez@destino-bot.com',
   '{"full_name":"Camila Rodríguez","username":"cami_rod","avatar_url":"https://randomuser.me/api/portraits/women/3.jpg","age":22,"gender":"female"}'),
  ('sofia.herrera@destino-bot.com',
   '{"full_name":"Sofía Herrera","username":"sofi_hrr","avatar_url":"https://randomuser.me/api/portraits/women/4.jpg","age":25,"gender":"female"}'),
  ('daniela.torres@destino-bot.com',
   '{"full_name":"Daniela Torres","username":"dani_trs","avatar_url":"https://randomuser.me/api/portraits/women/5.jpg","age":28,"gender":"female"}'),
  ('alejandra.flores@destino-bot.com',
   '{"full_name":"Alejandra Flores","username":"ale_flores","avatar_url":"https://randomuser.me/api/portraits/women/6.jpg","age":21,"gender":"female"}'),
  ('natalia.ramirez@destino-bot.com',
   '{"full_name":"Natalia Ramírez","username":"nati_rmz","avatar_url":"https://randomuser.me/api/portraits/women/7.jpg","age":27,"gender":"female"}'),
  ('gabriela.castro@destino-bot.com',
   '{"full_name":"Gabriela Castro","username":"gabi_cst","avatar_url":"https://randomuser.me/api/portraits/women/8.jpg","age":24,"gender":"female"}'),
  ('luciana.morales@destino-bot.com',
   '{"full_name":"Luciana Morales","username":"luci_mrl","avatar_url":"https://randomuser.me/api/portraits/women/9.jpg","age":29,"gender":"female"}'),
  ('mariana.vargas@destino-bot.com',
   '{"full_name":"Mariana Vargas","username":"mari_vrg","avatar_url":"https://randomuser.me/api/portraits/women/10.jpg","age":23,"gender":"female"}')
) AS v(email, meta)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email = v.email);


-- PASO 2: Insertar perfiles solo para bots que aún no tienen perfil
INSERT INTO public.profiles (
  id, full_name, username, age, gender, bio, country, language,
  interests, avatar_url, is_creator, is_adult_creator, is_incognito,
  premium_tier, is_premium, is_verified, last_active
)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'username',
  (u.raw_user_meta_data->>'age')::int,
  'female', '', 'CO', 'es',
  ARRAY[]::text[],
  u.raw_user_meta_data->>'avatar_url',
  false, false, false, 'basic', false, false, NOW()
FROM auth.users u
WHERE u.email LIKE '%@destino-bot.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);


-- PASO 3: Actualizar bios, intereses, países y last_active de cada bot
UPDATE public.profiles SET
  bio = 'Amante de la música en vivo y los viajes espontáneos 🎶✈️ Me encanta descubrir cafés escondidos y buenas conversaciones.',
  country = 'CO', language = 'es',
  interests = ARRAY['🎵 Música','✈️ Viajes','☕ Café','🎬 Cine','📸 Fotografía'],
  last_active = NOW() - INTERVAL '45 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'valentina.garcia@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Nutricionista de día, runner de noche 🏃‍♀️ Busco a alguien que también disfrute un domingo en el parque o una buena película.',
  country = 'MX', language = 'es',
  interests = ARRAY['💪 Fitness','🧘 Yoga','🌱 Naturaleza','🍳 Cocina','📚 Lectura'],
  last_active = NOW() - INTERVAL '20 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'isabella.martinez@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Estudiante de diseño, fanática del arte callejero 🎨 Si conoces buen plan cultural o tienes buenas recomendaciones, escribeme.',
  country = 'AR', language = 'es',
  interests = ARRAY['🎨 Arte','📸 Fotografía','🎭 Teatro','🎵 Música','☕ Café'],
  last_active = NOW() - INTERVAL '70 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'camila.rodriguez@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Abogada en proceso, lectora empedernida 📚 Me gustan los planes tranquilos pero no me niego a una noche de baile.',
  country = 'ES', language = 'es',
  interests = ARRAY['📚 Lectura','🎬 Cine','🍷 Vinos','✈️ Viajes','💃 Baile'],
  last_active = NOW() - INTERVAL '30 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'sofia.herrera@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Chef amateur y bailarina de salsa los fines de semana 💃🍳 La cocina y la música son mi idioma. ¿El tuyo?',
  country = 'VE', language = 'es',
  interests = ARRAY['🍳 Cocina','💃 Baile','🎵 Música','🏖️ Playa','📸 Fotografía'],
  last_active = NOW() - INTERVAL '55 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'daniela.torres@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Gamer, cinéfila y amante de la comida peruana 🎮🎬 No te asustes, también salgo del cuarto jaja.',
  country = 'PE', language = 'es',
  interests = ARRAY['🎮 Gaming','🎵 Música','🎬 Cine','🍳 Cocina','📚 Lectura'],
  last_active = NOW() - INTERVAL '90 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'alejandra.flores@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Profesora de yoga y senderismo los fines de semana 🧘‍♀️🏔️ Creo en el equilibrio: meditación mañana, pisco sour en la tarde.',
  country = 'CL', language = 'es',
  interests = ARRAY['🧘 Yoga','🌱 Naturaleza','💪 Fitness','📚 Lectura','☕ Café'],
  last_active = NOW() - INTERVAL '15 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'natalia.ramirez@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Periodista, viajera incansable y adicta al café ☕✈️ He visitado 12 países y no pienso parar. ¿Me acompañas al siguiente?',
  country = 'EC', language = 'es',
  interests = ARRAY['✈️ Viajes','☕ Café','📸 Fotografía','📚 Lectura','🎭 Teatro'],
  last_active = NOW() - INTERVAL '40 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'gabriela.castro@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Bióloga marina y surfista de corazón 🌊🐠 La playa es mi lugar favorito. Busco alguien a quien no le asuste mojarse.',
  country = 'CR', language = 'es',
  interests = ARRAY['🏖️ Playa','🌱 Naturaleza','💪 Fitness','🐶 Mascotas','📸 Fotografía'],
  last_active = NOW() - INTERVAL '120 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'luciana.morales@destino-bot.com');

UPDATE public.profiles SET
  bio = 'Actriz amateur, cinéfila y fan de los conciertos 🎭🎸 Si tienes buenas recomendaciones de películas o planes, ya tenemos de qué hablar.',
  country = 'MX', language = 'es',
  interests = ARRAY['🎭 Teatro','🎬 Cine','🎵 Música','🎸 Guitarra','💃 Baile'],
  last_active = NOW() - INTERVAL '25 minutes'
WHERE id = (SELECT id FROM auth.users WHERE email = 'mariana.vargas@destino-bot.com');


-- PASO 4: Verificar resultado
SELECT p.full_name, p.username, p.age, p.country, p.gender
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email LIKE '%@destino-bot.com'
ORDER BY p.full_name;
