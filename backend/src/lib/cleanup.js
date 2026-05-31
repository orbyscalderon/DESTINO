import { supabase } from './supabase.js';
import { stripe } from './stripe.js';
import { createNotification } from '../controllers/inAppNotifController.js';
import { upsertCreatorEarnings } from '../controllers/showController.js';
import { PLATFORM_FEE_RATE } from '../controllers/coinController.js';

const MAX_RENEWAL_RETRIES = 3;
const AUTO_PAYOUT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 vez al día

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
    // Solo expirar suscripciones sin auto_renew O ya canceladas
    await supabase
      .from('creator_subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('current_period_end', now)
      .or('auto_renew.eq.false,failed_renewal_count.gte.' + MAX_RENEWAL_RETRIES);
  } catch (err) {
    console.error('Expire subscriptions error:', err.message);
  }
}

// Renovar automáticamente suscripciones a creadores que vencen en menos de 24h
async function renewCreatorSubscriptions() {
  if (!stripe) return;
  try {
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now   = new Date().toISOString();

    const { data: dueSubs } = await supabase
      .from('creator_subscriptions')
      .select(`
        id, subscriber_id, creator_id, subscription_price,
        stripe_customer_id, stripe_payment_method_id,
        failed_renewal_count,
        creator:profiles!creator_id(full_name, stripe_account_id, stripe_account_status)
      `)
      .eq('status', 'active')
      .eq('auto_renew', true)
      .gte('current_period_end', now)
      .lt('current_period_end', in24h)
      .lt('failed_renewal_count', MAX_RENEWAL_RETRIES);

    for (const sub of dueSubs || []) {
      if (!sub.stripe_customer_id || !sub.stripe_payment_method_id) {
        // Sin método guardado, no podemos renovar. Marcar para expirar.
        await supabase.from('creator_subscriptions')
          .update({ auto_renew: false, last_renewal_attempt: now })
          .eq('id', sub.id);
        continue;
      }

      const amountCents = Math.round(parseFloat(sub.subscription_price) * 100);
      const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

      try {
        const piParams = {
          amount: amountCents,
          currency: 'usd',
          customer: sub.stripe_customer_id,
          payment_method: sub.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            type: 'creator_subscription_renewal',
            creator_id: sub.creator_id,
            subscriber_id: sub.subscriber_id,
            subscription_id: sub.id,
          },
        };

        if (sub.creator?.stripe_account_id && sub.creator?.stripe_account_status === 'active') {
          piParams.application_fee_amount = platformFeeCents;
          piParams.transfer_data = { destination: sub.creator.stripe_account_id };
        }

        await stripe.paymentIntents.create(piParams);

        // Éxito → extender período + acreditar al creador
        const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const earningsUSD = parseFloat(sub.subscription_price) * (1 - PLATFORM_FEE_RATE);

        await supabase.from('creator_subscriptions').update({
          current_period_end: newPeriodEnd,
          failed_renewal_count: 0,
          last_renewal_attempt: now,
          updated_at: now,
        }).eq('id', sub.id);

        await upsertCreatorEarnings(sub.creator_id, earningsUSD).catch(() => {});

        createNotification(
          sub.subscriber_id,
          'subscription_renewed',
          'Suscripción renovada',
          `Renovamos tu suscripción a ${sub.creator?.full_name} por $${parseFloat(sub.subscription_price).toFixed(2)}`,
          {}
        ).catch(() => {});
      } catch (err) {
        const newCount = (sub.failed_renewal_count || 0) + 1;
        await supabase.from('creator_subscriptions').update({
          failed_renewal_count: newCount,
          last_renewal_attempt: now,
          updated_at: now,
        }).eq('id', sub.id);

        createNotification(
          sub.subscriber_id,
          'subscription_renewal_failed',
          'No pudimos renovar tu suscripción',
          `Falló el cobro a ${sub.creator?.full_name}. Actualiza tu método de pago para no perder el acceso.`,
          { url: '/premium' }
        ).catch(() => {});

        console.error(`Renewal failed sub=${sub.id} attempt=${newCount}:`, err.message);
      }
    }
  } catch (err) {
    console.error('renewCreatorSubscriptions error:', err.message);
  }
}

