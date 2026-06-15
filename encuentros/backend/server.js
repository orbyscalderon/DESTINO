// Encuentros — backend modular (v2).
// IMPORTANTE: corre en infra SEPARADA de Destino TV (otro Postgres, otro
// dominio, otro processor, otra LLC). Ver README.

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import listingsRouter from './routes/listings.js';
import authRouter from './routes/auth.js';
import photosRouter from './routes/photos.js';
import publisherRouter from './routes/publisher.js';
import billingRouter from './routes/billing.js';
import reportsRouter from './routes/reports.js';
import adminRouter from './routes/admin.js';
import seoRouter from './routes/seo.js';

const PORT = process.env.PORT || 4100;
const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(cors({
  origin: (process.env.FRONTEND_URL || '').split(',').filter(Boolean),
  credentials: false,
}));

// Global rate limit — fallback para cualquier endpoint no-específico.
app.use(rateLimit({ windowMs: 60_000, max: 300 }));

// Health
app.get('/health', (_req, res) => res.json({ ok: true, service: 'encuentros', version: '0.2.0' }));

// Webhooks NECESITAN raw body — montados ANTES del express.json global
app.use('/api/billing/webhook', billingRouter);

// Resto de routes con JSON parser
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/listings', photosRouter);   // photos están bajo /api/listings/:id/photos
app.use('/api/publisher', publisherRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/billing', billingRouter);   // checkout-url + tiers (no webhook)
app.use('/api/admin', adminRouter);
app.use('/', seoRouter);                   // /sitemap.xml

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`encuentros backend listening on :${PORT}`);
  console.log('⚠  Recordá: infra SEPARADA de Destino TV.');
});
