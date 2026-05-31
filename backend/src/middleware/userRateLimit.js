// Rate limit POR USUARIO (no por IP) — defiende contra atacantes con muchas IPs.
// Token bucket en memoria. Para multi-instancia usar Redis.

const buckets = new Map(); // userId → { tokens, lastRefill }

function getBucket(userId, maxTokens, refillPerSec) {
  let b = buckets.get(userId);
  const now = Date.now();
  if (!b) {
    b = { tokens: maxTokens, lastRefill: now };
    buckets.set(userId, b);
    return b;
  }
  const elapsed = (now - b.lastRefill) / 1000;
  if (elapsed > 0) {
    b.tokens = Math.min(maxTokens, b.tokens + elapsed * refillPerSec);
    b.lastRefill = now;
  }
  return b;
}

/**
 * Factory de middleware. Cada llamada consume 1 token; cuando se acaban → 429.
 * @param {object} opts
 * @param {number} opts.max     Capacidad del bucket (burst)
 * @param {number} opts.perSec  Tokens regenerados por segundo
 * @param {string} opts.name    Nombre para logging
 */
export function perUserRateLimit({ max = 60, perSec = 1, name = 'general' } = {}) {
  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();
    const b = getBucket(userId, max, perSec);
    if (b.tokens < 1) {
      const retryAfter = Math.ceil((1 - b.tokens) / perSec);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Demasiadas solicitudes (${name}). Espera ${retryAfter}s.`,
        code: 'USER_RATE_LIMIT',
        retry_after: retryAfter,
      });
    }
    b.tokens -= 1;
    next();
  };
}

// Limpieza de buckets viejos cada 10 min para no fugar memoria
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [uid, b] of buckets) {
    if (b.lastRefill < cutoff && b.tokens >= 0.99) buckets.delete(uid);
  }
}, 10 * 60 * 1000);
