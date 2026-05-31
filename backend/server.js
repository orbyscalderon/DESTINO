// SOLO para desarrollo local con certs autofirmados — NUNCA en producción
if (process.env.NODE_ENV === 'production') {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('FATAL: NODE_TLS_REJECT_UNAUTHORIZED=0 no está permitido en producción.');
  }
} else {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
}

import { startCleanupJob } from './src/lib/cleanup.js';
import profileRoutes from './src/routes/profiles.js';
import matchRoutes from './src/routes/matches.js';
import messageRoutes from './src/routes/messages.js';
import paymentRoutes from './src/routes/payments.js';
import videoRoutes from './src/routes/video.js';
import adminRoutes from './src/routes/admin.js';
import blockRoutes from './src/routes/blocks.js';
import notificationRoutes from './src/routes/notifications.js';
import translationRoutes from './src/routes/translation.js';
import showRoutes from './src/routes/shows.js';
import creatorRoutes from './src/routes/creator.js';
import coinRoutes from './src/routes/coins.js';
import storyRoutes from './src/routes/stories.js';
import postRoutes from './src/routes/posts.js';
import followRoutes from './src/routes/follows.js';
import withdrawalRoutes from './src/routes/withdrawals.js';
import referralRoutes from './src/routes/referrals.js';
import verificationRoutes from './src/routes/verification.js';
import rtcRoutes from './src/routes/rtc.js';
import livekitRoutes from './src/routes/livekit.js';
import tipRoutes from './src/routes/tips.js';
import appealsRoutes from './src/routes/appeals.js';
import videoRequestRoutes from './src/routes/videoRequests.js';
import authRoutes from './src/routes/auth.js';
import gdprRoutes from './src/routes/gdpr.js';
import dmcaRoutes from './src/routes/dmca.js';
import achievementsRoutes from './src/routes/achievements.js';
import exploreRoutes from './src/routes/explore.js';
import { embedVideo } from './src/controllers/exploreController.js';
import supportRoutes from './src/routes/support.js';
import draftsRoutes from './src/routes/drafts.js';
import { supabase } from './src/lib/supabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Railway / Vercel / cualquier reverse proxy pone el IP real en X-Forwarded-For
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // API JSON pura — CSP se maneja en el frontend
}));

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // En desarrollo permitir cualquier origen local (localhost, IPs de red)
    if (!origin) return cb(null, true); // curl / server-to-server
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    const allowed = process.env.FRONTEND_URL || 'http://localhost:5173';
    cb(origin === allowed ? null : new Error('CORS'), origin === allowed);
  },
  credentials: true,
}));

// ── Rate limiters ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  skip: () => process.env.NODE_ENV !== 'production', // sin límite en desarrollo
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de pago, intenta más tarde' },
});

const videoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes de video, espera un momento' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas subidas de archivos, intenta más tarde' },
});

const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Demasiados likes en poco tiempo, espera un momento' },
  skip: () => process.env.NODE_ENV !== 'production',
});

const tipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas propinas en poco tiempo, espera un momento' },
  skip: () => process.env.NODE_ENV !== 'production',
});

app.use('/api', (req, res, next) => {
  if (req.path === '/payments/webhook') return next();
  return generalLimiter(req, res, next);
});
app.use('/api/payments/create-checkout', paymentLimiter);
app.use('/api/video/find-partner', videoLimiter);
app.use('/api/profiles/avatar', uploadLimiter);
app.use('/api/matches/like', likeLimiter);
app.use('/api/profiles/photos', uploadLimiter);
app.use('/api/profiles/videos', uploadLimiter);
app.use('/api/payments/photo', paymentLimiter);
app.use('/api/tips', tipLimiter);
app.use('/api/shows', (req, res, next) => {
  if (req.method === 'POST' && req.path.includes('/ticket')) return paymentLimiter(req, res, next);
  return next(); // generalLimiter ya aplicado en /api arriba
});

