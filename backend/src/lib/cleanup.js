import { supabase } from './supabase.js';
import { stripe } from './stripe.js';
import { createNotification } from '../controllers/inAppNotifController.js';
import { upsertCreatorEarnings } from '../controllers/showController.js';
import { PLATFORM_FEE_RATE } from '../controllers/coinController.js';

const MAX_RENEWAL_RETRIES = 3;
const AUTO_PAYOUT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 vez al día
const SHOW_REMINDER_INTERVAL_MS = 5 * 60 * 1000;     // cada 5 min

const STALE_SESSION_MINUTES = 5;
const MAX_LIVE_SHOW_HOURS = 6;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const LIVE_SHOW_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const RENEWAL_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function cleanStaleVideoSessions() {
  const now = new Date().toISOString();
  // Sesiones waiting que llevan > 5 min sin emparejarse
  // (usamos created_at porque waiting no tiene started_at — fix de bug previo)
  const waitingCutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000).toISOString();
  const { error: e1 } = await supabase
    .from('video_sessions')
    .update({ status: 'ended', ended_at: now })
    .eq('status', 'waiting')
    .lt('created_at', waitingCutoff);
  if (e1) console.error('Cleanup waiting sessions error:', e1.message);

  // Sesiones active que llevan > 30 min sin terminar (probable abandono)
  const activeCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: staleActive } = await supabase
    .from('video_sessions')
    .select('id, user1_id, user2_id')
    .eq('status', 'active')
    .lt('started_at', activeCutoff);
  if (staleActive?.length) {
    const ids = staleActive.map(s => s.id);
    await supabase
      .from('video_sessions')
      .update({ status: 'ended', ended_at: now })
      .in('id', ids);
    // Notificar a ambos partners (fire-and-forget)
    for (const s of staleActive) {
      [s.user1_id, s.user2_id].filter(Boolean).forEach(uid => {
        supabase.channel(`video:${uid}`).send({
          type: 'broadcast', event: 'call_ended',
          payload: { sessionId: s.id, reason: 'timeout' },
        }).catch(() => {});
      });
    }
  }
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

        import('./emailNotifier.js').then(({ notifyUser }) =>
          notifyUser(sub.subscriber_id, 'sub_renewed', {
            creatorName: sub.creator?.full_name || 'Creador',
            priceUsd: parseFloat(sub.subscription_price),
          })
        ).catch(() => {});

        // Comisión al affiliate del creator sobre la renovación mensual
        import('../controllers/affiliateController.js').then(({ recordAffiliateCommission }) =>
          recordAffiliateCommission(sub.creator_id, 'subscription_renewal', `sub:${sub.id}:${Date.now()}`, earningsUSD)
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

// Enviar push 15 min antes de que empiece un show programado
async function notifyUpcomingScheduledShows() {
  try {
    const now = new Date();
    const in15min = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const { data: shows } = await supabase
      .from('live_shows')
      .select(`
        id, title, host_id, scheduled_at,
        host:profiles!host_id(full_name)
      `)
      .eq('status', 'scheduled')
      .not('scheduled_at', 'is', null)
      .lt('scheduled_at', in15min)
      .gte('scheduled_at', now.toISOString())
      .is('reminder_notified_at', null);

    for (const show of shows || []) {
      const { data: interests } = await supabase
        .from('show_interests')
        .select('user_id, reminder_sent')
        .eq('show_id', show.id)
        .eq('reminder_sent', false);

      const userIds = (interests || []).map(i => i.user_id);
      if (userIds.length === 0) {
        await supabase.from('live_shows').update({ reminder_notified_at: now.toISOString() }).eq('id', show.id);
        continue;
      }

      const minsToStart = Math.max(1, Math.round((new Date(show.scheduled_at) - now) / 60000));
      const body = `${show.host?.full_name || 'Un creador'} empieza "${show.title}" en ${minsToStart} min`;

      for (const uid of userIds) {
        createNotification(
          uid,
          'show_reminder',
          '🔴 Tu show empieza pronto',
          body,
          { url: `/shows/${show.id}` }
        ).catch(() => {});
      }

      await supabase.from('show_interests')
        .update({ reminder_sent: true })
        .eq('show_id', show.id)
        .in('user_id', userIds);

      await supabase.from('live_shows')
        .update({ reminder_notified_at: now.toISOString() })
        .eq('id', show.id);
    }
  } catch (err) {
    console.error('notifyUpcomingScheduledShows error:', err.message);
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

        import('./emailNotifier.js').then(({ notifyUser }) =>
          notifyUser(creator.id, 'payout', { amountUsd: pending })
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

// Cron jobs nuevos en v54-v60: recurring shows, push reminders, deletion
async function runV6Crons() {
  try {
    const [gen, rem, del] = await Promise.all([
      import('../controllers/recurringShowsController.js')
        .then(m => m.generateUpcomingFromRecurring())
        .catch(() => ({ created: 0 })),
      import('../controllers/recurringShowsController.js')
        .then(m => m.sendShowReminders())
        .catch(() => ({ sent: 0 })),
      import('../controllers/accountDeletionController.js')
        .then(m => m.processDueDeletions())
        .catch(() => ({ processed: 0 })),
    ]);
    if ((gen.created || rem.sent || del.processed) > 0) {
      console.log(`[v6 cron] recurring=${gen.created} reminders=${rem.sent} deletions=${del.processed}`);
    }
  } catch (err) {
    console.error('[v6 cron]', err?.message);
  }
}

const V6_CRON_INTERVAL_MS = 10 * 60 * 1000; // cada 10 min
const V64_CRON_INTERVAL_MS = 60 * 1000;     // cada 1 min (scheduled msgs y disappear)
const V64_MAINT_INTERVAL_MS = 60 * 60 * 1000; // cada 1h (mutes + show_chat_state)

// ── v64 crons ────────────────────────────────────────────────────────
// 1) Dispatch scheduled messages cuyo scheduled_for ya pasó
async function dispatchScheduledMessages() {
  try {
    const nowIso = new Date().toISOString();
    const { data: pending } = await supabase
      .from('messages')
      .select('id, content, sender_id, match_id, conversation_id, type')
      .eq('is_scheduled', true)
      .lte('scheduled_for', nowIso)
      .limit(100);

    for (const msg of pending || []) {
      // Promote: clear is_scheduled, set scheduled_for null, set created_at to now
      await supabase.from('messages')
        .update({ is_scheduled: false, scheduled_for: null, created_at: nowIso })
        .eq('id', msg.id);

      // Push al destinatario
      try {
        const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', msg.sender_id).single();
        let recipients = [];
        if (msg.match_id) {
          const { data: match } = await supabase.from('matches').select('user1_id, user2_id').eq('id', msg.match_id).single();
          if (match) recipients = [match.user1_id === msg.sender_id ? match.user2_id : match.user1_id];
        } else if (msg.conversation_id) {
          const { data: others } = await supabase.from('conversation_members')
            .select('user_id').eq('conversation_id', msg.conversation_id).neq('user_id', msg.sender_id);
          recipients = (others || []).map(o => o.user_id);
        }
        const url = msg.match_id ? `/chat/${msg.match_id}` : `/conversations/${msg.conversation_id}`;
        const { sendPushToUser } = await import('../controllers/notificationController.js');
        recipients.forEach(rid => {
          sendPushToUser(rid, {
            title: sender?.full_name || 'Mensaje programado',
            body: (msg.content || '').slice(0, 100),
            url,
          }).catch(() => {});
        });
      } catch {}

      // Mentions parse en el momento de envío (texto puede haber referenciado a username que ya cambió)
      if (msg.type === 'text' && msg.content?.includes('@')) {
        try {
          const { insertMessageMentions } = await import('./mentions.js');
          insertMessageMentions(msg.id, msg.content, msg.sender_id).catch(() => {});
        } catch {}
      }
    }
  } catch (err) {
    console.error('[scheduled cron]', err.message);
  }
}

// 2) Borrar mensajes disappearing cuyo expires_at ya pasó
async function deleteExpiredMessages() {
  try {
    const nowIso = new Date().toISOString();
    const { error, count } = await supabase
      .from('messages')
      .delete({ count: 'exact' })
      .lt('expires_at', nowIso)
      .not('expires_at', 'is', null);
    if (error) console.warn('[disappearing cron]', error.message);
    else if (count > 0) console.log(`[disappearing] borrados ${count} mensajes expirados`);
  } catch (err) {
    console.error('[disappearing cron]', err.message);
  }
}

// 3) Notificar mentions pending (push a los mentioned aún no notificados)
async function notifyMentions() {
  try {
    const { data: pending } = await supabase
      .from('message_mentions')
      .select(`
        id, mentioned_id, mentioned_by, message_id,
        message:messages!message_id(content, match_id, conversation_id),
        by:profiles!mentioned_by(full_name)
      `)
      .eq('notified', false)
      .limit(50);

    if (!pending?.length) return;
    const { sendPushToUser } = await import('../controllers/notificationController.js');

    for (const m of pending) {
      const url = m.message?.match_id ? `/chat/${m.message.match_id}` : `/conversations/${m.message?.conversation_id || ''}`;
      sendPushToUser(m.mentioned_id, {
        title: `${m.by?.full_name || 'Alguien'} te mencionó`,
        body: (m.message?.content || '').slice(0, 100),
        url,
      }).catch(() => {});
    }

    const ids = pending.map(p => p.id);
    await supabase.from('message_mentions').update({ notified: true }).in('id', ids);
  } catch (err) {
    console.error('[mention cron]', err.message);
  }
}

// 4) Cleanup mutes expirados
async function cleanExpiredMutes() {
  try {
    await supabase.from('user_mutes')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);
  } catch {}
}

// 5) Cleanup show_chat_user_state viejo (>1d)
async function cleanShowChatState() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('show_chat_user_state').delete().lt('last_msg_at', cutoff);
  } catch {}
}

// 6) Cleanup ai_assistant_usage viejo (>24h) — el rate-limit es por hora pero
//    mantenemos 24h para analítica simple. Después se borra.
async function cleanAiUsage() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('ai_assistant_usage').delete().lt('created_at', cutoff);
  } catch {}
}

