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

// Requiere age_verified_at en profile (consumer ya consintió ser 18+)
export async function requireAgeVerified(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { data: prof } = await supabase
      .from('profiles')
      .select('age_verified_at, is_adult_creator, is_banned, premium_tier')
      .eq('id', userId)
      .single();

    if (prof?.is_banned) {
      return res.status(403).json({ error: 'Cuenta bloqueada', code: 'ACCOUNT_BANNED' });
    }

    const verified = prof?.age_verified_at || prof?.is_adult_creator;
    if (!verified) {
      return res.status(403).json({
        error: 'Esta sección requiere verificación de edad',
        code: 'AGE_VERIFICATION_REQUIRED',
      });
    }

    req.geo = getRequestGeo(req);
    next();
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
