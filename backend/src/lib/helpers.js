// Helpers compartidos: sanitización, validación, error handling.

const isProduction = () => process.env.NODE_ENV === 'production';

// Sanitizar mensajes de error antes de enviarlos al cliente.
// En producción, NUNCA devolver err.message (puede contener SQL, paths, URLs
// internas, datos sensibles). En dev, devolver para facilitar debug.
export function safeErrorMessage(err, fallback = 'Error interno del servidor') {
  if (!isProduction()) {
    return err?.message || fallback;
  }
  return fallback;
}

// Escape HTML para prevenir inyección en templates de email + UI con user content.
// Usar en cualquier interpolación de nombre, descripción, mensaje que provenga
// de usuario en HTML server-side rendered.
const HTML_ESCAPE_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&#x27;', '/': '&#x2F;',
};
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"'/]/g, c => HTML_ESCAPE_MAP[c]);
}

// Validar UUID formato (defensa contra inyección de Supabase filter syntax)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Validación segura de números (rechaza NaN, Infinity, strings vacíos)
export function safeNumber(v, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const n = integer ? parseInt(v, 10) : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

// Validar magic bytes de imagen (defensa real contra mime-type spoofing)
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.slice(0, 12).toString('hex').toLowerCase();
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('ffd8ff'))             return 'image/jpeg';
  if (hex.startsWith('47494638'))           return 'image/gif';
  // WebP: RIFF....WEBP
  if (hex.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function detectVideoType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.slice(0, 12).toString('hex').toLowerCase();
  // MP4: ....ftyp (varios subtipos)
  if (buffer.slice(4, 8).toString() === 'ftyp') return 'video/mp4';
  // QuickTime / MOV
  if (buffer.slice(4, 8).toString() === 'moov') return 'video/quicktime';
  // WebM / Matroska
  if (hex.startsWith('1a45dfa3')) return 'video/webm';
  return null;
}

// Truncate seguro para strings que se persisten en DB
export function safeString(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.substring(0, max) : s;
}

// Procesar items en batches para evitar tumbar APIs externas (Resend, FCM, etc.)
export async function processBatched(items, batchSize, processItem, delayMs = 100) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processItem));
    results.push(...batchResults);
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}