// Procesar payouts automáticos para creadores con auto_payout_enabled
async function processAutoPayouts() {
  if (!stripe) return;
  try {
    const { data: creators } = await supabase
      .from('profiles')
      .select(`
        id, full_name, auto_payout_min_usd, stripe_account_id, stripe_account_status,
        creator_earnings:creator_earnings!user_id(pending_balance)
      `)
      .eq('auto_payout_enabled', true)
      .eq('stripe_account_status', 'active');

    for (const creator of creators || []) {
      const pending = parseFloat(creator.creator_earnings?.[0]?.pending_balance || 0);
      const minThreshold = parseFloat(creator.auto_payout_min_usd || 50);

      if (pending < minThreshold) continue;
      if (!creator.stripe_account_id) continue;

      const amountCents = Math.floor(pending * 100);

      // Crear registro pending para idempotencia y auditoría
      const { data: payoutRow } = await supabase
        .from('auto_payouts')
        .insert({ creator_id: creator.id, amount_usd: pending, status: 'pending' })
        .select('id').single();

      try {
        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: 'usd',
          destination: creator.stripe_account_id,
          metadata: { type: 'auto_payout', creator_id: creator.id, payout_id: payoutRow?.id },
        });

        // Restar del balance pendiente y sumar a paid_out
        await supabase.rpc('apply_auto_payout', {
          p_creator_id: creator.id,
          p_amount_usd: pending,
        }).catch(async () => {
          // Fallback manual si la RPC no existe aún
          await supabase.from('creator_earnings').update({
            pending_balance: 0,
            total_paid_out: pending,
          }).eq('user_id', creator.id);
        });

        await supabase.from('auto_payouts').update({
          status: 'sent',
          stripe_transfer_id: transfer.id,
          completed_at: new Date().toISOString(),
        }).eq('id', payoutRow?.id);

        await supabase.from('profiles')
          .update({ last_auto_payout_at: new Date().toISOString() })
          .eq('id', creator.id);

        createNotification(
          creator.id,
          'payout',
          '💸 Payout automático enviado',
          `Te transferimos $${pending.toFixed(2)} USD a tu cuenta Stripe.`,
          {}
        ).catch(() => {});
      } catch (err) {
        await supabase.from('auto_payouts').update({
          status: 'failed',
          error_message: err.message,
        }).eq('id', payoutRow?.id);
        console.error(`Auto-payout failed creator=${creator.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('processAutoPayouts error:', err.message);
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

  // Expire shows with no host heartbeat for 10+ minutes (host crashed/lost connection)
  try {
    const heartbeatCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: e3 } = await supabase
      .from('live_shows')
      .update({ status: 'ended', ended_at: now })
      .eq('status', 'live')
      .not('host_heartbeat_at', 'is', null)
      .lt('host_heartbeat_at', heartbeatCutoff);
    if (e3 && !e3.message?.includes('host_heartbeat_at') && !e3.message?.includes('column')) {
      console.error('Cleanup heartbeat-stale shows error:', e3.message);
    }
  } catch { /* columna pendiente de migración */ }
}

export function startCleanupJob() {
  cleanStaleVideoSessions();
  setInterval(cleanStaleVideoSessions, CLEANUP_INTERVAL_MS);

  cleanStaleLiveShows();
  setInterval(cleanStaleLiveShows, LIVE_SHOW_CLEANUP_INTERVAL_MS);

  notifyUpcomingRenewals();
  renewCreatorSubscriptions();
  expireStaleSubscriptions();
  expireBoosts();
  expireStaleMatches();
  setInterval(() => {
    notifyUpcomingRenewals();
    renewCreatorSubscriptions();
    expireStaleSubscriptions();
    expireBoosts();
    expireStaleMatches();
  }, RENEWAL_CHECK_INTERVAL_MS);

  // Payouts automáticos una vez al día
  processAutoPayouts();
  setInterval(processAutoPayouts, AUTO_PAYOUT_INTERVAL_MS);

  console.log('🧹 Cleanup job iniciado (sesiones video 30s, shows 5min, renovaciones/boosts/matches 6h, payouts 24h)');
}
