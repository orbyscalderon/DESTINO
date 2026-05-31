import { supabase } from '../lib/supabase.js';

const MAX_TIERS_PER_CREATOR = 3;

const DEFAULT_BADGES = {
  1: { emoji: '🥉', color: '#CD7F32', name: 'Fan' },
  2: { emoji: '🥈', color: '#C0C0C0', name: 'VIP' },
  3: { emoji: '🥇', color: '#FFD700', name: 'Top Fan' },
};

const DEFAULT_PERKS = {
  discount_pct_ppv: 0,
  discount_pct_tips: 0,
  free_messages_per_day: 0,
  exclusive_content: false,
  exclusive_shows: false,
  priority_dm: false,
  custom_emoji: false,
};

// GET /api/creator/:creatorId/tiers — público
// Devuelve los tiers activos del creador para que un fan pueda elegir al suscribirse
export const getCreatorTiers = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { data } = await supabase
      .from('creator_tiers')
      .select('id, tier_level, name, price, badge_color, badge_emoji, perks, description')
      .eq('creator_id', creatorId)
      .eq('is_active', true)
      .order('tier_level', { ascending: true });

    // Si no hay tiers, devolver legacy precio único como tier "single" para que
    // el frontend pueda mostrar el flow tradicional sin caso especial.
    if (!data || data.length === 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('creator_subscription_price')
        .eq('id', creatorId)
        .single();

      if (profile?.creator_subscription_price) {
        return res.json({
          tiers: [],
          legacy_price: parseFloat(profile.creator_subscription_price),
        });
      }
      return res.json({ tiers: [], legacy_price: null });
    }

    res.json({ tiers: data });
  } catch (err) {
    console.error('getCreatorTiers error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/tiers — mis tiers (creator)
export const getMyTiers = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_tiers')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('tier_level', { ascending: true });
    res.json({ tiers: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/tiers — crear tier
// Body: { tier_level, name?, price, badge_color?, badge_emoji?, perks?, description? }
export const createTier = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { tier_level, name, price, badge_color, badge_emoji, perks, description } = req.body;

    const level = parseInt(tier_level);
    if (![1, 2, 3].includes(level)) {
      return res.status(400).json({ error: 'tier_level debe ser 1, 2 o 3' });
    }

    const parsedPrice = parseFloat(price);
    if (!parsedPrice || parsedPrice < 1 || parsedPrice > 500) {
      return res.status(400).json({ error: 'Precio debe estar entre $1 y $500' });
    }

    const { count } = await supabase
      .from('creator_tiers').select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId);
    if ((count || 0) >= MAX_TIERS_PER_CREATOR) {
      return res.status(400).json({ error: `Máximo ${MAX_TIERS_PER_CREATOR} tiers por creador` });
    }

    const { data: existing } = await supabase
      .from('creator_tiers').select('id').eq('creator_id', creatorId).eq('tier_level', level).single();
    if (existing) return res.status(400).json({ error: `Ya tienes un tier nivel ${level}` });

    const defaults = DEFAULT_BADGES[level];

    const { data, error } = await supabase.from('creator_tiers').insert({
      creator_id: creatorId,
      tier_level: level,
      name: (name?.trim() || defaults.name).substring(0, 40),
      price: parsedPrice,
      badge_color: badge_color || defaults.color,
      badge_emoji: (badge_emoji || defaults.emoji).substring(0, 4),
      perks: { ...DEFAULT_PERKS, ...(perks || {}) },
      description: description?.trim()?.substring(0, 300) || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ tier: data });
  } catch (err) {
    console.error('createTier error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/creator/tiers/:id
export const updateTier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, badge_color, badge_emoji, perks, description, is_active } = req.body;

    const { data: existing } = await supabase
      .from('creator_tiers').select('creator_id, perks').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Tier no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const update = {};
    if (name !== undefined) update.name = name.trim().substring(0, 40);
    if (price !== undefined) {
      const p = parseFloat(price);
      if (!p || p < 1 || p > 500) return res.status(400).json({ error: 'Precio inválido' });
      update.price = p;
    }
    if (badge_color !== undefined) update.badge_color = badge_color;
    if (badge_emoji !== undefined) update.badge_emoji = badge_emoji.substring(0, 4);
    if (perks !== undefined) update.perks = { ...(existing.perks || DEFAULT_PERKS), ...perks };
    if (description !== undefined) update.description = description?.trim()?.substring(0, 300) || null;
    if (is_active !== undefined) update.is_active = !!is_active;

    await supabase.from('creator_tiers').update(update).eq('id', id);
    res.json({ success: true });
  } catch (err) {
    console.error('updateTier error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/creator/tiers/:id
export const deleteTier = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('creator_tiers').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Tier no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    // Soft-delete: solo desactivar para preservar referencias en creator_subscriptions
    await supabase.from('creator_tiers').update({ is_active: false }).eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/:creatorId/gift-sub
// Body: { recipientId, tierId, message? }
// El "gifter" paga en COINS, el creator recibe USD earnings, el recipient recibe sub real
export const giftSubscription = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { recipientId, tierId, message } = req.body;
    const gifterId = req.user.id;

    if (!recipientId || !tierId) return res.status(400).json({ error: 'recipientId y tierId requeridos' });
    if (recipientId === gifterId) return res.status(400).json({ error: 'No puedes regalarte a ti mismo' });
    if (recipientId === creatorId) return res.status(400).json({ error: 'No puedes regalarle al propio creador' });

    // Validar tier
    const { data: tier } = await supabase
      .from('creator_tiers')
      .select('id, creator_id, price, name, tier_level, badge_emoji')
      .eq('id', tierId)
      .eq('is_active', true)
      .single();
    if (!tier || tier.creator_id !== creatorId) return res.status(404).json({ error: 'Tier no válido' });

    // Validar recipient existe y no está ya suscrito activamente al mismo creator
    const { data: recipient } = await supabase
      .from('profiles').select('id, full_name, email_prefs').eq('id', recipientId).single();
    if (!recipient) return res.status(404).json({ error: 'Destinatario no encontrado' });

    const { data: existingSub } = await supabase
      .from('creator_subscriptions')
      .select('id, status, current_period_end')
      .eq('subscriber_id', recipientId)
      .eq('creator_id', creatorId)
      .single();

    if (existingSub?.status === 'active') {
      return res.status(400).json({ error: 'El destinatario ya está suscrito a este creador' });
    }

    // Convertir precio USD → coins. 1 coin = $0.05 USD → coins = price * 20
    const { spendCoins, addCoins, CREATOR_CUT, coinsToUSD, PLATFORM_FEE_RATE } = await import('./coinController.js');
    const coinsCost = Math.ceil(parseFloat(tier.price) * 20);

    try {
      await spendCoins(gifterId, coinsCost, 'gift_subscription', creatorId);
    } catch (e) {
      if (e?.code === 'INSUFFICIENT_COINS') {
        return res.status(400).json({ error: 'Coins insuficientes', code: 'INSUFFICIENT_COINS', required: coinsCost });
      }
      throw e;
    }

    // Acreditar al creator (en coins también, para que aparezca en su balance unificado)
    const creatorCoins = Math.round(coinsCost * CREATOR_CUT);
    await addCoins(creatorId, creatorCoins, 'subscription_gift_received', recipientId);

    // Acreditar USD earnings (para analytics y payout)
    const earningsUSD = parseFloat(tier.price) * CREATOR_CUT;
    const { upsertCreatorEarnings } = await import('./showController.js');
    await upsertCreatorEarnings(creatorId, earningsUSD).catch(() => {});

    // Crear la suscripción para el recipient
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('creator_subscriptions').upsert({
      subscriber_id: recipientId,
      creator_id: creatorId,
      tier_id: tierId,
      subscription_price: tier.price,
      status: 'active',
      current_period_end: periodEnd,
      is_gift: true,
      gifted_by: gifterId,
      gift_message: message?.trim()?.substring(0, 200) || null,
      auto_renew: false,  // los regalos no se renuevan automáticamente
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subscriber_id,creator_id' });

    // Notificaciones
    const { data: gifter } = await supabase.from('profiles').select('full_name').eq('id', gifterId).single();
    const { data: creator } = await supabase.from('profiles').select('full_name').eq('id', creatorId).single();

    const { createNotification } = await import('./inAppNotifController.js');
    const { sendPushToUser } = await import('./notificationController.js');

    // Notificar al RECIPIENT (la sorpresa)
    createNotification(
      recipientId,
      'subscription_gift',
      `🎁 ${gifter?.full_name || 'Alguien'} te regaló una suscripción`,
      `${tier.badge_emoji} ${tier.name} a ${creator?.full_name} por 1 mes`,
      { creator_id: creatorId, tier_id: tierId, gifter_id: gifterId }
    ).catch(() => {});
    sendPushToUser(recipientId, {
      title: `🎁 ¡Regalo de ${gifter?.full_name || 'alguien'}!`,
      body: `Suscripción ${tier.name} a ${creator?.full_name}`,
      url: `/u/${creatorId}`,
    }).catch(() => {});

    // Notificar al CREATOR (nuevo sub, regalado)
    createNotification(
      creatorId,
      'subscription',
      `🎁 ${gifter?.full_name || 'Alguien'} le regaló una suscripción a ${recipient.full_name}`,
      `Tier ${tier.name}`,
      { subscriber_id: recipientId, tier_id: tierId, is_gift: true }
    ).catch(() => {});

    // Emails
    import('../lib/emailNotifier.js').then(({ notifyUser }) => {
      notifyUser(recipientId, 'subscription_gift_received', {
        gifterName: gifter?.full_name || 'Un fan',
        creatorName: creator?.full_name || 'el creador',
        tierName: tier.name,
        message: message?.trim() || null,
      }).catch(() => {});
      notifyUser(creatorId, 'new_subscriber', {
        subscriberName: recipient.full_name || 'Un fan',
        priceUsd: tier.price,
        isGift: true,
        gifterName: gifter?.full_name || 'Un fan',
      }).catch(() => {});
    }).catch(() => {});

    res.json({
      success: true,
      coins_spent: coinsCost,
      tier_name: tier.name,
      recipient_name: recipient.full_name,
    });
  } catch (err) {
    console.error('giftSubscription error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/my-subscription/:creatorId
// Devuelve info de mi suscripción a un creador (incluye tier + perks aplicables)
export const getMySubscriptionInfo = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const subscriberId = req.user.id;

    const { data: sub } = await supabase
      .from('creator_subscriptions')
      .select(`
        id, status, current_period_end, is_gift, gifted_by, gift_message,
        subscription_price, created_at, auto_renew,
        tier:tier_id (id, tier_level, name, badge_emoji, badge_color, perks, description)
      `)
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId)
      .single();

    if (!sub) return res.json({ subscription: null });
    res.json({ subscription: sub });
  } catch {
    res.json({ subscription: null });
  }
};
