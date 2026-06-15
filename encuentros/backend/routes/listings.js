// Listings — browse público + CRUD para publisher autenticado.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { authPublisher } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';
import { sendMail, templates } from '../lib/email.js';

const router = Router();
const browseLimiter = rateLimit({ windowMs: 60_000, max: 120 });
const writeLimiter  = rateLimit({ windowMs: 60_000, max: 10 });

// ── Browse público ───────────────────────────────────────────────────────
router.get('/', browseLimiter, async (req, res) => {
  try {
    const {
      country, city, gender, body_type, ethnicity, languages,
      available_now, available_today, tier, services, q,
      page = '0', limit = '60', sort = 'recent',
    } = req.query;

    let queryB = supabase
      .from('encuentros_listings')
      .select(`
        id, display_name, age, gender, country_code, city, zone, headline,
        height_cm, body_type, ethnicity, languages, services,
        rate_30min, rate_60min, rate_overnight, rate_currency,
        available_incall, available_outcall, available_online,
        available_now, available_today,
        cover_photo_url, is_verified, tier, views_count
      `)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    if (country)       queryB = queryB.eq('country_code', String(country).toUpperCase());
    if (city)          queryB = queryB.ilike('city', `%${city}%`);
    if (gender)        queryB = queryB.eq('gender', gender);
    if (body_type)     queryB = queryB.eq('body_type', body_type);
    if (ethnicity)     queryB = queryB.eq('ethnicity', ethnicity);
    if (available_now === 'true')   queryB = queryB.eq('available_now', true);
    if (available_today === 'true') queryB = queryB.eq('available_today', true);
    if (tier)          queryB = queryB.eq('tier', tier);
    if (q)             queryB = queryB.or(`display_name.ilike.%${q}%,headline.ilike.%${q}%`);
    if (languages) {
      const arr = String(languages).split(',').filter(Boolean);
      if (arr.length) queryB = queryB.overlaps('languages', arr);
    }
    if (services) {
      const arr = String(services).split(',').filter(Boolean);
      if (arr.length) queryB = queryB.overlaps('services', arr);
    }

    // Geo block: ocultar listings que bloquearon el country del visitante (header)
    const visitorCountry = (req.headers['cf-ipcountry'] || req.headers['x-country'] || '').toUpperCase();

    // Sort
    if (sort === 'rate_low')      queryB = queryB.order('rate_60min', { ascending: true, nullsFirst: false });
    else if (sort === 'rate_high') queryB = queryB.order('rate_60min', { ascending: false, nullsFirst: false });
    else if (sort === 'popular')   queryB = queryB.order('views_count', { ascending: false });
    else                            queryB = queryB.order('tier', { ascending: false }).order('created_at', { ascending: false });

    const pageNum = Math.max(0, parseInt(page) || 0);
    const lim = Math.min(60, parseInt(limit) || 60);
    queryB = queryB.range(pageNum * lim, (pageNum + 1) * lim - 1);

    const { data, error } = await queryB;
    if (error) throw error;

    let result = data || [];
    // Filter por geo block
    if (visitorCountry && result.length) {
      const ids = result.map(l => l.id);
      const { data: blocks } = await supabase
        .from('encuentros_geo_blocks')
        .select('listing_id, blocked_countries')
        .in('listing_id', ids);
      const blockedSet = new Set();
      (blocks || []).forEach(b => {
        if (Array.isArray(b.blocked_countries) && b.blocked_countries.includes(visitorCountry)) {
          blockedSet.add(b.listing_id);
        }
      });
      if (blockedSet.size) result = result.filter(l => !blockedSet.has(l.id));
    }

    res.json({ listings: result, hasMore: result.length === lim });
  } catch (err) {
    console.error('[listings:list]', err.message);
    res.status(500).json({ error: 'Error cargando listings' });
  }
});

