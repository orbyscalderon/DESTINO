// Cron worker — corre tareas diarias.
// Ejecutar via Railway cron schedule:
//   - "expire-listings" daily 04:00 UTC
//   - "notify-expiring" daily 09:00 UTC
//   - "daily-digest" daily 09:30 UTC
//   - "execute-deletions" daily 03:00 UTC
//
// Uso: node --env-file=.env cron/worker.js <task>
//      node cron/worker.js expire-listings
//      node cron/worker.js notify-expiring
//      node cron/worker.js all

import { supabase } from '../lib/supabase.js';
import { sendMail, templates } from '../lib/email.js';

const task = process.argv[2] || 'all';

async function expireListings() {
  console.log('[cron] expire-listings start');
  const { data: expired } = await supabase.rpc('expire_old_listings');
  console.log(`[cron] expired ${expired?.length || 0} listings`);
  for (const e of expired || []) {
    if (!e.publisher_email) continue;
    const tpl = templates.listing_expired({ display_name: e.expired_id });
    sendMail({ to: e.publisher_email, template: 'listing_expired',
               subject: tpl.subject, html: tpl.html, metadata: { listing_id: e.expired_id } })
      .catch(() => {});
  }
}

async function notifyExpiring() {
  console.log('[cron] notify-expiring start');
  const { data: items } = await supabase.rpc('listings_expiring_soon');
  console.log(`[cron] expiring soon: ${items?.length || 0}`);
  const frontend = (process.env.FRONTEND_URL || '').split(',')[0];
  for (const it of items || []) {
    const tpl = templates.listing_expiring_soon({
      display_name: it.display_name,
      expires_at: it.expires_at,
      renew_url: `${frontend}/#/dashboard/listings/${it.listing_id}/renew`,
    });
    sendMail({ to: it.publisher_email, template: 'listing_expiring_soon',
               subject: tpl.subject, html: tpl.html, metadata: { listing_id: it.listing_id } })
      .catch(() => {});
  }
}

async function dailyDigest() {
  console.log('[cron] daily-digest start');
  // Stats del día
  const since = new Date(Date.now() - 86400 * 1000).toISOString();
  const [newListings, newPubs, urgentRep, payments] = await Promise.all([
    supabase.from('encuentros_listings').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('encuentros_publishers').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('encuentros_reports').select('id', { count: 'exact', head: true })
      .gte('created_at', since).in('category', ['underage_suspected', 'trafficking_suspected']),
    supabase.from('encuentros_payments').select('amount_usd')
      .gte('created_at', since).eq('status', 'succeeded'),
  ]);
  const revenue = (payments.data || []).reduce((s, p) => s + parseFloat(p.amount_usd || 0), 0);
  const recipient = process.env.DAILY_DIGEST_EMAIL || process.env.MAIL_FROM;
  await sendMail({
    to: recipient,
    template: 'daily_digest',
    subject: `Encuentros — digest ${new Date().toLocaleDateString()}`,
    html: `<h2>Resumen 24h</h2>
      <ul>
        <li>Nuevos listings: ${newListings.count || 0}</li>
        <li>Nuevos publishers: ${newPubs.count || 0}</li>
        <li>Reportes urgentes: ${urgentRep.count || 0}</li>
        <li>Revenue: USD $${revenue.toFixed(2)}</li>
      </ul>`,
    metadata: { kind: 'digest' },
  }).catch(() => {});
}

async function executeDeletions() {
  console.log('[cron] execute-deletions start');
  // Eliminar definitivamente publishers que pidieron deletion hace +30 días
  const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: toDelete } = await supabase
    .from('encuentros_publishers')
    .select('id, email')
    .eq('status', 'deleted')
    .lt('scheduled_deletion_at', cutoff);
  for (const p of toDelete || []) {
    // CASCADE en FKs hace el resto. Mantenemos audit_log (no tiene FK).
    await supabase.from('encuentros_publishers').delete().eq('id', p.id);
    console.log(`[cron] deleted publisher ${p.id}`);
  }
}

async function run() {
  try {
    if (task === 'expire-listings' || task === 'all') await expireListings();
    if (task === 'notify-expiring' || task === 'all') await notifyExpiring();
    if (task === 'daily-digest' || task === 'all') await dailyDigest();
    if (task === 'execute-deletions' || task === 'all') await executeDeletions();
    console.log('[cron] done');
    process.exit(0);
  } catch (err) {
    console.error('[cron] failed:', err);
    process.exit(1);
  }
}

run();
