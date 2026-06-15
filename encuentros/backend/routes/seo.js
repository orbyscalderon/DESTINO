// SEO — sitemap.xml dinámico + robots.txt.
// Sitemap incluye solo listings activos + páginas legales.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const frontend = (process.env.FRONTEND_URL || '').split(',')[0].replace(/\/$/, '');
    const { data: listings } = await supabase
      .from('encuentros_listings')
      .select('id, updated_at')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
      .limit(5000);

    const staticPages = ['/', '/publish', '/terms', '/privacy', '/2257', '/dmca', '/dsa', '/contact'];
    const urls = [
      ...staticPages.map(p => `<url><loc>${frontend}${p}</loc></url>`),
      ...(listings || []).map(l =>
        `<url><loc>${frontend}/#/l/${l.id}</loc><lastmod>${new Date(l.updated_at).toISOString().split('T')[0]}</lastmod></url>`
      ),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    res.status(500).send('error');
  }
});

export default router;
