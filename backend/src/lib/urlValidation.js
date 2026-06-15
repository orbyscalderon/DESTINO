// Validación de URLs de imagen aceptadas en el backend (avatares, banners, etc.).
//
// Objetivo: prevenir SSRF (Server-Side Request Forgery), inyección de URLs
// de hosts internos (metadata services en AWS/GCP), y URLs con schemes
// peligrosos (javascript:, data:, file:).
//
// Whitelist por defecto:
//   - El host del SUPABASE_URL configurado (storage propio).
//   - ui-avatars.com (placeholder usado en frontend).
//   - El propio backend (FRONTEND_URL / API_BASE_URL si está definido).
//
// Para agregar hosts permitidos sin tocar código, set ALLOWED_IMAGE_HOSTS
// como CSV: "cdn.midominio.com,images.otra.com".

const FALLBACK_HOSTS = ['ui-avatars.com'];

function parseAllowedHostsFromEnv() {
  const set = new Set(FALLBACK_HOSTS);
  if (process.env.SUPABASE_URL) {
    try { set.add(new URL(process.env.SUPABASE_URL).host); } catch {}
  }
  if (process.env.FRONTEND_URL) {
    try { set.add(new URL(process.env.FRONTEND_URL).host); } catch {}
  }
  if (process.env.API_BASE_URL) {
    try { set.add(new URL(process.env.API_BASE_URL).host); } catch {}
  }
  if (process.env.ALLOWED_IMAGE_HOSTS) {
    for (const h of process.env.ALLOWED_IMAGE_HOSTS.split(',').map(s => s.trim()).filter(Boolean)) {
      set.add(h);
    }
  }
  return set;
}

// Cacheamos el set para no recomputar en cada llamada.
let allowedHostsCache = null;
function getAllowedHosts() {
  if (!allowedHostsCache) allowedHostsCache = parseAllowedHostsFromEnv();
  return allowedHostsCache;
}

// IPs privadas / loopback / metadata cloud — rechazar incluso si resuelve a hosts permitidos
// (el atacante podría usar un dominio que resuelve a 169.254.169.254).
function isBlockedIp(hostname) {
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
  // IPv4 ranges peligrosos
  if (/^127\./.test(hostname)) return true;       // loopback
  if (/^10\./.test(hostname)) return true;        // private
  if (/^192\.168\./.test(hostname)) return true;  // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true; // private
  if (/^169\.254\./.test(hostname)) return true;  // link-local + cloud metadata
  if (/^::1$/.test(hostname)) return true;        // IPv6 loopback
  if (/^fe80:/.test(hostname)) return true;       // IPv6 link-local
  if (/^fc/.test(hostname) || /^fd/.test(hostname)) return true; // IPv6 ULA
  return false;
}

/**
 * Valida que una URL sea segura para guardar/servir como imagen de usuario.
 *
 * @param {string} url
 * @param {object} opts
 * @param {boolean} opts.allowEmpty — si true, '' / null / undefined → válido.
 * @returns {boolean}
 */
export function isAllowedImageUrl(url, { allowEmpty = false } = {}) {
  if (!url) return !!allowEmpty;
  if (typeof url !== 'string') return false;
  if (url.length > 2048) return false;

  let parsed;
  try { parsed = new URL(url); } catch { return false; }

  // Solo https (rechazamos http, javascript:, data:, file:, ftp:, etc.)
  if (parsed.protocol !== 'https:') return false;

  if (isBlockedIp(parsed.hostname)) return false;

  const allowed = getAllowedHosts();
  // Match exacto del host (no permitir subdominios arbitrarios — un atacante
  // podría crear "ui-avatars.com.evil.com" para bypass).
  return allowed.has(parsed.hostname);
}

/**
 * Versión que devuelve la URL si es válida, o null. Útil en inserts.
 */
export function sanitizeImageUrl(url) {
  return isAllowedImageUrl(url, { allowEmpty: true }) ? (url || null) : null;
}

// Solo para tests / debugging — exposed para inspección manual.
export function _resetCache() { allowedHostsCache = null; }
