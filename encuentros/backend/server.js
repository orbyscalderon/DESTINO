// Encuentros — backend independiente
// IMPORTANTE: Este backend va en un Postgres/Supabase project SEPARADO del
// de Destino TV. NO comparte auth, profiles, ni cualquier otra entidad.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 4100;

const supabase = createClient(
  process.env.ENCUENTROS_SUPABASE_URL,
  process.env.ENCUENTROS_SUPABASE_SERVICE_KEY,
);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(cors({
  origin: (process.env.FRONTEND_URL || '').split(',').filter(Boolean),
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limits
const browseLimiter = rateLimit({ windowMs: 60_000, max: 120 });
const writeLimiter  = rateLimit({ windowMs: 60_000, max: 10 });

// Health
app.get('/health', (_req, res) => res.json({ ok: true, service: 'encuentros' }));

// ── Browse público (con age gate client-side) ─────────────────────────
app.get('/api/listings', browseLimiter, async (req, res) => {
  try {
    const {
      country, city, gender, body_type, ethnicity,
      available_now, available_today, tier, limit = '60',
    } = req.query;

    let q = supabase
      .from('encuentros_listings')
      .select(`
        id, display_name, age, gender, country_code, city, zone,
        headline, height_cm, body_type, ethnicity, languages,
        services, rate_30min, rate_60min, rate_overnight, rate_currency,
        available_incall, available_outcall, available_online,
        available_now, available_today,
        photos, cover_photo_url, is_verified,
        tier, views_count
      `)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('tier', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(200, parseInt(limit) || 60));

    if (country) q = q.eq('country_code', String(country).toUpperCase());
    if (city) q = q.ilike('city', `%${city}%`);
    if (gender) q = q.eq('gender', gender);
    if (body_type) q = q.eq('body_type', body_type);
    if (ethnicity) q = q.eq('ethnicity', ethnicity);
    if (available_now === 'true') q = q.eq('available_now', true);
    if (available_today === 'true') q = q.eq('available_today', true);
    if (tier) q = q.eq('tier', tier);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ listings: data || [] });
  } catch (err) {
    console.error('[listings]', err.message);
    res.status(500).json({ error: 'No se pudo cargar' });
  }
});

// ── View single listing (incrementa views) ────────────────────────────
app.get('/api/listings/:id', browseLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido' });

    const { data, error } = await supabase
      .from('encuentros_listings')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();
    if (error || !data) return res.status(404).json({ error: 'No encontrado' });

    supabase.rpc('increment_listing_views', { p_id: id }).catch(() => {});
    res.json({ listing: data });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── Tracking de click en contacto ─────────────────────────────────────
app.post('/api/listings/:id/contact', writeLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.rpc('increment_listing_contacts', { p_id: id }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── Reportar listing ──────────────────────────────────────────────────
app.post('/api/listings/:id/report', writeLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description, evidence_url, reporter_email } = req.body || {};
    const ALLOWED = ['underage_suspected','trafficking_suspected','fake_photos',
                     'scam_payment','aggressive_behavior','fake_identity','spam','other'];
    if (!ALLOWED.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });
    if (!description || description.length < 10) return res.status(400).json({ error: 'Descripción muy corta' });

    await supabase.from('encuentros_reports').insert({
      listing_id: id,
      category,
      description: description.slice(0, 2000),
      evidence_url: evidence_url?.slice(0, 500) || null,
      reporter_email: reporter_email?.slice(0, 200) || null,
      reporter_ip: req.ip,
    });

    // Priority escalation para underage / trafficking
    if (['underage_suspected', 'trafficking_suspected'].includes(category)) {
      console.error(`[URGENT] Reporte ${category} en listing ${id} — escalación inmediata requerida`);
      // TODO: enviar email a equipo + NCMEC si confirmado
    }

    res.json({ ok: true, message: 'Reporte registrado' });
  } catch (err) {
    console.error('[report]', err.message);
    res.status(500).json({ error: 'Error' });
  }
});

// ── Crear listing (publisher onboarding) ──────────────────────────────
app.post('/api/listings', writeLimiter, async (req, res) => {
  try {
    const body = req.body || {};

    // Requeridos
    const required = ['publisher_email', 'display_name', 'age', 'gender',
                      'country_code', 'city', 'headline'];
    for (const f of required) {
      if (!body[f]) return res.status(400).json({ error: `Campo "${f}" requerido` });
    }
    if (body.age < 18) return res.status(400).json({ error: 'Edad mínima: 18' });

    // NOTA: el flujo real exige age verification (Onfido/Jumio + foto con ID)
    // ANTES de poder crear listing. Acá lo marcamos pending_review como gate.
    const insert = {
      ...body,
      status: 'pending_review',
      age_verified: false,
      ip_at_signup: req.ip,
      ua_at_signup: req.headers['user-agent']?.slice(0, 500) || null,
    };

    const { data, error } = await supabase
      .from('encuentros_listings')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;

    await supabase.from('encuentros_publisher_log').insert({
      listing_id: data.id,
      action: 'created',
      ip: req.ip,
      user_agent: req.headers['user-agent']?.slice(0, 500),
    });

    res.status(201).json({
      listing: data,
      next_step: 'age_verification',
      message: 'Listing creado. Próximo paso: verificar edad con documento + foto. Hasta entonces el listing queda pending_review.',
    });
  } catch (err) {
    console.error('[create]', err.message);
    res.status(500).json({ error: 'Error al crear listing' });
  }
});

app.listen(PORT, () => {
  console.log(`encuentros backend listening on :${PORT}`);
  console.log('⚠  Recordá: este backend debe correr en infra SEPARADA de Destino TV');
});