async function v64Cron() {
  await Promise.allSettled([
    dispatchScheduledMessages(),
    deleteExpiredMessages(),
    notifyMentions(),
  ]);
}

async function v64MaintCron() {
  await Promise.allSettled([
    cleanExpiredMutes(),
    cleanShowChatState(),
    cleanAiUsage(),
  ]);
}

// v68 — alertar 2257 records próximos a expirar (30 días antes de los 7 años)
async function alert2257Expiration() {
  try {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: expiring } = await supabase
      .from('video_2257_records')
      .select('id, video_id, uploaded_by, performer_legal_name, expires_at')
      .gte('expires_at', now)
      .lte('expires_at', in30Days)
      .is('archived_at', null)
      .limit(100);

    for (const r of expiring || []) {
      console.warn(`[2257] Record ${r.id} (video ${r.video_id}) expira ${r.expires_at}`);
      createNotification(
        r.uploaded_by,
        'compliance_2257_expiring',
        '⏰ 2257 record próximo a expirar',
        `El record de "${r.performer_legal_name}" expira el ${new Date(r.expires_at).toLocaleDateString('es')}. Después de esa fecha el contenido será archivado automáticamente.`,
        { record_id: r.id, video_id: r.video_id }
      ).catch(() => {});
    }
  } catch (err) {
    console.error('[alert2257Expiration]', err.message);
  }
}

