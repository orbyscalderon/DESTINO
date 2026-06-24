// Service Worker — strategies tuned por tipo de recurso.
// Bump version cuando cambies lógica de cache para forzar refresh en clients.
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `Destino TV-static-${CACHE_VERSION}`;
const API_CACHE    = `Destino TV-api-${CACHE_VERSION}`;
const IMAGE_CACHE  = `Destino TV-images-${CACHE_VERSION}`;
const APP_SHELL = ['/', '/manifest.json'];

// Endpoints que se benefician de cache (datos relativamente estáticos)
const CACHEABLE_API_PATTERNS = [
  /^\/api\/seo\/featured-creators/,
  /^\/api\/compliance\/config/,
  /^\/api\/adult-categories$/,
  /^\/api\/explore\/categories/,
  /^\/api\/explore\/tags/,
];
const API_CACHE_MAX_AGE_MS = {
  default: 10 * 60 * 1000,           // 10 min para la mayoría
  '/api/compliance/config': 60 * 60 * 1000, // 1 hora (cambia raro)
};

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: limpiar caches viejos ───────────────────────────────
self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, API_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Helpers ────────────────────────────────────────────────────────
function isApiCacheable(pathname) {
  return CACHEABLE_API_PATTERNS.some(re => re.test(pathname));
}

function isStaticAsset(pathname) {
  // Vite genera /assets/*.js, /assets/*.css con hash en filename
  // → cache forever sin worry de invalidación
  return pathname.startsWith('/assets/') || pathname.startsWith('/icon-') ||
         pathname === '/favicon.svg' || pathname === '/manifest.json';
}

function isImageRequest(req) {
  return req.destination === 'image' || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(new URL(req.url).pathname);
}

// stale-while-revalidate: devuelve cached inmediato + fetch en background
async function staleWhileRevalidate(cache, request) {
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}

// network-first con timeout fallback a cache (para data fresh siempre)
async function networkFirstWithFallback(cache, request, timeoutMs = 2000) {
  const networkPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(async () => {
      const cached = await cache.match(request);
      if (cached) resolve(cached);
    }, timeoutMs);
  });
  return Promise.race([networkPromise, timeoutPromise]).catch(() => cache.match(request));
}

// ── Fetch: routing por tipo ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Cross-origin: no interferir (Supabase, LiveKit, Sentry, fonts.google, etc.)
  if (url.origin !== self.location.origin) return;

  // ── Static assets (bundle JS/CSS, icons, manifest): cache-first forever ──
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  // ── API cacheables: stale-while-revalidate con TTL ──
  if (url.pathname.startsWith('/api/') && isApiCacheable(url.pathname)) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => staleWhileRevalidate(cache, event.request))
    );
    return;
  }

  // ── API normales: network-only (no cache, datos sensibles o dinámicos) ──
  if (url.pathname.startsWith('/api/')) return;

  // ── Imágenes: stale-while-revalidate (cuesta cargar, cambian raro) ──
  if (isImageRequest(event.request)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => staleWhileRevalidate(cache, event.request))
    );
    return;
  }

  // ── HTML / resto: network-first con fallback a cache (offline mode básico) ──
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) => networkFirstWithFallback(cache, event.request))
  );
});

// ── Push notifications ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Destino TV', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.url || 'Destino TV',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

// ── Notification click ────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
