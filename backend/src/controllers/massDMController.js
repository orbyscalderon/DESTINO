import { supabase } from '../lib/supabase.js';

const TARGETS = ['all_subs', 'tier_1_plus', 'tier_2_plus', 'tier_3'];

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

    // Fan-out: 1 mensaje por suscriptor con dedup match + push notification
    let sent = 0;
    for (const subId of recipients) {
      try {
        const { data: m } = await supabase
          .from('matches')
          .select('id')
          .or(`and(user1_id.eq.${creatorId},user2_id.eq.${subId}),and(user1_id.eq.${subId},user2_id.eq.${creatorId})`)
          .maybeSingle();

        let matchId = m?.id;
        if (!matchId) {
          const { data: newM } = await supabase.from('matches').insert({
            user1_id: creatorId,
            user2_id: subId,
            kind: 'creator_subscription',
            created_at: new Date().toISOString(),
          }).select('id').single().catch(() => ({ data: null }));
          matchId = newM?.id;
        }
        if (!matchId) continue;

        await supabase.from('messages').insert({
          match_id: matchId,
          sender_id: creatorId,
          receiver_id: subId,
          type: ppv_media_url ? 'ppv' : 'text',
          content: message_text || null,
          is_ppv: !!ppv_media_url,
          ppv_price: price || null,
          ppv_media_url: ppv_media_url || null,
          broadcast_id: broadcast.id,
        });

        if (sendPushToUser) {
          sendPushToUser(subId, {
            title: pushTitle,
            body: pushBody,
            url: `/chat/${matchId}`,
            icon: creatorProfile?.avatar_url,
          }).catch(() => {});
        }
        sent++;
      } catch (err) {
        console.error('[massDM fan-out]', err.message);
      }
    }

    await supabase.from('mass_dm_broadcasts').update({
      sent_count: sent,
      status: sent === recipients.length ? 'completed' : (sent > 0 ? 'completed' : 'failed'),
      completed_at: new Date().toISOString(),
    }).eq('id', broadcast.id);

    res.status(201).json({
      broadcast_id: broadcast.id,
      recipients_count: recipients.length,
      sent_count: sent,
    });
  } catch (err) {
    console.error('createBroadcast', err.message);
    res.status(500).json({ error: 'Error enviando mass DM' });
  }
};

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