// v68/v69 — archivar records vencidos (>7 años): snapshot encriptado a B2/Storage + archive_url
async function archive2257Expired() {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabase
      .from('video_2257_records')
      .select('*')
      .lte('expires_at', now)
      .is('archived_at', null)
      .limit(50);

    if (!expired?.length) return;

    const { uploadFile } = await import('./storageProvider.js').catch(() => ({ uploadFile: null }));

    for (const r of expired) {
      try {
        let archiveUrl = null;
        if (uploadFile) {
          const snapshot = JSON.stringify({
            archived_at: now,
            record: {
              id: r.id, video_id: r.video_id,
              performer_legal_name: r.performer_legal_name,
              performer_dob: r.performer_dob,
              performer_id_type: r.performer_id_type,
              performer_id_document_url: r.performer_id_document_url,
              consent_signed_at: r.consent_signed_at,
              produced_at: r.produced_at,
              custodian_name: r.custodian_name,
            },
            note: 'Archived per 18 USC 2257 retention policy after 7 years',
          }, null, 2);
          const archivePath = `2257-archive/${r.id}-${Date.now()}.json`;
          archiveUrl = await uploadFile(archivePath, Buffer.from(snapshot, 'utf-8'), 'application/json').catch(() => null);
        }

        await supabase.from('video_2257_records').update({
          archived_at: now,
          archive_url: archiveUrl,
        }).eq('id', r.id);

        if (r.video_id) {
          await supabase.from('profile_videos').update({ is_hidden: true }).eq('id', r.video_id);
        }
        console.log(`[2257] Archived record ${r.id} → ${archiveUrl || 'no-storage'}`);
      } catch (err) {
        console.error(`[archive2257 record ${r.id}]`, err.message);
      }
    }
  } catch (err) {
    console.error('[archive2257Expired]', err.message);
  }
}