// ── Raw body para Stripe Webhook ──────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── JSON parser ───────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/profiles', profileRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/translate', translationRoutes);
app.use('/api/shows', showRoutes);
app.use('/api/creator', creatorRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/rtc', rtcRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/tips', tipRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/video-requests', videoRequestRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/dmca', dmcaRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/drafts',  draftsRoutes);

// Embed público de video adulto (iframe) — NO requiere auth pero geo-blocked
app.get('/embed/v/:id', async (req, res, next) => {
  try {
    const { geoBlockAdult } = await import('./src/middleware/adult.js');
    geoBlockAdult(req, res, () => embedVideo(req, res));
  } catch { next(); }
});

// ── Open Graph share routes (para WhatsApp / Telegram / Twitter) ──
function ogHtml({ title, description, image, url, type = 'website' }) {
  const esc = s => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="${type}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(url)}">
</head><body><a href="${esc(url)}">Ver en Destino TV</a></body></html>`;
}

app.get('/share/show/:id', async (req, res) => {
  const fe = process.env.FRONTEND_URL || '';
  const fallback = `${fe}/#/shows/${req.params.id}`;
  try {
    const { data: show } = await supabase
      .from('live_shows')
      .select('title, description, cover_url, status, host:host_id(full_name, avatar_url)')
      .eq('id', req.params.id)
      .single();

    if (!show) return res.redirect(302, fallback);

    const live = show.status === 'live' ? ' 🔴 EN VIVO' : '';
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(ogHtml({
      title: (show.title || 'Show en Destino TV') + live,
      description: show.description || `${show.host?.full_name || 'Creador'} en Destino TV`,
      image: show.cover_url || show.host?.avatar_url || `${fe}/icon-512.png`,
      url: fallback,
    }));
  } catch {
    return res.redirect(302, fallback);
  }
});

app.get('/share/profile/:id', async (req, res) => {
  const fe = process.env.FRONTEND_URL || '';
  const fallback = `${fe}/#/profile/${req.params.id}`;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, bio, avatar_url')
      .eq('id', req.params.id)
      .single();

    if (!profile) return res.redirect(302, fallback);

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(ogHtml({
      title: `${profile.full_name || 'Perfil'} en Destino TV`,
      description: profile.bio || 'Mira mi perfil en Destino TV',
      image: profile.avatar_url || `${fe}/icon-512.png`,
      url: fallback,
      type: 'profile',
    }));
  } catch {
    return res.redirect(302, fallback);
  }
});

// ── SEO: sitemap dinámico ─────────────────────────────────────
// Sirve XML con perfiles públicos verificados (no contenido adulto, no privado)
app.get('/sitemap.xml', async (req, res) => {
  const fe = process.env.FRONTEND_URL || 'https://destino-sigma.vercel.app';
  try {
    const staticUrls = [
      { loc: `${fe}/`,        priority: 1.0,  changefreq: 'daily' },
      { loc: `${fe}/#/login`,    priority: 0.6,  changefreq: 'monthly' },
      { loc: `${fe}/#/register`, priority: 0.7,  changefreq: 'monthly' },
      { loc: `${fe}/#/privacy`,  priority: 0.4,  changefreq: 'yearly' },
      { loc: `${fe}/#/terms`,    priority: 0.4,  changefreq: 'yearly' },
      { loc: `${fe}/#/help`,     priority: 0.5,  changefreq: 'monthly' },
      { loc: `${fe}/#/dmca`,     priority: 0.3,  changefreq: 'yearly' },
    ];

    // Top creadoras verificadas y públicas (no adultas para SEO seguro)
    const { data: creators } = await supabase
      .from('profiles')
      .select('id, username, updated_at')
      .eq('is_creator', true)
      .eq('is_verified', true)
      .eq('is_adult_creator', false)
      .neq('is_banned', true)
      .order('updated_at', { ascending: false })
      .limit(500);

    const profileUrls = (creators || []).map(c => ({
      loc: `${fe}/share/profile/${c.id}`,
      priority: 0.6,
      changefreq: 'weekly',
      lastmod: c.updated_at,
    }));

    const all = [...staticUrls, ...profileUrls];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>${u.lastmod ? `\n    <lastmod>${new Date(u.lastmod).toISOString().slice(0,10)}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    res.status(500).send('<error>Error generating sitemap</error>');
  }
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, next) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Destino TV backend corriendo en puerto ${PORT}`);

  if (process.env.NODE_ENV === 'production') {
    const frontendUrl = process.env.FRONTEND_URL || '';
    if (!frontendUrl || frontendUrl.includes('localhost')) {
      console.error('⚠️  ADVERTENCIA: FRONTEND_URL apunta a localhost en producción. Actualiza el .env con el dominio real.');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
      console.error('⚠️  ADVERTENCIA: STRIPE_WEBHOOK_SECRET inválido en producción. Configura el webhook real en el dashboard de Stripe.');
    }
    if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      console.error('⚠️  ADVERTENCIA: Usando clave de Stripe en modo TEST en producción. Cambia a sk_live_.');
    }
  }

  startCleanupJob();
});

export default app;
