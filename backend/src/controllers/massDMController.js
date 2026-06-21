import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const TARGETS = ['all_subs', 'tier_1_plus', 'tier_2_plus', 'tier_3'];

// Fan-out en batches paralelos. 50 per batch evita open file limit en
// Supabase y mantiene latency razonable. Para 1000 subs = 20 batches × ~80ms
// vs el secuencial que era 50s.
const BATCH_SIZE = 50;

// POST /api/creator/mass-dm
// Body: { target_filter, message_text?, ppv_media_url?, ppv_price? }
export const createBroadcast = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { target_filter, message_text, ppv_media_url, ppv_price } = req.body;

    if (!TARGETS.includes(target_filter)) {
      return res.status(400).json({ error: 'target_filter inválido', valid: TARGETS });
    }
    if (!message_text && !ppv_media_url) {
      return res.status(400).json({ error: 'Se requiere message_text o ppv_media_url' });
    }

    // Verificar que es creator
    const { data: prof } = await supabase
      .from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!prof?.is_creator) {
      return res.status(403).json({ error: 'Solo creators pueden enviar mass DM' });
    }

    const price = ppv_price != null ? parseInt(ppv_price) : null;

    // Resolver lista de destinatarios
    let query = supabase
      .from('creator_subscriptions')
      .select('subscriber_id, tier_level')
      .eq('creator_id', creatorId)
      .eq('status', 'active');

    if (target_filter === 'tier_1_plus') query = query.gte('tier_level', 1);
    else if (target_filter === 'tier_2_plus') query = query.gte('tier_level', 2);
    else if (target_filter === 'tier_3') query = query.eq('tier_level', 3);

    const { data: subs } = await query;
    const recipients = (subs || []).map(s => s.subscriber_id);

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No hay suscriptores activos para este filtro' });
    }

    // Crear broadcast
    const { data: broadcast } = await supabase.from('mass_dm_broadcasts').insert({
      creator_id: creatorId,
      target_filter,
      message_text: message_text?.trim().slice(0, 2000) || null,
      ppv_media_url: ppv_media_url?.slice(0, 1000) || null,
      ppv_price: price,
      recipients_count: recipients.length,
      status: 'sending',
    }).select('id').single();

    // Lazy-import del push para no crear circular dep
    const { sendPushToUser } = await import('./notificationController.js').catch(() => ({ sendPushToUser: null }));

    const { data: creatorProfile } = await supabase
      .from('profiles').select('full_name, avatar_url').eq('id', creatorId).maybeSingle();

    const pushTitle = `💌 ${creatorProfile?.full_name || 'Tu creator'}`;
    const pushBody  = ppv_media_url
      ? `Te envió contenido${price ? ` (${price} coins)` : ''}`
      : (message_text?.slice(0, 100) || 'Te envió un mensaje');

    // ── Respondemos AHORA al frontend ──
    // El fan-out (1000+ subs × 3 queries c/u) se ejecuta async después de la
    // response. Antes el creator esperaba 30-50s (request timeout en Railway).
    res.status(202).json({
      broadcast_id: broadcast.id,
      recipients_count: recipients.length,
      status: 'queued',
    });

    // Fan-out async — corre después de mandar response.
    // Errores se loguean y se reflejan en mass_dm_broadcasts.status.
    setImmediate(() => {
      processBroadcastFanOut({
        broadcast,
        recipients,
        creatorId,
        message_text,
        ppv_media_url,
        price,
        pushTitle,
        pushBody,
        creatorAvatar: creatorProfile?.avatar_url,
        sendPushToUser,
      }).catch(err => {
        logger.error('massDM fanout failed', { broadcastId: broadcast.id, err: err.message });
      });
    });
  } catch (err) {
    logger.error('createBroadcast', { err: err.message });
    res.status(500).json({ error: 'Error enviando mass DM' });
  }
};

