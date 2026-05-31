// Caché en memoria muy simple con TTL. Para multi-instancia usar Redis;
// para Railway/single-instance este cache es 4× más rápido que Supabase.

const store = new Map(); // key → { value, expires }

const DEFAULT_TTL_MS = 60 * 1000; // 1 minuto

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(key); return null; }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Limpiar entradas viejas si el store crece mucho
  if (store.size > 10000) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.expires) store.delete(k);
    }
  }
}

export function cacheDel(key) {
  store.delete(key);
}

// Invalidar todas las keys con un prefijo (p.ej. "profile:<userId>")
export function cacheDelPrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

// Wrapper helper: ejecuta fn() solo si no hay cache.
// async cached(key, ttlMs, fn) → value
export async function cached(key, ttlMs, fn) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) cacheSet(key, value, ttlMs);
  return value;
}