// ── Single listing (view + tracking) ────────────────────────────────────
router.get('/:id', browseLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido' });

    const { data, error } = await supabase
      .from('encuentros_listings')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'No encontrado' });

    // Check geo block
    const visitorCountry = (req.headers['cf-ipcountry'] || req.headers['x-country'] || '').toUpperCase();
    if (visitorCountry) {
      const { data: block } = await supabase
        .from('encuentros_geo_blocks')
        .select('blocked_countries')
        .eq('listing_id', id)
        .maybeSingle();
      if (Array.isArray(block?.blocked_countries) && block.blocked_countries.includes(visitorCountry)) {
        return res.status(403).json({ error: 'Listing no disponible en tu región', code: 'GEO_BLOCKED' });
      }
    }

    // Fetch photos
    const { data: photos } = await supabase
      .from('encuentros_photos')
      .select('id, url, thumbnail_url, position, is_verified, is_cover')
      .eq('listing_id', id)
      .eq('moderation_status', 'approved')
      .order('position');

    supabase.rpc('increment_listing_views', { p_id: id }).then(() => {}, () => {});

    res.json({ listing: { ...data, photos: photos || [] } });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── Track contact click ─────────────────────────────────────────────────
router.post('/:id/contact', writeLimiter, async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido' });
  await supabase.rpc('increment_listing_contacts', { p_id: id }).catch(() => {});
  res.json({ ok: true });
});

// ── Create listing (publisher autenticado) ──────────────────────────────
router.post('/', writeLimiter, authPublisher, async (req, res) => {
  try {
    const body = req.body || {};
    const required = ['display_name', 'age', 'gender', 'country_code', 'city', 'headline'];
    for (const f of required) {
      if (!body[f]) return res.status(400).json({ error: `Campo "${f}" requerido` });
    }
    if (parseInt(body.age) < 18) return res.status(400).json({ error: 'Edad mínima: 18' });

    // Si el publisher no tiene identidad verificada, el listing queda pending.
    const initialStatus = req.publisher.identity_verified ? 'pending_review' : 'pending_review';

    const insert = {
      publisher_id: req.publisher.id,
      publisher_email: req.publisher.email,
      display_name: body.display_name,
      age: parseInt(body.age),
      gender: body.gender,
      country_code: String(body.country_code).toUpperCase(),
      city: body.city,
      zone: body.zone || null,
      headline: body.headline,
      description: body.description || null,
      height_cm: body.height_cm ? parseInt(body.height_cm) : null,
      weight_kg: body.weight_kg ? parseInt(body.weight_kg) : null,
      body_type: body.body_type || null,
      ethnicity: body.ethnicity || null,
      eye_color: body.eye_color || null,
      hair_color: body.hair_color || null,
      languages: Array.isArray(body.languages) ? body.languages : null,
      services: Array.isArray(body.services) ? body.services : null,
      services_notes: body.services_notes || null,
      rate_30min: body.rate_30min ? parseInt(body.rate_30min) : null,
      rate_60min: body.rate_60min ? parseInt(body.rate_60min) : null,
      rate_2h: body.rate_2h ? parseInt(body.rate_2h) : null,
      rate_overnight: body.rate_overnight ? parseInt(body.rate_overnight) : null,
      rate_currency: body.rate_currency || 'USD',
      rate_notes: body.rate_notes || null,
      whatsapp: body.whatsapp || null,
      telegram: body.telegram || null,
      signal_number: body.signal_number || null,
      external_url: body.external_url || null,
      available_incall: !!body.available_incall,
      available_outcall: !!body.available_outcall,
      available_online: !!body.available_online,
      available_now: !!body.available_now,
      available_today: !!body.available_today,
      schedule: body.schedule || null,
      status: initialStatus,
      ip_at_signup: req.ip,
      ua_at_signup: req.headers['user-agent']?.slice(0, 500) || null,
    };

    const { data, error } = await supabase
      .from('encuentros_listings').insert(insert).select().single();
    if (error) throw error;

    await supabase.from('encuentros_publisher_log').insert({
      listing_id: data.id, action: 'created',
      ip: req.ip, user_agent: req.headers['user-agent']?.slice(0, 500),
    });
    await logAudit({
      actor_type: 'publisher', actor_id: req.publisher.id,
      action: 'listing.created', target_type: 'listing', target_id: data.id,
      after_state: { display_name: data.display_name, status: data.status },
      ip: req.ip, ua: req.headers['user-agent'],
    });

    // Notify publisher
    const tpl = templates.listing_pending_review({ display_name: data.display_name });
    sendMail({
      to: req.publisher.email,
      template: 'listing_pending_review',
      subject: tpl.subject,
      html: tpl.html,
      metadata: { listing_id: data.id },
    }).catch(() => {});

    res.status(201).json({ listing: data });
  } catch (err) {
    console.error('[listings:create]', err.message);
    res.status(500).json({ error: 'Error al crear listing' });
  }
});