async function v68ComplianceCron() {
  await Promise.allSettled([
    alert2257Expiration(),
    archive2257Expired(),
  ]);
}

// v75 — Fuck Now Spotlight: warnings 3 días antes, expiry cleanup, email
async function fucknowSpotlightCron() {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // 1) Publishers que expiran en próximos 3 días — email warning una vez
    //    Usa updated_at < hace 24h como "no notificado en este ciclo" heurística
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiringSoon } = await supabase
      .from('profiles')
      .select('id, fucknow_expires_at')
      .eq('fucknow_publisher', true)
      .gte('fucknow_expires_at', nowIso)
      .lte('fucknow_expires_at', in3Days)
      .limit(200);

    if (expiringSoon?.length) {
      const { sendSpotlightExpiringEmail } = await import('./emailService.js');
      for (const p of expiringSoon) {
        const daysLeft = Math.max(1, Math.ceil(
          (new Date(p.fucknow_expires_at).getTime() - now.getTime()) / 86400000
        ));
        sendSpotlightExpiringEmail(p.id, p.fucknow_expires_at, daysLeft).catch(() => {});
      }
    }

    // 2) Publishers ya expirados — desactivar publisher flag + email expirado
    const { data: expired } = await supabase
      .from('profiles')
      .select('id')
      .eq('fucknow_publisher', true)
      .lt('fucknow_expires_at', nowIso)
      .limit(500);

    if (expired?.length) {
      const ids = expired.map(p => p.id);
      await supabase
        .from('profiles')
        .update({ fucknow_publisher: false })
        .in('id', ids);

      const { sendSpotlightExpiredEmail } = await import('./emailService.js');
      for (const p of expired) {
        sendSpotlightExpiredEmail(p.id).catch(() => {});
        createNotification(
          p.id,
          'spotlight_expired',
          '💤 Tu Spotlight expiró',
          'Reactivá tu publicación cuando quieras desde el editor Spotlight.',
          { url: '/adult/spotlight' },
        ).catch(() => {});
      }
      console.log(`[fucknow] expirados ${expired.length} publishers`);
    }
  } catch (err) {
    console.error('[fucknowSpotlightCron]', err.message);
  }
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

  // Recordatorios de shows programados cada 5 min
  notifyUpcomingScheduledShows();
  setInterval(notifyUpcomingScheduledShows, SHOW_REMINDER_INTERVAL_MS);

  // v6 crons: recurring shows generation + push reminders + deletion process
  runV6Crons();
  setInterval(runV6Crons, V6_CRON_INTERVAL_MS);

  // v64 crons: scheduled msgs + disappearing + mentions notify
  v64Cron();
  setInterval(v64Cron, V64_CRON_INTERVAL_MS);

  // v64 maintenance: expired mutes + show_chat_state stale
  v64MaintCron();
  setInterval(v64MaintCron, V64_MAINT_INTERVAL_MS);

  // v68 compliance: 2257 expiration alerts + archive (corre 1 vez al día)
  v68ComplianceCron();
  setInterval(v68ComplianceCron, 24 * 60 * 60 * 1000);

  // v75 Fuck Now Spotlight: expiry cleanup + warning emails (corre cada 6h)
  fucknowSpotlightCron();
  setInterval(fucknowSpotlightCron, 6 * 60 * 60 * 1000);

  // v70: publicar posts/reels programados (cada 2 min)
  import('../controllers/scheduledContentController.js').then(({ publishDueScheduledContent }) => {
    publishDueScheduledContent();
    setInterval(publishDueScheduledContent, 2 * 60 * 1000);
  }).catch(() => {});

  // v71: auto-reply + AI persona (cada 5 min). Gated por feature flags en compliance_config.
  import('../workers/creatorAutomationWorker.js').then(({ runCreatorAutomationTick }) => {
    setInterval(() => runCreatorAutomationTick().catch(err => console.error('[creator-auto]', err.message)), 5 * 60 * 1000);
  }).catch(() => {});

  // v73: video processing (Whisper captions + sprite thumbnails). Gated por flags.
  import('../workers/videoProcessingWorker.js').then(({ runVideoProcessingTick }) => {
    setInterval(() => runVideoProcessingTick().catch(err => console.error('[video-processing]', err.message)), 5 * 60 * 1000);
  }).catch(() => {});

  console.log('🧹 Cleanup job iniciado (sesiones 30s, shows 5min, v6 10min, scheduled 1min, mantenimiento 1h, renovaciones 6h, payouts 24h, compliance 24h, scheduled-content 2min, creator-auto 5min)');
}
