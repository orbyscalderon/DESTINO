import { Router } from 'express';
import { sitemapXml, getProfileMeta, publicStats, featuredCreators } from '../controllers/seoController.js';

const router = Router();

// Endpoints públicos (sin auth) — para crawlers, prerender services y landing.
router.get('/sitemap.xml', sitemapXml);
router.get('/profile/:id', getProfileMeta);
router.get('/public-stats', publicStats);
router.get('/featured-creators', featuredCreators);

export default router;
