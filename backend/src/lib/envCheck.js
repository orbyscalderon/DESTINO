// Validación de env vars al startup.
// Política:
//   - CRITICAL faltante en production → exit(1). Railway reintentará el container.
//   - CRITICAL faltante en development → warning solamente.
//   - OPTIONAL faltante → warning siempre.
//
// El objetivo: que el server NUNCA arranque con missing critical en prod,
// y que dev pueda probar features parciales sin tener todas las keys.

const CRITICAL = [
  // Storage
  { key: 'SUPABASE_URL',         hint: 'https://YOUR_PROJECT.supabase.co' },
  { key: 'SUPABASE_SERVICE_KEY', alt: 'SUPABASE_SERVICE_ROLE_KEY', hint: 'Dashboard → Settings → API → service_role' },
];

const IMPORTANT = [
  // Pagos
  { key: 'STRIPE_SECRET_KEY',     hint: 'sk_live_... (sk_test_ en dev)', prefix: 'sk_' },
  { key: 'STRIPE_WEBHOOK_SECRET', hint: 'whsec_...', prefix: 'whsec_' },
  // Email
  { key: 'RESEND_API_KEY', hint: 're_...', prefix: 're_' },
  // Auth tokens
  { key: 'LIVEKIT_API_KEY' },
  { key: 'LIVEKIT_API_SECRET' },
  { key: 'LIVEKIT_URL', hint: 'wss://...' },
  // Encryption
  { key: 'PAYOUT_ENCRYPTION_KEY', hint: 'openssl rand -hex 32 (64 chars)' },
  { key: 'TOTP_ENCRYPTION_KEY',   hint: 'openssl rand -hex 32 (64 chars)' },
];

const OPTIONAL = [
  { key: 'OPENAI_API_KEY',          why: 'sin esto: AI Persona + icebreakers + moderación texto degradadan' },
  { key: 'SIGHTENGINE_USER',        why: 'sin esto: imágenes/videos sin moderación automática' },
  { key: 'SIGHTENGINE_SECRET',      why: 'idem' },
  { key: 'TURNSTILE_SECRET_KEY',    why: 'sin esto: signup sin captcha' },
  { key: 'SENTRY_DSN',              why: 'sin esto: errors no llegan a monitoring' },
  { key: 'CCBILL_ACCOUNT_NUMBER',   why: 'sin esto: creators adultos no cobran' },
  { key: 'CCBILL_WEBHOOK_HMAC_SECRET', why: 'idem' },
];

function present(spec) {
  const v = process.env[spec.key] || (spec.alt && process.env[spec.alt]);
  if (!v) return { ok: false, value: null };
  if (spec.prefix && !v.startsWith(spec.prefix)) {
    return { ok: false, value: v, malformed: `esperaba prefix "${spec.prefix}"` };
  }
  return { ok: true, value: v };
}

// Decodifica el claim `role` de un JWT de Supabase sin verificar la firma
// (solo lo usamos para detectar una key mal puesta, no para autorizar).
function jwtRole(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

// Guard CRÍTICO de "variable": el backend DEBE usar la key `service_role`
// (bypassa RLS). Si por error alguien pone la `anon` key aquí, el backend
// queda sujeto a RLS y todo se rompe o se filtra de forma silenciosa; y si
// la `service_role` acaba en el frontend, es game over (bypass total de RLS).
// Fallamos ruidosamente en prod.
function assertServiceRoleKey(isProd) {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return; // ya cubierto por CRITICAL missing
  const role = jwtRole(key);
  if (role === 'service_role') return; // correcto
  const msg = role === 'anon'
    ? 'SUPABASE_SERVICE_KEY contiene una ANON key (role=anon). El backend quedaría sujeto a RLS.'
    : `SUPABASE_SERVICE_KEY no parece una service_role key (role=${role ?? 'desconocido'}).`;
  if (isProd) {
    console.error(`❌ ${msg}`);
    console.error('   Usá la key service_role (Dashboard → Settings → API → service_role). Abortando.');
    process.exit(1);
  }
  console.warn(`⚠️  ${msg}`);
}

// Las claves de cifrado AES-256 deben ser 32 bytes = 64 hex chars.
// Una key corta = cifrado débil de payouts/TOTP.
function assertEncryptionKeys(isProd) {
  const keys = ['PAYOUT_ENCRYPTION_KEY', 'TOTP_ENCRYPTION_KEY'];
  for (const k of keys) {
    const v = process.env[k];
    if (!v) continue; // ausencia ya se avisa en IMPORTANT
    if (!/^[0-9a-fA-F]{64}$/.test(v)) {
      const msg = `${k} debe ser 64 chars hex (32 bytes). Generá con: openssl rand -hex 32`;
      if (isProd) { console.error(`❌ ${msg}`); process.exit(1); }
      console.warn(`⚠️  ${msg}`);
    }
  }
}

export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const criticalMissing = [];
  const importantMissing = [];
  const optionalMissing = [];
  const malformed = [];

  for (const spec of CRITICAL) {
    const r = present(spec);
    if (!r.ok) criticalMissing.push(spec);
    if (r.malformed) malformed.push({ ...spec, reason: r.malformed });
  }
  for (const spec of IMPORTANT) {
    const r = present(spec);
    if (!r.ok) importantMissing.push(spec);
    if (r.malformed) malformed.push({ ...spec, reason: r.malformed });
  }
  for (const spec of OPTIONAL) {
    const r = present(spec);
    if (!r.ok) optionalMissing.push(spec);
  }

  // En prod, malformed = error fatal (mejor fallar que procesar pagos con key inválida)
  if (isProd && malformed.length > 0) {
    console.error('❌ Variables de entorno MALFORMED:');
    for (const m of malformed) console.error(`   - ${m.key}: ${m.reason}`);
    process.exit(1);
  }

  // En prod, CRITICAL faltante = exit. Sin SUPABASE el server no hace nada útil.
  if (isProd && criticalMissing.length > 0) {
    console.error('❌ Faltan variables CRÍTICAS en producción:');
    for (const c of criticalMissing) {
      console.error(`   - ${c.key}${c.alt ? ` (o ${c.alt})` : ''}${c.hint ? ` — ${c.hint}` : ''}`);
    }
    console.error('   El server NO va a arrancar. Setear en Railway dashboard.');
    process.exit(1);
  }

  // CRITICAL en dev → warning
  if (criticalMissing.length > 0) {
    console.warn('⚠️  CRITICAL vars faltantes (en dev, OK):');
    for (const c of criticalMissing) console.warn(`   - ${c.key}`);
  }

  if (importantMissing.length > 0) {
    console.warn(`⚠️  ${importantMissing.length} important vars faltantes:`);
    for (const i of importantMissing) console.warn(`   - ${i.key}${i.hint ? ` (${i.hint})` : ''}`);
  }

  if (optionalMissing.length > 0 && isProd) {
    console.warn(`ℹ️  ${optionalMissing.length} optional vars faltantes (features degradadas):`);
    for (const o of optionalMissing) console.warn(`   - ${o.key} — ${o.why}`);
  }

  // Stripe live vs test en prod
  if (isProd && process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.warn('⚠️  STRIPE en modo TEST (sk_test_) corriendo en producción.');
  }

  // Guards de seguridad de claves (rol correcto + fuerza de cifrado)
  assertServiceRoleKey(isProd);
  assertEncryptionKeys(isProd);

  console.log('✓ Env validation OK');
}
