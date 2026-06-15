// Publisher dashboard endpoints — info y stats del publisher logueado.
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { authPublisher } from '../lib/auth.js';

const router = Router();
router.use(authPublisher);

// GET /api/publisher/listings — mis listings
router.get('/listings', async (req, res) => {
  const { data } = await supabase
    .from('encuentros_listings')
    .select('id, display_name, status, tier, country_code, city, cover_photo_url, views_count, contacts_count, expires_at, created_at')
    .eq('publisher_id', req.publisher.id)
    .order('created_at', { ascending: false });
  res.json({ listings: data || [] });
});

// GET /api/publisher/stats — agg
router.get('/stats', async (req, res) => {
  const { data: listings } = await supabase
    .from('encuentros_listings').select('id, views_count, contacts_count, status')
    .eq('publisher_id', req.publisher.id);
  const arr = listings || [];
  const totalViews = arr.reduce((s, l) => s + (l.views_count || 0), 0);
  const totalContacts = arr.reduce((s, l) => s + (l.contacts_count || 0), 0);
  const active = arr.filter(l => l.status === 'active').length;
  res.json({
    total_listings: arr.length,
    active_listings: active,
    total_views: totalViews,
    total_contacts: totalContacts,
    conversion_rate: totalViews > 0 ? (totalContacts / totalViews * 100).toFixed(1) : '0',
  });
});

// GET /api/publisher/payments — historial
router.get('/payments', async (req, res) => {
  const { data } = await supabase
    .from('encuentros_payments')
    .select('id, listing_id, processor, event_type, amount_usd, status, created_at')
    .eq('publisher_id', req.publisher.id)
    .order('created_at', { ascending: false })
    .limit(50);
  res.json({ payments: data || [] });
});

// POST /api/publisher/age-verification — submit URL del check (Onfido/etc)
// El frontend integra Onfido SDK y al terminar manda check_id.
router.post('/age-verification', async (req, res) => {
  const { provider, provider_check_id, document_type, document_country } = req.body || {};
  if (!['onfido', 'jumio', 'veriff', 'manual'].includes(provider)) {
    return res.status(400).json({ error: 'Provider inválido' });
  }
  const { data, error } = await supabase.from('encuentros_age_verifications').insert({
    publisher_id: req.publisher.id,
    provider, provider_check_id, document_type, document_country,
    status: 'pending',
  }).select().single();
  if (error) return res.status(500).json({ error: 'Error registrando' });
  res.status(201).json({ verification: data });
});

// GET /api/publisher/me/data-export — GDPR
router.get('/data-export', async (req, res) => {
  const [profile, listings, payments, verifications] = await Promise.all([
    supabase.from('encuentros_publishers').select('*').eq('id', req.publisher.id).maybeSingle(),
    supabase.from('encuentros_listings').select('*').eq('publisher_id', req.publisher.id),
    supabase.from('encuentros_payments').select('*').eq('publisher_id', req.publisher.id),
    supabase.from('encuentros_age_verifications').select('*').eq('publisher_id', req.publisher.id),
  ]);
  await supabase.from('encuentros_publishers').update({
    data_export_requested_at: new Date().toISOString(),
  }).eq('id', req.publisher.id);
  res.json({
    profile: profile.data,
    listings: listings.data,
    payments: payments.data,
    age_verifications: verifications.data,
    exported_at: new Date().toISOString(),
  });
});

// POST /api/publisher/me/delete — GDPR right to erasure (schedules deletion 30d después)
router.post('/delete-account', async (req, res) => {
  const scheduledFor = new Date(Date.now() + 30 * 86400 * 1000);
  await supabase.from('encuentros_publishers').update({
    deletion_requested_at: new Date().toISOString(),
    scheduled_deletion_at: scheduledFor.toISOString(),
    status: 'deleted',
  }).eq('id', req.publisher.id);

  // Pausar todos sus listings inmediatamente
  await supabase.from('encuentros_listings').update({ status: 'paused' }).eq('publisher_id', req.publisher.id);

  res.json({ ok: true, scheduled_deletion_at: scheduledFor.toISOString() });
});

export default router;
