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
import reelsRoutes from './src/routes/reels.js';
import battlesRoutes from './src/routes/battles.js';
import adultCategoriesRoutes from './src/routes/adultCategories.js';
import ccbillRoutes from './src/routes/ccbill.js';
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
import twoFactorRoutes from './src/routes/twoFactor.js';
import fucknowRoutes from './src/routes/fucknow.js';
import taxFormRoutes from './src/routes/taxForms.js';
import seoRoutes from './src/routes/seo.js';
import v6Routes from './src/routes/v6Routes.js';
import gdprRoutes from './src/routes/gdpr.js';
import dmcaRoutes from './src/routes/dmca.js';
import achievementsRoutes from './src/routes/achievements.js';
import exploreRoutes from './src/routes/explore.js';
import { embedVideo } from './src/controllers/exploreController.js';
import supportRoutes from './src/routes/support.js';
import draftsRoutes from './src/routes/drafts.js';
import userMutesRoutes from './src/routes/userMutes.js';
import aiAssistantRoutes from './src/routes/aiAssistant.js';
import stickerRoutes from './src/routes/stickers.js';
import conversationsRoutes from './src/routes/conversations.js';
import consentsRoutes from './src/routes/consents.js';
import trustedFlaggersRoutes from './src/routes/trustedFlaggers.js';
import transparencyRoutes from './src/routes/transparency.js';
import complianceRoutes from './src/routes/compliance.js';
import dsaRoutes from './src/routes/dsa.js';
import creatorAutomationRoutes from './src/routes/creatorAutomation.js';
import watermarkRoutes from './src/routes/watermark.js';
import privacyDisclosureRoutes from './src/routes/privacyDisclosure.js';
import creatorMonetizationRoutes from './src/routes/creatorMonetization.js';
import adultVideoRoutes from './src/routes/adultVideo.js';
import { supabase } from './src/lib/supabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Railway / Vercel / cualquier reverse proxy pone el IP real en X-Forwarded-For
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────
// Sec audit #9: CSP strict para API JSON. Cualquier intento de renderear
// la respuesta como HTML queda bloqueado, sin scripts inline, sin frames.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── CORS ──────────────────────────────────────────────────────
// Sec audit #10: fail-closed cuando NODE_ENV no está bien seteado.
// Antes: NODE_ENV !== 'production' abría CORS a TODO. Si Railway perdía
// la var, todo abierto. Ahora exigimos NODE_ENV === 'development' explícito.
const ALLOWED_NODE_ENVS = new Set(['production', 'development', 'test']);
const NODE_ENV = ALLOWED_NODE_ENVS.has(process.env.NODE_ENV) ? process.env.NODE_ENV : 'production';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV  = NODE_ENV === 'development';

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl / server-to-server / same-origin
    if (IS_DEV) return cb(null, true);   // dev local: todos los origenes OK
    // Prod: solo FRONTEND_URL + variantes opcionales (preview deploys, mobile WebView)
    const allowed = [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_ALT,
      'capacitor://localhost', // iOS/Android Capacitor WebView
      'http://localhost',      // Android Capacitor WebView dev
      'ionic://localhost',     // Legacy Ionic
    ].filter(Boolean);
    cb(allowed.includes(origin) ? null : new Error('CORS blocked: ' + origin),
       allowed.includes(origin));
  },
  credentials: true,
}));

// ── Rate limiters ─────────────────────────────────────────────
// Key generator: usa el bearer token (user.id) si está presente, sino la IP.
// Antes el limiter usaba solo IP — con Cloudflare/NAT muchos users comparten
// IP y se pegaban entre sí. Ahora cada user logueado tiene su propio quota.
function authKeyGenerator(req /* , res */) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    // El JWT de Supabase tiene formato xxx.yyy.zzz — usamos un hash corto
    // para evitar guardar el token completo en memoria del limiter.
    return 'tok:' + auth.substring(7, 27);
  }
  return req.ip;
}

// generalLimiter: ahora protege SOLO escrituras (POST/PUT/PATCH/DELETE)
// con un límite generoso, y operaciones costosas. TODOS los GETs hacen skip
// — para ellos la protección real es el costo de procesar la query en el
// backend, no el rate limit (que tiende a romper la UX cuando la app hace
// 5-10 requests en paralelo al abrir una pantalla).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 2000 : 10000,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') return true;
    // TODOS los GETs (lectura) — cacheables, no escriben nada.
    if (req.method === 'GET') return true;
    const p = req.path;
    // Endpoints "presence/light" no-GET que son frecuentes y baratos.
    if (p === '/profiles/heartbeat')   return true; // cada 2 min
    return false;
  },
  keyGenerator: authKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de pago, intenta más tarde' },
  keyGenerator: authKeyGenerator,
  standardHeaders: true, legacyHeaders: false,
});

const videoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes de video, espera un momento' },
  keyGenerator: authKeyGenerator,
  standardHeaders: true, legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiadas subidas de archivos, intenta más tarde' },
  // Aplicar SOLO en POST/PUT/PATCH/DELETE — los GET en /photos y /videos son
  // para leer perfiles y no deben contar como uploads.
  skip: (req) => req.method === 'GET',
  keyGenerator: authKeyGenerator,
  standardHeaders: true, legacyHeaders: false,
});

const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Demasiados likes en poco tiempo, espera un momento' },
  skip: () => process.env.NODE_ENV !== 'production',
  keyGenerator: authKeyGenerator,
  standardHeaders: true, legacyHeaders: false,
});

const tipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas propinas en poco tiempo, espera un momento' },
  skip: () => process.env.NODE_ENV !== 'production',
  keyGenerator: authKeyGenerator,
  standardHeaders: true, legacyHeaders: false,
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

