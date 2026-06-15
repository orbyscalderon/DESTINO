// Reports — endpoint público para que cualquier visitante reporte un listing.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { sendMail, templates } from '../lib/email.js';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 5 });

const ALLOWED_CATEGORIES = [
  'underage_suspected',     // PRIORIDAD MÁXIMA — escalación NCMEC
  'trafficking_suspected',  // PRIORIDAD MÁXIMA — escalación autoridades
  'fake_photos',
  'scam_payment',
  'aggressive_behavior',
  'fake_identity',
  'spam',
  'other',
];

const URGENT_CATEGORIES = ['underage_suspected', 'trafficking_suspected'];

router.post('/', limiter, async (req, res) => {
  try {
    const { listing_id, category, description, evidence_url, reporter_email } = req.body || {};
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!description || description.length < 10 || description.length > 2000) {
      return res.status(400).json({ error: 'Descripción debe tener entre 10 y 2000 caracteres' });
    }
    if (!listing_id || !/^[0-9a-f-]{36}$/i.test(listing_id)) {
      return res.status(400).json({ error: 'listing_id requerido' });
    }

    const { data: report, error } = await supabase.from('encuentros_reports').insert({
      listing_id,
      category,
      description: description.slice(0, 2000),
      evidence_url: evidence_url?.slice(0, 500) || null,
      reporter_email: reporter_email?.slice(0, 200) || null,
      reporter_ip: req.ip,
    }).select().single();
    if (error) throw error;

    // Escalación inmediata si es urgente
    if (URGENT_CATEGORIES.includes(category)) {
      const urgentEmail = process.env.URGENT_REPORTS_EMAIL || process.env.MAIL_FROM;
      sendMail({
        to: urgentEmail,
        template: 'urgent_report',
        subject: `🚨 REPORTE URGENTE: ${category} - listing ${listing_id}`,
        html: `<h2>Reporte urgente</h2>
          <p><strong>Tipo:</strong> ${category}</p>
          <p><strong>Listing:</strong> ${listing_id}</p>
          <p><strong>Reporter IP:</strong> ${req.ip}</p>
          <p><strong>Descripción:</strong></p>
          <pre>${description.slice(0, 2000)}</pre>
          <p>SLA: <strong>30 minutos</strong>. Si confirmado underage → NCMEC.</p>
          <p>Si confirmado trafficking → autoridades del país de operación.</p>
          <p><a href="${process.env.ADMIN_URL || ''}/admin/reports/${report.id}">Resolver en dashboard</a></p>`,
        metadata: { report_id: report.id, listing_id, urgency: 'high' },
      }).catch(() => {});

      // Auto-pause del listing mientras se investiga
      await supabase.from('encuentros_listings')
        .update({ status: 'paused' })
        .eq('id', listing_id);
    }

    // Confirmación al reporter si dio email
    if (reporter_email) {
      const tpl = templates.report_received({ report_id: report.id });
      sendMail({ to: reporter_email, template: 'report_received', subject: tpl.subject, html: tpl.html,
                 metadata: { report_id: report.id } }).catch(() => {});
    }

    res.status(201).json({ ok: true, report_id: report.id });
  } catch (err) {
    console.error('[reports:create]', err.message);
    res.status(500).json({ error: 'Error registrando reporte' });
  }
});

export default router;
