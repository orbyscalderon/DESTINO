// Moderación automática con Sightengine
// https://sightengine.com/docs/image-moderation
//
// Env vars:
//   SIGHTENGINE_USER   — tu API user
//   SIGHTENGINE_SECRET — tu API secret
//
// Si las env vars no están configuradas, la función devuelve { ok: true,
// skipped: true } y el flujo continúa como antes (sin moderación).

const MODELS = 'nudity-2.1,wad,offensive,gore,minor';

const THRESHOLD_REJECT = 0.85;
const THRESHOLD_ADULT  = 0.40;

/**
 * Modera una imagen o video desde URL.
 * @param {string} url - URL pública de la imagen/video
 * @param {object} opts - { allowAdult: true si el creador es adulto verificado }
 * @returns {Promise<{
 *   ok: boolean,           // false → rechazar contenido
 *   reason?: string,       // razón de rechazo
 *   isAdult?: boolean,     // contenido tiene nudez/adulto pero permitido
 *   skipped?: boolean,     // moderación no configurada
 *   scores?: object,       // scores raw de sightengine
 * }>}
 */
export async function moderateImage(url, opts = {}) {
  const user   = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;

  if (!user || !secret) {
    return { ok: true, skipped: true };
  }
  if (!url) return { ok: true, skipped: true };

  try {
    const params = new URLSearchParams({
      url, models: MODELS, api_user: user, api_secret: secret,
    });
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`, {
      method: 'GET',
      // 10s timeout
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.status !== 'success') {
      console.warn('[moderation] sightengine non-success:', data.error?.message || data.status);
      return { ok: true, skipped: true };
    }

    // Rechazo automático: menor de edad detectado en contexto sexual
    const minor = data.minor?.prob ?? 0;
    if (minor > 0.5) {
      return { ok: false, reason: 'minor_detected', scores: data };
    }
    // Rechazo: gore severo
    const gore = data.gore?.prob ?? 0;
    if (gore > THRESHOLD_REJECT) {
      return { ok: false, reason: 'gore', scores: data };
    }
    // Rechazo: drogas o armas si no permitido (wad)
    const wad = Math.max(data.weapon?.prob ?? 0, data.alcohol?.prob ?? 0, data.drugs?.prob ?? 0);
    if (wad > THRESHOLD_REJECT) {
      return { ok: false, reason: 'wad', scores: data };
    }

    // Nudez — depende del creador
    const nudityRaw = data.nudity?.sexual_activity ?? data.nudity?.sexual_display ?? data.nudity?.erotica ?? 0;
    const nudity    = Math.max(data.nudity?.raw ?? 0, nudityRaw);
    if (nudity > THRESHOLD_REJECT) {
      // Permitir solo si el creador es adulto verificado y opts.allowAdult=true
      if (opts.allowAdult) return { ok: true, isAdult: true, scores: data };
      return { ok: false, reason: 'nudity', scores: data };
    }
    if (nudity > THRESHOLD_ADULT) {
      return { ok: true, isAdult: opts.allowAdult ?? false, scores: data };
    }

    return { ok: true, scores: data };
  } catch (err) {
    console.warn('[moderation] error:', err.message);
    // Si la moderación falla, no bloqueamos al usuario — el contenido va a cola manual
    return { ok: true, skipped: true, error: err.message };
  }
}