// Procesa el fan-out en batches paralelos. Llamado vía setImmediate después
// de responder al cliente.
async function processBroadcastFanOut({
  broadcast, recipients, creatorId, message_text, ppv_media_url, price,
  pushTitle, pushBody, creatorAvatar, sendPushToUser,
}) {
  const log = logger.child({ broadcastId: broadcast.id, creatorId });
  log.info('fanout start', { recipients: recipients.length });
  const t0 = Date.now();

  let sent = 0;
  let failed = 0;

  // ── Paso 1: pre-cargar matches existentes en 1 sola query ──
  // Antes era N selects, ahora 1.
  const { data: existingMatches } = await supabase
    .from('matches')
    .select('id, user1_id, user2_id')
    .or(`user1_id.eq.${creatorId},user2_id.eq.${creatorId}`)
    .in('user1_id', [creatorId, ...recipients])
    .in('user2_id', [creatorId, ...recipients]);

  // Map otherUserId → matchId para lookup O(1).
  const matchByPeer = new Map();
  for (const m of existingMatches || []) {
    const peer = m.user1_id === creatorId ? m.user2_id : m.user1_id;
    matchByPeer.set(peer, m.id);
  }

  // ── Paso 2: crear matches que faltan en bulk ──
  const missingPeers = recipients.filter(r => !matchByPeer.has(r));
  if (missingPeers.length > 0) {
    const newMatches = missingPeers.map(peer => ({
      user1_id: creatorId,
      user2_id: peer,
      kind: 'creator_subscription',
      created_at: new Date().toISOString(),
    }));
    const { data: created } = await supabase
      .from('matches').insert(newMatches).select('id, user2_id');
    for (const m of created || []) matchByPeer.set(m.user2_id, m.id);
  }

  // ── Paso 3: enviar messages + push en batches paralelos ──
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    const messageRows = batch
      .filter(subId => matchByPeer.has(subId))
      .map(subId => ({
        match_id: matchByPeer.get(subId),
        sender_id: creatorId,
        receiver_id: subId,
        type: ppv_media_url ? 'ppv' : 'text',
        content: message_text || null,
        is_ppv: !!ppv_media_url,
        ppv_price: price || null,
        ppv_media_url: ppv_media_url || null,
        broadcast_id: broadcast.id,
      }));

    if (messageRows.length === 0) continue;

    const { error: msgErr } = await supabase.from('messages').insert(messageRows);
    if (msgErr) {
      failed += messageRows.length;
      log.warn('batch insert failed', { batchStart: i, err: msgErr.message });
      continue;
    }
    sent += messageRows.length;

    // Push notifications en paralelo (no esperamos la response, fire-and-forget)
    if (sendPushToUser) {
      for (const subId of batch) {
        const matchId = matchByPeer.get(subId);
        if (!matchId) continue;
        sendPushToUser(subId, {
          title: pushTitle,
          body: pushBody,
          url: `/chat/${matchId}`,
          icon: creatorAvatar,
        }).catch(() => {});
      }
    }
  }

  await supabase.from('mass_dm_broadcasts').update({
    sent_count: sent,
    status: sent === recipients.length ? 'completed' : (sent > 0 ? 'completed' : 'failed'),
    completed_at: new Date().toISOString(),
  }).eq('id', broadcast.id);

  log.info('fanout done', { sent, failed, ms: Date.now() - t0 });
}

// GET /api/creator/mass-dm — historial
export const listMyBroadcasts = async (req, res) => {
  try {
    const { data } = await supabase
      .from('mass_dm_broadcasts')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    res.json({ broadcasts: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// GET /api/creator/mass-dm/audience-count?target=tier_1_plus
export const getAudienceCount = async (req, res) => {
  try {
    const target = req.query.target;
    if (!TARGETS.includes(target)) return res.status(400).json({ error: 'target inválido' });

    let q = supabase
      .from('creator_subscriptions')
      .select('subscriber_id', { count: 'exact', head: true })
      .eq('creator_id', req.user.id)
      .eq('status', 'active');

    if (target === 'tier_1_plus') q = q.gte('tier_level', 1);
    else if (target === 'tier_2_plus') q = q.gte('tier_level', 2);
    else if (target === 'tier_3') q = q.eq('tier_level', 3);

    const { count } = await q;
    res.json({ count: count || 0, target });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
