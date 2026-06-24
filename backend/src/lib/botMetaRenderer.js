// Pre-rendering de meta tags para crawlers/bots.
//
// Problema: HashRouter (/#/profile/123) significa que Twitter/WhatsApp/iMessage
// crawlers ven el HTML estático del index.html con meta tags genéricos en vez
// de los meta tags del recurso específico (perfil, show, video).
//
// Solución: middleware Express que detecta User-Agent de bots, fetcha datos
// del recurso de la URL, y devuelve HTML con OG/Twitter tags reales.
//
// Para humanos (User-Agent normal), pasa el request al next() y devuelve
// el index.html normal sin tocar.
//
// Cuando se migre a Cloudflare Pages/Bunny.net, este código se mueve a un
// Worker/Edge Function que hace lo mismo en el edge.

import { supabase } from './supabase.js';

const BOT_USER_AGENTS = /bot|crawler|spider|crawl|googlebot|bingbot|slurp|duckduckbot|yandexbot|baiduspider|twitterbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|applebot|embedly|skypeuripreview|pinterestbot|redditbot|tumblr|vkshare/i;

const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0] || '';

// Patrones de rutas que generan meta tags específicos.
// Cada uno tiene un fetcher async que retorna { title, description, image, type }.
const ROUTE_RESOLVERS = [
  {
    // /profile/:id o /#/profile/:id
    pattern: /^\/(?:#\/)?profile\/([0-9a-f-]{36})$/i,
    fetch: async (id) => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, bio, avatar_url, is_creator, is_verified')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        title: `${data.full_name} · Destino TV`,
        description: data.bio?.slice(0, 160) || `Conecta con ${data.full_name} en Destino TV`,
        image: data.avatar_url || `${FRONTEND_URL}/icon-512.png`,
        type: 'profile',
        url: `${FRONTEND_URL}/#/profile/${data.id}`,
      };
    },
  },
  {
    // /shows/:id
    pattern: /^\/(?:#\/)?shows\/([0-9a-f-]{36})$/i,
    fetch: async (id) => {
      const { data } = await supabase
        .from('live_shows')
        .select('id, title, description, cover_url, host:profiles!host_id(full_name)')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        title: `${data.title} · Show en vivo · Destino TV`,
        description: data.description?.slice(0, 160) || `Show en vivo de ${data.host?.full_name || 'creador'} en Destino TV`,
        image: data.cover_url || `${FRONTEND_URL}/icon-512.png`,
        type: 'video.other',
        url: `${FRONTEND_URL}/#/shows/${data.id}`,
      };
    },
  },
  {
    // /explore/v/:id
    pattern: /^\/(?:#\/)?explore\/v\/([0-9a-f-]{36})$/i,
    fetch: async (id) => {
      const { data } = await supabase
        .from('profile_videos')
        .select('id, title, description, thumbnail_url, user:profiles!user_id(full_name)')
        .eq('id', id)
        .eq('is_hidden', false)
        .maybeSingle();
      if (!data) return null;
      return {
        title: `${data.title} · Destino TV`,
        description: data.description?.slice(0, 160) || `Video de ${data.user?.full_name || 'creador'}`,
        image: data.thumbnail_url || `${FRONTEND_URL}/icon-512.png`,
        type: 'video.other',
        url: `${FRONTEND_URL}/#/explore/v/${data.id}`,
      };
    },
  },
  {
    // /c/collection/:id
    pattern: /^\/(?:#\/)?c\/collection\/([0-9a-f-]{36})$/i,
    fetch: async (id) => {
      const { data } = await supabase
        .from('photo_collections')
        .select('id, title, description, cover_url, creator:profiles!creator_id(full_name)')
        .eq('id', id)
        .eq('is_published', true)
        .maybeSingle();
      if (!data) return null;
      return {
        title: `${data.title} · Destino TV`,
        description: data.description?.slice(0, 160) || `Colección de fotos de ${data.creator?.full_name || 'creador'}`,
        image: data.cover_url || `${FRONTEND_URL}/icon-512.png`,
        type: 'website',
        url: `${FRONTEND_URL}/#/c/collection/${data.id}`,
      };
    },
  },
];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml({ title, description, image, type, url }) {
  // HTML minimalista — los bots solo leen meta tags, no JS.
  // Los humanos NUNCA ven esto (middleware solo dispara para bots).
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">

<!-- Open Graph -->
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:site_name" content="Destino TV">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<!-- Redirect para humanos accidentales -->
<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}">
<link rel="canonical" href="${escapeHtml(url)}">
</head>
<body>
<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>
</body>
</html>`;
}

/**
 * Express middleware. Mount en la raíz (antes del catch-all SPA):
 *   app.use(botMetaRenderer);
 *
 * Si el User-Agent es bot Y la URL matchea uno de los patterns,
 * fetcha data y devuelve HTML con meta tags. Sino, next().
 */
export async function botMetaRenderer(req, res, next) {
  try {
    const ua = req.headers['user-agent'] || '';
    if (!BOT_USER_AGENTS.test(ua)) return next();

    // Solo GET — bots no hacen POST
    if (req.method !== 'GET') return next();

    // No interferir con /api/, /assets/, /share/ (que ya tiene su propio handler)
    const path = req.path;
    if (path.startsWith('/api/') || path.startsWith('/assets/') ||
        path.startsWith('/share/') || path.startsWith('/.well-known/')) {
      return next();
    }

    // Buscar resolver matching
    for (const { pattern, fetch } of ROUTE_RESOLVERS) {
      const m = path.match(pattern);
      if (m) {
        const meta = await fetch(m[1]).catch(() => null);
        if (meta) {
          res.set('Cache-Control', 'public, max-age=300');
          res.set('Content-Type', 'text/html; charset=utf-8');
          return res.send(renderHtml(meta));
        }
        break; // matched route but no data → fall through al next
      }
    }

    next();
  } catch (err) {
    // En caso de error, NO romper la response — pasar al SPA normal
    next();
  }
}
