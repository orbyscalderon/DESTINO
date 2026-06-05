import { supabase } from '../lib/supabase.js';

const APP_URL = process.env.FRONTEND_URL || 'https://destino-sigma.vercel.app';
const CACHE_MAX_AGE = 60 * 60; // 1 hora

// GET /sitemap.xml — sitemap dinámico
//
// Incluye:
// · Páginas estáticas (landing, privacy, terms, help)
// · Perfiles de creators verificados (los únicos cuyo perfil es realmente
//   público y digno de SEO; los users normales tienen perfil tras auth)
//
// Se cachea 1h en el CDN — cambios en creators tardan máximo 1h en propagar.
// Para sitemaps >50MB o >50k URLs, partir en multi-sitemap (no es el caso aún).
export const sitemapXml = async (req, res) => {
  try {
    // Creators con perfil completo y verificación. Excluimos adult creators
    // del sitemap principal — los buscadores no deben indexar 18+.
    const { data: creators } = await supabase
      .from('profiles')
      .select('id, updated_at')
      .eq('is_creator', true)
      .eq('is_verified', true)
      .eq('is_adult_creator', false)
      .not('full_name', 'is', null)
      .limit(5000); // límite seguro

    const staticUrls = [
      { loc: `${APP_URL}/`,         changefreq: 'daily',   priority: 1.0 },
      { loc: `${APP_URL}/#/login`,    changefreq: 'monthly', priority: 0.5 },
      { loc: `${APP_URL}/#/register`, changefreq: 'monthly', priority: 0.6 },
      { loc: `${APP_URL}/#/privacy`,  changefreq: 'yearly',  priority: 0.3 },
      { loc: `${APP_URL}/#/terms`,    changefreq: 'yearly',  priority: 0.3 },
      { loc: `${APP_URL}/#/help`,     changefreq: 'monthly', priority: 0.4 },
      { loc: `${APP_URL}/#/dmca`,     changefreq: 'yearly',  priority: 0.2 },
    ];

    const profileUrls = (creators || []).map(c => ({
      loc:     `${APP_URL}/#/profile/${c.id}`,
      lastmod: new Date(c.updated_at).toISOString().slice(0, 10),
      changefreq: 'weekly',
      priority: 0.7,
    }));

    const urls = [...staticUrls, ...profileUrls].map(u => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`);
    res.send(xml);
  } catch (err) {
    console.error('[sitemap]', err);
    res.status(500).send('Error generando sitemap');
  }
};

// GET /api/seo/profile/:id — datos para meta tags de perfil público
//
// El bundle SPA no puede renderizar meta tags por ruta (HashRouter + cliente).
// Esta endpoint expone los datos públicos del perfil para que un prerender
// (Vercel Edge / Cloudflare Worker) o un OG-generator los inyecte.
//
// Solo devuelve datos no-sensibles. RLS en BD evita exposición accidental.
export const getProfileMeta = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido' });

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, bio, avatar_url, city, country, is_creator, is_verified, is_adult_creator, hide_age, age')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Perfil no encontrado' });

    // Adult creators no se devuelven en metadata pública (no SEO)
    if (data.is_adult_creator) return res.status(403).json({ error: 'Perfil no público' });

    res.set('Cache-Control', 'public, max-age=600, s-maxage=600'); // 10 min
    res.json({
      id: data.id,
      name: data.full_name,
      bio: data.bio?.slice(0, 280) || null,
      image: data.avatar_url,
      location: [data.city, data.country].filter(Boolean).join(', ') || null,
      is_creator: data.is_creator,
      is_verified: data.is_verified,
      age: data.hide_age ? null : data.age,
    });
  } catch (err) {
    console.error('[seo profile meta]', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// GET /api/seo/public-stats — números para social proof en landing
//
// Devolvemos cifras aproximadas (no exactas) para reducir ataques de
// enumeración. Se cachea agresivamente.
export const publicStats = async (req, res) => {
  try {
    const [
      { count: usersCount },
      { count: creatorsCount },
      { count: activeShowsCount },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'estimated', head: true }),
      supabase.from('profiles').select('id', { count: 'estimated', head: true }).eq('is_creator', true),
      supabase.from('live_shows').select('id', { count: 'estimated', head: true }).eq('status', 'live'),
    ]);

    // Redondear para social proof — 12347 → 12k+, 8765 → 8k+
    const roundDown = (n) => {
      if (!n || n < 100) return n || 0;
      if (n < 1000) return Math.floor(n / 100) * 100;
      return Math.floor(n / 1000) * 1000;
    };

    res.set('Cache-Control', 'public, max-age=300, s-maxage=300'); // 5 min
    res.json({
      users:        roundDown(usersCount || 0),
      creators:     roundDown(creatorsCount || 0),
      live_now:     activeShowsCount || 0, // los lives sí los queremos exactos
    });
  } catch (err) {
    console.error('[seo public-stats]', err);
    res.json({ users: 0, creators: 0, live_now: 0 });
  }
};

// GET /api/seo/featured-creators — top 6 creators verificados para landing
export const featuredCreators = async (req, res) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, bio')
      .eq('is_creator', true)
      .eq('is_verified', true)
      .eq('is_adult_creator', false)
      .not('avatar_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(6);

    res.set('Cache-Control', 'public, max-age=600, s-maxage=600');
    res.json({
      creators: (data || []).map(c => ({
        id: c.id,
        name: c.full_name,
        avatar: c.avatar_url,
        tag: c.bio?.slice(0, 40) || null,
      })),
    });
  } catch (err) {
    res.json({ creators: [] });
  }
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
