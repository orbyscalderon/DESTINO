import { supabase } from '../lib/supabase.js';

// Caché en memoria de geo-blocks (refresca cada 10 min)
let geoBlockCache = { data: [], expires: 0 };
async function getGeoBlocks() {
  if (Date.now() < geoBlockCache.expires) return geoBlockCache.data;
  const { data } = await supabase
    .from('geo_blocks')
    .select('country_code, region_code')
    .eq('active', true);
  geoBlockCache = { data: data || [], expires: Date.now() + 10 * 60 * 1000 };
  return geoBlockCache.data;
}

// Determina country/region desde headers de proxy o IP
function getRequestGeo(req) {
  // CloudFlare / Vercel: cf-ipcountry / x-vercel-ip-country
  const country = (req.headers['cf-ipcountry']
                || req.headers['x-vercel-ip-country']
                || req.headers['x-country-code']
                || '').toString().toUpperCase().substring(0, 2);
  // Para región: cf-ipregion (CloudFlare Enterprise) / x-vercel-ip-country-region
  const region  = (req.headers['cf-region-code']
                || req.headers['x-vercel-ip-country-region']
                || '').toString().toUpperCase();
  return { country, region: country && region ? `${country}-${region}` : null };
}

// Bloquea acceso desde regiones con leyes anti-porn / verificación estricta
export async function geoBlockAdult(req, res, next) {
  try {
    const { country, region } = getRequestGeo(req);
    if (!country) return next();   // no se pudo detectar → permitir (fail-open en dev)

    const blocks = await getGeoBlocks();
    const blocked = blocks.find(b =>
      (b.country_code === country && !b.region_code) ||
      (b.region_code && b.region_code === region)
    );

    if (blocked) {
      return res.status(451).json({
        error: 'Este contenido no está disponible en tu región por restricciones legales.',
        code: 'GEO_BLOCKED',
        country, region,
      });
    }
    next();
  } catch {
    next();
  }
}

// Gate para contenido adulto (18+).
//
// Verifica en orden:
//   1. Usuario no baneado
//   2. date_of_birth presente + edad calculada >= 18 (fuente de verdad)
//   3. age_verified_at O is_adult_creator (verificación explícita del user)
//
// Antes solo chequeaba (3) — un menor podía marcar checkbox y pasar. Ahora
// (2) es hard gate: sin DOB o con DOB < 18, retorna 403 aunque haya checkbox.
export async function requireAgeVerified(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { data: prof } = await supabase
      .from('profiles')
      .select('date_of_birth, age_verified_at, is_adult_creator, is_banned, premium_tier')
      .eq('id', userId)
      .single();

    if (prof?.is_banned) {
      return res.status(403).json({ error: 'Cuenta bloqueada', code: 'ACCOUNT_BANNED' });
    }

    // Hard gate: DOB requerida
    if (!prof?.date_of_birth) {
      return res.status(403).json({
        error: 'Debes proporcionar tu fecha de nacimiento para acceder a esta sección',
        code: 'DOB_REQUIRED',
      });
    }

    // Cálculo server-side de edad (no confía en frontend)
    const dob = new Date(prof.date_of_birth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;

    if (age < 18) {
      return res.status(403).json({
        error: 'Esta sección es solo para mayores de 18 años',
        code: 'UNDERAGE',
      });
    }

    // Consent explícito adicional (checkbox 18+ o creator verificado)
    const consented = prof?.age_verified_at || prof?.is_adult_creator;
    if (!consented) {
      return res.status(403).json({
        error: 'Esta sección requiere verificación de edad',
        code: 'AGE_VERIFICATION_REQUIRED',
      });
    }

    req.geo = getRequestGeo(req);
    req.userAge = age;
    next();
  } catch (err) {
    // Log real — antes tragaba el error silencioso
    console.error('[requireAgeVerified]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
