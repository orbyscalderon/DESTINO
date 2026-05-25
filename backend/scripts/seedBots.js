/**
 * seedBots.js — crea 10 perfiles femeninos bot para que el feed no se vea vacío.
 * Uso: node --env-file=.env scripts/seedBots.js
 *
 * - Idempotente: no duplica si se ejecuta dos veces (detecta por email).
 * - Los bots tienen email @destino-bot.internal para identificarlos en Supabase.
 * - Son usuarios reales de auth con perfil completo; aparecen en el feed de swipe.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Fotos reales de randomuser.me — 10 mujeres distintas
const AVATAR_BASE = 'https://randomuser.me/api/portraits/women';

const BOTS = [
  {
    email: 'valentina.garcia@destino-bot.internal',
    full_name: 'Valentina García',
    username: 'valentina_gc',
    age: 23,
    country: 'CO',
    bio: 'Amante de la música en vivo y los viajes espontáneos 🎶✈️ Me encanta descubrir cafés escondidos y buenas conversaciones.',
    interests: ['🎵 Música', '✈️ Viajes', '☕ Café', '🎬 Cine', '📸 Fotografía'],
    avatar: `${AVATAR_BASE}/1.jpg`,
  },
  {
    email: 'isabella.martinez@destino-bot.internal',
    full_name: 'Isabella Martínez',
    username: 'isa_mtz',
    age: 26,
    country: 'MX',
    bio: 'Nutricionista de día, runner de noche 🏃‍♀️ Busco a alguien que también disfrute un domingo en el parque o una buena película.',
    interests: ['💪 Fitness', '🧘 Yoga', '🌱 Naturaleza', '🍳 Cocina', '📚 Lectura'],
    avatar: `${AVATAR_BASE}/2.jpg`,
  },
  {
    email: 'camila.rodriguez@destino-bot.internal',
    full_name: 'Camila Rodríguez',
    username: 'cami_rod',
    age: 22,
    country: 'AR',
    bio: 'Estudiante de diseño, fanática del arte callejero 🎨 Si conoces buen porteño o un buen plan cultural, escribeme.',
    interests: ['🎨 Arte', '📸 Fotografía', '🎭 Teatro', '🎵 Música', '☕ Café'],
    avatar: `${AVATAR_BASE}/3.jpg`,
  },
  {
    email: 'sofia.herrera@destino-bot.internal',
    full_name: 'Sofía Herrera',
    username: 'sofi_hrr',
    age: 25,
    country: 'ES',
    bio: 'Abogada en proceso, lectora empedernida 📚 Me gustan los planes tranquilos pero no me niego a una noche de baile.',
    interests: ['📚 Lectura', '🎬 Cine', '🍷 Vinos', '✈️ Viajes', '💃 Baile'],
    avatar: `${AVATAR_BASE}/4.jpg`,
  },
  {
    email: 'daniela.torres@destino-bot.internal',
    full_name: 'Daniela Torres',
    username: 'dani_trs',
    age: 28,
    country: 'VE',
    bio: 'Chef amateur y bailarina de salsa los fines de semana 💃🍳 La cocina y la música son mi idioma. ¿El tuyo?',
    interests: ['🍳 Cocina', '💃 Baile', '🎵 Música', '🏖️ Playa', '📸 Fotografía'],
    avatar: `${AVATAR_BASE}/5.jpg`,
  },
  {
    email: 'alejandra.flores@destino-bot.internal',
    full_name: 'Alejandra Flores',
    username: 'ale_flores',
    age: 21,
    country: 'PE',
    bio: 'Gamer, otaku y amante de la comida peruana 🎮 No te asustes, también salgo del cuarto jaja.',
    interests: ['🎮 Gaming', '🎵 Música', '🎬 Cine', '🍳 Cocina', '📚 Lectura'],
    avatar: `${AVATAR_BASE}/6.jpg`,
  },
  {
    email: 'natalia.ramirez@destino-bot.internal',
    full_name: 'Natalia Ramírez',
    username: 'nati_rmz',
    age: 27,
    country: 'CL',
    bio: 'Profesora de yoga y senderismo los fines de semana 🧘‍♀️🏔️ Creo en el equilibrio: meditación mañana, pisco sour en la tarde.',
    interests: ['🧘 Yoga', '🌱 Naturaleza', '💪 Fitness', '📚 Lectura', '☕ Café'],
    avatar: `${AVATAR_BASE}/7.jpg`,
  },
  {
    email: 'gabriela.castro@destino-bot.internal',
    full_name: 'Gabriela Castro',
    username: 'gabi_cst',
    age: 24,
    country: 'EC',
    bio: 'Periodista, viajera incansable y adicta al café ☕✈️ He visitado 12 países y no pienso parar. ¿Me acompañas al siguiente?',
    interests: ['✈️ Viajes', '☕ Café', '📸 Fotografía', '📚 Lectura', '🎭 Teatro'],
    avatar: `${AVATAR_BASE}/8.jpg`,
  },
  {
    email: 'luciana.morales@destino-bot.internal',
    full_name: 'Luciana Morales',
    username: 'luci_mrl',
    age: 29,
    country: 'CR',
    bio: 'Bióloga marina y surfista de corazón 🌊🐠 La playa es mi lugar favorito del mundo. Busco alguien a quien no le asuste mojarse.',
    interests: ['🏖️ Playa', '🌱 Naturaleza', '💪 Fitness', '🐶 Mascotas', '📸 Fotografía'],
    avatar: `${AVATAR_BASE}/9.jpg`,
  },
  {
    email: 'mariana.vargas@destino-bot.internal',
    full_name: 'Mariana Vargas',
    username: 'mari_vrg',
    age: 23,
    country: 'MX',
    bio: 'Actriz amateur, cinéfila y fan de los conciertos 🎭🎸 Si tienes buenas recomendaciones de películas o planes, ya tenemos de qué hablar.',
    interests: ['🎭 Teatro', '🎬 Cine', '🎵 Música', '🎸 Guitarra', '💃 Baile'],
    avatar: `${AVATAR_BASE}/10.jpg`,
  },
];

const BOT_PASSWORD = 'Destino@Bot2025!#';

async function run() {
  console.log('🤖 Iniciando seeding de bots...\n');
  let created = 0;
  let skipped = 0;

  // Obtener lista una sola vez para el check de duplicados
  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingEmails = new Set((userList?.users || []).map(u => u.email));

  for (const bot of BOTS) {
    if (existingEmails.has(bot.email)) {
      console.log(`⏭  ${bot.full_name} ya existe — omitiendo`);
      skipped++;
      continue;
    }

    // Crear usuario en auth; user_metadata ayuda al trigger handle_new_user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: bot.email,
      password: BOT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: bot.full_name,
        avatar_url: bot.avatar,
      },
    });

    if (authErr) {
      console.error(`❌ Error auth ${bot.full_name}: ${authErr.message}`);

      // Si el trigger falla la tx, Supabase a veces igualmente genera el UUID
      // Intentar buscar al usuario por email en la lista refrescada
      const { data: refreshed } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const found = refreshed?.users?.find(u => u.email === bot.email);
      if (!found) continue;
      console.log(`   ↳ Encontrado por email tras el error — usando ID existente`);
      authData = { user: found };
    }

    const userId = authData.user.id;

    // Upsert perfil completo (sobrescribe lo que puso el trigger con datos completos)
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: bot.full_name,
      username: bot.username,
      age: bot.age,
      gender: 'female',
      bio: bot.bio,
      country: bot.country,
      language: 'es',
      interests: bot.interests,
      avatar_url: bot.avatar,
      is_creator: false,
      is_adult_creator: false,
      is_incognito: false,
      premium_tier: 'basic',
      is_premium: false,
      is_verified: false,
      last_active: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'id' });

    if (profileErr) {
      console.error(`❌ Error perfil ${bot.full_name}: ${profileErr.message}`);
      continue;
    }

    console.log(`✅ ${bot.full_name} (@${bot.username}) — ${bot.country} — ${bot.age} años`);
    created++;
  }

  console.log(`\n✨ Listo: ${created} bots creados, ${skipped} ya existían.`);
  if (created > 0) {
    console.log('\nEmails de los bots (para administrarlos en Supabase):');
    BOTS.forEach(b => console.log(`  ${b.email}`));
  }
}

run().catch(console.error);
