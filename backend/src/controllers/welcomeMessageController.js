import { supabase } from '../lib/supabase.js';

// GET /api/creator/welcome-message
export const getMyWelcomeMessage = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_welcome_messages')
      .select('*')
      .eq('creator_id', req.user.id)
      .maybeSingle();
    res.json({ welcome: data || null });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PUT /api/creator/welcome-message
// Body: { enabled, message_text, ppv_media_url?, ppv_price? }
export const upsertMyWelcomeMessage = async (req, res) => {
  try {
    const { enabled, message_text, ppv_media_url, ppv_price } = req.body;

    if (typeof message_text !== 'string' || message_text.trim().length < 5) {
      return res.status(400).json({ error: 'message_text requerido (min 5 caracteres)' });
    }

    const price = ppv_price != null ? parseInt(ppv_price) : null;
    if (price !== null && (isNaN(price) || price < 0)) {
      return res.status(400).json({ error: 'ppv_price debe ser un número positivo (en coins)' });
    }

    const { data, error } = await supabase.from('creator_welcome_messages').upsert({
      creator_id: req.user.id,
      enabled: enabled !== false,
      message_text: message_text.trim().slice(0, 2000),
      ppv_media_url: ppv_media_url?.slice(0, 1000) || null,
      ppv_price: price,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    res.json({ welcome: data });
  } catch (err) {
    console.error('upsertWelcome', err.message);
    res.status(500).json({ error: 'Error guardando welcome message' });
  }
};

// Trigger interno — llamar desde tierController al crear una subscripción
// (no es un HTTP endpoint, se importa)
export async function sendWelcomeMessageOnSubscribe(creatorId, subscriberId) {
  try {
    const { data: welcome } = await supabase
      .from('creator_welcome_messages')
      .select('enabled, message_text, ppv_media_url, ppv_price')
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (!welcome?.enabled) return;

    // Buscar el match (si existe) para enviar como DM normal.
    // Si no existe match, crear uno tipo "creator_subscription" para abrir el canal.
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('id')
      .or(`and(user1_id.eq.${creatorId},user2_id.eq.${subscriberId}),and(user1_id.eq.${subscriberId},user2_id.eq.${creatorId})`)
      .maybeSingle();

    let matchId = existingMatch?.id;
    if (!matchId) {
      const { data: newMatch } = await supabase.from('matches').insert({
        user1_id: creatorId,
        user2_id: subscriberId,
        kind: 'creator_subscription',
        created_at: new Date().toISOString(),
      }).select('id').single().catch(() => ({ data: null }));
      matchId = newMatch?.id;
    }
    if (!matchId) return;

    await supabase.from('messages').insert({
      match_id: matchId,
      sender_id: creatorId,
      receiver_id: subscriberId,
      type: welcome.ppv_media_url ? 'ppv' : 'text',
      content: welcome.message_text,
      is_ppv: !!welcome.ppv_media_url,
      ppv_price: welcome.ppv_price || null,
      ppv_media_url: welcome.ppv_media_url || null,
      is_welcome: true,
    });

    await supabase.from('creator_subscriptions')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('creator_id', creatorId)
      .eq('subscriber_id', subscriberId);
  } catch (err) {
    console.error('[sendWelcomeMessageOnSubscribe]', err.message);
  }
}