// ── Update listing (solo el dueño) ──────────────────────────────────────
router.put('/:id', writeLimiter, authPublisher, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    if (existing.publisher_id !== req.publisher.id) {
      return res.status(403).json({ error: 'No es tu listing' });
    }

    const body = req.body || {};
    const ALLOWED_FIELDS = [
      'display_name', 'headline', 'description', 'zone',
      'height_cm', 'weight_kg', 'body_type', 'ethnicity', 'eye_color', 'hair_color',
      'languages', 'services', 'services_notes',
      'rate_30min', 'rate_60min', 'rate_2h', 'rate_overnight', 'rate_currency', 'rate_notes',
      'whatsapp', 'telegram', 'signal_number', 'external_url',
      'available_incall', 'available_outcall', 'available_online',
      'available_now', 'available_today', 'schedule',
    ];
    const patch = {};
    for (const k of ALLOWED_FIELDS) if (body[k] !== undefined) patch[k] = body[k];
    // Edits volvuelve el listing a pending review si tocó campos sensibles
    const SENSITIVE = ['display_name', 'headline', 'description', 'rate_30min', 'rate_60min', 'services'];
    const touchedSensitive = SENSITIVE.some(k => body[k] !== undefined);
    if (touchedSensitive) patch.status = 'pending_review';

    const { data: updated, error } = await supabase
      .from('encuentros_listings').update(patch).eq('id', id).select().single();
    if (error) throw error;

    await supabase.from('encuentros_publisher_log').insert({
      listing_id: id, action: 'updated',
      ip: req.ip, user_agent: req.headers['user-agent']?.slice(0, 500),
      metadata: { fields: Object.keys(patch) },
    });
    res.json({ listing: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// ── Delete listing (soft → status=deleted en realidad pause) ───────────
router.delete('/:id', writeLimiter, authPublisher, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('encuentros_listings').select('id, publisher_id, display_name').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    if (existing.publisher_id !== req.publisher.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('encuentros_listings').update({ status: 'paused' }).eq('id', id);
    await logAudit({
      actor_type: 'publisher', actor_id: req.publisher.id,
      action: 'listing.paused', target_type: 'listing', target_id: id,
      ip: req.ip, ua: req.headers['user-agent'],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── Reactivate paused listing ────────────────────────────────────────────
router.post('/:id/reactivate', writeLimiter, authPublisher, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('encuentros_listings').select('id, publisher_id, status').eq('id', id).maybeSingle();
    if (!existing || existing.publisher_id !== req.publisher.id) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    if (existing.status !== 'paused' && existing.status !== 'expired') {
      return res.status(400).json({ error: 'No se puede reactivar este listing' });
    }
    await supabase.from('encuentros_listings').update({ status: 'pending_review' }).eq('id', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── Geo-block self (publisher decide qué countries no pueden ver su listing)
router.put('/:id/geo-block', writeLimiter, authPublisher, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked_countries, reason } = req.body || {};
    if (!Array.isArray(blocked_countries)) return res.status(400).json({ error: 'blocked_countries debe ser array' });

    const { data: existing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', id).maybeSingle();
    if (!existing || existing.publisher_id !== req.publisher.id) return res.status(404).json({ error: 'No encontrado' });

    const codes = blocked_countries.map(c => String(c).toUpperCase().slice(0, 2));
    await supabase.from('encuentros_geo_blocks').upsert({
      listing_id: id, blocked_countries: codes, reason: reason || null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
