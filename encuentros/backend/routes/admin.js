// Admin — review queue, resolver reports, ban publishers.
// Auth: el admin se loguea via magic link igual que un publisher, pero su email
// debe estar en encuentros_admins.
import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { sha256 } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';
import { sendMail, templates } from '../lib/email.js';

const router = Router();

// Middleware: requiere session válida + el publisher email también esté en encuentros_admins
async function isAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const tokenHash = sha256(token);
    const { data: session } = await supabase
      .from('encuentros_sessions')
      .select('publisher_id, expires_at, publisher:encuentros_publishers(email)')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Sesión inválida' });

    const email = session.publisher?.email;
    if (!email) return res.status(403).json({ error: 'No autorizado' });

    const { data: admin } = await supabase
      .from('encuentros_admins')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();
    if (!admin) return res.status(403).json({ error: 'No es admin' });

    req.admin = admin;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error de auth' });
  }
}

router.use(isAdmin);

// GET dashboard stats
router.get('/stats', async (_req, res) => {
  try {
    const [listings, reports, urgent, publishers, payments24h] = await Promise.all([
      supabase.from('encuentros_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('encuentros_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('encuentros_reports').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').in('category', ['underage_suspected', 'trafficking_suspected']),
      supabase.from('encuentros_publishers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('encuentros_payments').select('amount_usd')
        .gte('created_at', new Date(Date.now() - 86400 * 1000).toISOString())
        .eq('status', 'succeeded'),
    ]);
    const revenue24h = (payments24h.data || []).reduce((s, p) => s + parseFloat(p.amount_usd || 0), 0);
    res.json({
      pending_listings: listings.count || 0,
      pending_reports: reports.count || 0,
      urgent_reports: urgent.count || 0,
      active_publishers: publishers.count || 0,
      revenue_24h: revenue24h,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error stats' });
  }
});

// GET review queue (pending listings)
router.get('/listings/pending', async (req, res) => {
  const { data } = await supabase
    .from('encuentros_listings')
    .select('id, display_name, age, gender, country_code, city, headline, description, services, cover_photo_url, created_at, publisher_id, publisher_email')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
    .limit(100);
  res.json({ listings: data || [] });
});

// POST aprobar listing
router.post('/listings/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { data: before } = await supabase
    .from('encuentros_listings').select('*').eq('id', id).maybeSingle();
  if (!before) return res.status(404).json({ error: 'No encontrado' });

  await supabase.from('encuentros_listings').update({
    status: 'active',
    reviewed_at: new Date().toISOString(),
  }).eq('id', id);

  // También aprobar todas las fotos pendientes del listing
  await supabase.from('encuentros_photos')
    .update({ moderation_status: 'approved' })
    .eq('listing_id', id).eq('moderation_status', 'pending');

  await logAudit({
    actor_type: 'admin', actor_id: req.admin.email,
    action: 'listing.approved', target_type: 'listing', target_id: id,
    before_state: { status: before.status }, after_state: { status: 'active' },
    ip: req.ip,
  });

  if (before.publisher_email) {
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || '';
    const tpl = templates.listing_approved({
      display_name: before.display_name,
      listing_url: `${frontendUrl}/#/l/${id}`,
    });
    sendMail({ to: before.publisher_email, template: 'listing_approved',
               subject: tpl.subject, html: tpl.html, metadata: { listing_id: id } }).catch(() => {});
  }
  res.json({ ok: true });
});

// POST rechazar listing
router.post('/listings/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  if (!reason || reason.length < 5) return res.status(400).json({ error: 'reason requerido' });

  const { data: before } = await supabase
    .from('encuentros_listings').select('*').eq('id', id).maybeSingle();
  if (!before) return res.status(404).json({ error: 'No encontrado' });

  await supabase.from('encuentros_listings').update({
    status: 'rejected',
    rejection_reason: reason,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id);

  await logAudit({
    actor_type: 'admin', actor_id: req.admin.email,
    action: 'listing.rejected', target_type: 'listing', target_id: id,
    before_state: { status: before.status }, after_state: { status: 'rejected', reason },
    ip: req.ip,
  });

  if (before.publisher_email) {
    const tpl = templates.listing_rejected({ display_name: before.display_name, reason });
    sendMail({ to: before.publisher_email, template: 'listing_rejected',
               subject: tpl.subject, html: tpl.html, metadata: { listing_id: id } }).catch(() => {});
  }
  res.json({ ok: true });
});

// GET reports queue (urgent first)
router.get('/reports', async (req, res) => {
  const { status = 'pending', category } = req.query;
  let q = supabase
    .from('encuentros_reports')
    .select('id, listing_id, category, description, evidence_url, reporter_email, status, created_at, listing:encuentros_listings(display_name, status, country_code, city)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(100);
  if (category) q = q.eq('category', category);
  // Urgentes primero
  const { data: urgent } = await supabase
    .from('encuentros_reports').select('id, listing_id, category, description, evidence_url, reporter_email, status, created_at, listing:encuentros_listings(display_name, status, country_code, city)')
    .eq('status', 'pending')
    .in('category', ['underage_suspected', 'trafficking_suspected'])
    .order('created_at', { ascending: true });
  const { data: rest } = await q;
  res.json({ reports: [...(urgent || []), ...(rest || []).filter(r => !urgent?.find(u => u.id === r.id))] });
});

// POST resolve report
router.post('/reports/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { action_taken, dismiss } = req.body || {};
  if (!action_taken && !dismiss) return res.status(400).json({ error: 'action_taken o dismiss requerido' });

  await supabase.from('encuentros_reports').update({
    status: dismiss ? 'dismissed' : 'resolved',
    action_taken: action_taken || 'dismissed',
    reviewed_by: req.admin.email,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id);

  await logAudit({
    actor_type: 'admin', actor_id: req.admin.email,
    action: dismiss ? 'report.dismissed' : 'report.resolved',
    target_type: 'report', target_id: id,
    after_state: { action_taken }, ip: req.ip,
  });
  res.json({ ok: true });
});

// POST ban publisher
router.post('/publishers/:id/ban', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'reason requerido' });

  await supabase.from('encuentros_publishers').update({
    status: 'banned',
    banned_reason: reason,
    banned_at: new Date().toISOString(),
  }).eq('id', id);

  // Pausar todos sus listings
  await supabase.from('encuentros_listings')
    .update({ status: 'paused' })
    .eq('publisher_id', id)
    .in('status', ['active', 'pending_review']);

  // Invalidar todas sus sesiones
  await supabase.from('encuentros_sessions').delete().eq('publisher_id', id);

  await logAudit({
    actor_type: 'admin', actor_id: req.admin.email,
    action: 'publisher.banned', target_type: 'publisher', target_id: id,
    after_state: { reason }, ip: req.ip,
  });
  res.json({ ok: true });
});

// GET listing detail (full info para review)
router.get('/listings/:id', async (req, res) => {
  const { id } = req.params;
  const { data: listing } = await supabase
    .from('encuentros_listings').select('*').eq('id', id).maybeSingle();
  if (!listing) return res.status(404).json({ error: 'No encontrado' });
  const { data: photos } = await supabase
    .from('encuentros_photos').select('*').eq('listing_id', id).order('position');
  const { data: reports } = await supabase
    .from('encuentros_reports').select('*').eq('listing_id', id).order('created_at', { ascending: false });
  res.json({ listing, photos: photos || [], reports: reports || [] });
});

export default router;