// ── Slow request logging ──────────────────────────────────────
// Cualquier endpoint que tarde más de SLOW_MS aparece en logs Railway con
// método + path + duración. Útil para detectar N+1 queries o índices
// faltantes. No reporta a Sentry porque inflaría event count; sale solo
// en stdout y se puede grepear.
const SLOW_MS = parseInt(process.env.SLOW_REQUEST_MS || '800', 10);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms >= SLOW_MS) {
      console.warn(`[slow] ${ms}ms ${req.method} ${req.originalUrl} status=${res.statusCode}`);
    }
  });
  next();
});

// ── Raw body para Stripe + CCBill Webhooks ──────────────────────
// Sec audit #13: HMAC verification necesita los bytes ORIGINALES del body.
// express.json() reparsea y JSON.stringify() puede reformatar (espacios,
// orden de keys), rompiendo la firma. Estos endpoints reciben raw Buffer.
app.use('/api/payments/webhook',        express.raw({ type: 'application/json' }));
app.use('/api/payments/ccbill/webhook', express.raw({ type: '*/*' }));

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
app.use('/api/reels', reelsRoutes);
app.use('/api/battles', battlesRoutes);
app.use('/api/adult-categories', adultCategoriesRoutes);
app.use('/api/payments/ccbill', ccbillRoutes);
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
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/fucknow', fucknowRoutes);

// ── Stubs para endpoints que el frontend megamenu/dashboard llama pero ──
// que aún no tienen implementación completa. Devuelven payload vacío
// para que la UI degrade gracefully en lugar de tirar 404.
// TODO cuando se implementen los features reales, mover a su controller.
app.get('/api/photo-collections/public', (_req, res) => res.json({ collections: [] }));
app.get('/api/coins/daily-reward/status', (_req, res) => res.json({ available: false, next_at: null }));
app.use('/api/tax-forms', taxFormRoutes);
app.use('/api/seo', seoRoutes);
// Rutas agregadas en v54+: chat mods, account deletion, recurring shows,
// affiliate, pinned reels (cada path completo definido dentro de v6Routes)
app.use(v6Routes);
// El sitemap se sirve también en la raíz para que los crawlers lo encuentren
app.get('/sitemap.xml', (req, res, next) => {
  req.url = '/sitemap.xml';
  seoRoutes(req, res, next);
});
app.use('/api/gdpr', gdprRoutes);
app.use('/api/dmca', dmcaRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/drafts',  draftsRoutes);
// v64/v65 chat & creator features
app.use('/api/user-mutes',     userMutesRoutes);
app.use('/api/ai',             aiAssistantRoutes);
app.use('/api/stickers',       stickerRoutes);
app.use('/api/conversations',  conversationsRoutes);

// v67 compliance: granular consent, DSA trusted flaggers, transparency reports,
// legal entity config (DPO/DMCA agent/2257 custodian)
app.use('/api/consents',         consentsRoutes);
app.use('/api/trusted-flaggers', trustedFlaggersRoutes);
app.use('/api/transparency',     transparencyRoutes);
app.use('/api/compliance',       complianceRoutes);

// v68 compliance v2: DSA Notice & Action, creator automation, watermark queue
app.use('/api/dsa-notice',       dsaRoutes);
app.use('/api/creator-auto',     creatorAutomationRoutes);
app.use('/api/watermark',        watermarkRoutes);

// v69 compliance v3: subprocessors, Art. 30 records, cookies inventory,
// breach notification, Statement of Reasons (DSA Art. 17)
app.use('/api/privacy',          privacyDisclosureRoutes);

// v70 adult monetization stack — 14 features:
// sexting/DM paywall, content vault, photo collections, scheduled posts,
// promo codes, geo-block per content, spy mode, skip queue, auto-reply,
// AI persona, fan loyalty badges, VR/360 video metadata
app.use('/api/creator-monetization', creatorMonetizationRoutes);

// v73 adult video v2 — 10 features:
// watch history, comments, series/collections, co-stars, scheduled premiere,
// captions (Whisper), sprite thumbnails, skip intro markers
app.use('/api/adult-video', adultVideoRoutes);

// v71: health check para Railway/uptime monitors
app.get('/healthz', async (req, res) => {
  try {
    const { error } = await supabase.from('compliance_config').select('key').limit(1);
    if (error) throw error;
    res.json({
      status: 'ok',
      version: 'v71',
      uptime_sec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

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

// Warnings de configuración (NO abortar — antes hacíamos exit(1) y el
// deploy de Railway fallaba el healthcheck. Mejor arrancar siempre y dejar
// que los warnings aparezcan en logs).
const hasSupabaseKey = !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const missing = [];
if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!hasSupabaseKey) missing.push('SUPABASE_SERVICE_KEY (o SUPABASE_SERVICE_ROLE_KEY)');
if (missing.length > 0) {
  console.error('❌ Faltan variables de entorno requeridas:', missing.join(', '));
  console.error('   El servidor arrancará pero las queries a Supabase fallarán.');
}

app.listen(PORT, () => {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`🚀 Destino TV backend corriendo en puerto ${PORT}`);

  if (isProduction) {
    const frontendUrl = process.env.FRONTEND_URL || '';
    if (!frontendUrl || frontendUrl.includes('localhost')) {
      console.warn('⚠️  FRONTEND_URL apunta a localhost o falta');
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('⚠️  STRIPE_SECRET_KEY no configurada — pagos deshabilitados');
    } else if (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      console.warn('⚠️  STRIPE en modo TEST en producción (sk_test_).');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
      console.warn('⚠️  STRIPE_WEBHOOK_SECRET inválido o falta — webhooks no se procesarán correctamente');
    }
  }

  startCleanupJob();
});

export default app;
