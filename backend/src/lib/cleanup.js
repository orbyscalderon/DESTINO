import { supabase } from './supabase.js';
import { createNotification } from '../controllers/inAppNotifController.js';

const STALE_SESSION_MINUTES = 5;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const RENEWAL_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function cleanStaleVideoSessions() {
  const cutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('video_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('status', 'waiting')
    .lt('started_at', cutoff);

  if (error) console.error('Cleanup video sessions error:', error.message);
}

async function notifyUpcomingRenewals() {
  try {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: expiring } = await supabase
      .from('creator_subscriptions')
      .select(`
        subscriber_id,
        creator:profiles!creator_id(full_name)
      `)
      .eq('status', 'active')
      .gte('current_period_end', now)
      .lte('current_period_end', threeDaysFromNow);

    for (const sub of expiring || []) {
      createNotification(
        sub.subscriber_id,
        'subscription_renewal',
        '🔔 Renovación próxima',
        `Tu suscripción a ${sub.creator?.full_name} se renueva en menos de 3 días`,
        {}
      ).catch(() => {});
    }
  } catch (err) {
    console.error('Renewal check error:', err.message);
  }
}

async function expireStaleSubscriptions() {
  try {
    const now = new Date().toISOString();
    await supabase
      .from('creator_subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('current_period_end', now);
  } catch (err) {
    console.error('Expire subscriptions error:', err.message);
  }
}

async function expireBoosts() {
  try {
    const now = new Date().toISOString();
    // Fetch profiles whose boost just expired (boosted_until is not null and in the past)
    const { data: expired } = await supabase
      .from('profiles')
      .select('id, full_name')
      .not('boosted_until', 'is', null)
      .lt('boosted_until', now);

    if (!expired?.length) return;

    // Clear boosted_until so this batch is only processed once
    const ids = expired.map(p => p.id);
    await supabase.from('profiles').update({ boosted_until: null }).in('id', ids);

    // Notify each user
    for (const profile of expired) {
      createNotification(
        profile.id,
        'boost',
        '⚡ Tu boost ha expirado',
        'Tu perfil ya no está destacado. Activa un nuevo boost para seguir apareciendo primero.',
        {}
      ).catch(() => {});
    }
  } catch (err) {
    console.error('Expire boosts error:', err.message);
  }
}

export function startCleanupJob() {
  cleanStaleVideoSessions();
  setInterval(cleanStaleVideoSessions, CLEANUP_INTERVAL_MS);

  notifyUpcomingRenewals();
  expireStaleSubscriptions();
  expireBoosts();
  setInterval(() => {
    notifyUpcomingRenewals();
    expireStaleSubscriptions();
    expireBoosts();
  }, RENEWAL_CHECK_INTERVAL_MS);

  console.log('🧹 Cleanup job iniciado (sesiones de video cada 30s, renovaciones/boosts cada 6h)');
}
