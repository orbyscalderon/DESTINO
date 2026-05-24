import { supabase } from './supabase.js';
import { createNotification } from '../controllers/inAppNotifController.js';

const STALE_SESSION_MINUTES = 5;
const MAX_LIVE_SHOW_HOURS = 6;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const LIVE_SHOW_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
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

async function expireStaleMatches() {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabase
      .from('matches')
      .select('id, user1_id, user2_id')
      .eq('is_match', true)
      .not('expires_at', 'is', null)
      .lt('expires_at', now);

    if (!expired?.length) return;

    const ids = expired.map(m => m.id);
    await supabase.from('matches').delete().in('id', ids);

    for (const m of expired) {
      createNotification(
        m.user1_id,
        'match_expired',
        '💔 Match expirado',
        'Un match expiró porque no hubo conversación en 7 días.',
        {}
      ).catch(() => {});
      createNotification(
        m.user2_id,
        'match_expired',
        '💔 Match expirado',
        'Un match expiró porque no hubo conversación en 7 días.',
        {}
      ).catch(() => {});
    }
  } catch (err) {
    console.error('Expire matches error:', err.message);
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

async function cleanStaleLiveShows() {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - MAX_LIVE_SHOW_HOURS * 60 * 60 * 1000).toISOString();

  // Expire shows live for more than MAX_LIVE_SHOW_HOURS
  const { error: e1 } = await supabase
    .from('live_shows')
    .update({ status: 'ended', ended_at: now })
    .eq('status', 'live')
    .not('started_at', 'is', null)
    .lt('started_at', cutoff);

  if (e1) console.error('Cleanup stale live shows error:', e1.message);

  // Expire shows marked live but started_at never set (stuck in transition)
  const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min grace
  const { error: e2 } = await supabase
    .from('live_shows')
    .update({ status: 'ended', ended_at: now })
    .eq('status', 'live')
    .is('started_at', null)
    .lt('created_at', stuckCutoff);

  if (e2) console.error('Cleanup stuck live shows error:', e2.message);
}

export function startCleanupJob() {
  cleanStaleVideoSessions();
  setInterval(cleanStaleVideoSessions, CLEANUP_INTERVAL_MS);

  cleanStaleLiveShows();
  setInterval(cleanStaleLiveShows, LIVE_SHOW_CLEANUP_INTERVAL_MS);

  notifyUpcomingRenewals();
  expireStaleSubscriptions();
  expireBoosts();
  expireStaleMatches();
  setInterval(() => {
    notifyUpcomingRenewals();
    expireStaleSubscriptions();
    expireBoosts();
    expireStaleMatches();
  }, RENEWAL_CHECK_INTERVAL_MS);

  console.log('🧹 Cleanup job iniciado (sesiones de video cada 30s, shows cada 5min, renovaciones/boosts/matches cada 6h)');
}
