// SOLO para desarrollo local con certs autofirmados — NUNCA en producción
if (process.env.NODE_ENV === 'production') {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('FATAL: NODE_TLS_REJECT_UNAUTHORIZED=0 no está permitido en producción.');
  }
} else {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

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

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // API JSON pura — CSP se maneja en el frontend
}));

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate limiters ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
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

app.use('/api', (req, res, next) => {
  if (req.path === '/payments/webhook') return next();
  return generalLimiter(req, res, next);
});
app.use('/api/payments/create-checkout', paymentLimiter);
app.use('/api/video/token', videoLimiter);
app.use('/api/video/find-partner', videoLimiter);
app.use('/api/profiles/avatar', uploadLimiter);
app.use('/api/profiles/photos', uploadLimiter);

// ── Raw body para Stripe Webhook ──────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── JSON parser ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Destino backend corriendo en puerto ${PORT}`);

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
