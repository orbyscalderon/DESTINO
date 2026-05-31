import { supabase } from '../lib/supabase.js';

const MAX_ITEMS = 12;

// GET /api/creator/:creatorId/tip-menu — público
export const getCreatorTipMenu = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { data } = await supabase
      .from('creator_tip_menu')
      .select('id, label, description, emoji, price_coins, position, redemptions_count')
      .eq('creator_id', creatorId)
      .eq('is_active', true)
      .order('position', { ascending: true });
    res.json({ items: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/tip-menu — mis items (creator)
export const getMyTipMenu = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_tip_menu')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('position', { ascending: true });
    res.json({ items: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/tip-menu — crear item
// Body: { label, description?, emoji?, price_coins }
export const createTipMenuItem = async (req, res) => {
  try {
    const { label, description, emoji, price_coins } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label requerido' });
    const price = parseInt(price_coins);
    if (!price || price < 1 || price > 99999) return res.status(400).json({ error: 'Precio inválido (1-99999 coins)' });

    const { count } = await supabase
      .from('creator_tip_menu').select('id', { count: 'exact', head: true })
      .eq('creator_id', req.user.id);
    if ((count || 0) >= MAX_ITEMS) {
      return res.status(400).json({ error: `Máximo ${MAX_ITEMS} items en el menú` });
    }

    const { data, error } = await supabase.from('creator_tip_menu').insert({
      creator_id: req.user.id,
      label: label.trim().substring(0, 60),
      description: description?.trim()?.substring(0, 200) || null,
      emoji: emoji?.substring(0, 4) || null,
      price_coins: price,
      position: count || 0,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (err) {
    console.error('createTipMenuItem error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/creator/tip-menu/:id
export const updateTipMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, description, emoji, price_coins, is_active, position } = req.body;
    const update = {};
    if (label !== undefined) update.label = label.trim().substring(0, 60);
    if (description !== undefined) update.description = description?.trim()?.substring(0, 200) || null;
    if (emoji !== undefined) update.emoji = emoji?.substring(0, 4) || null;
    if (price_coins !== undefined) {
      const p = parseInt(price_coins);
      if (!p || p < 1 || p > 99999) return res.status(400).json({ error: 'Precio inválido' });
      update.price_coins = p;
    }
    if (is_active !== undefined) update.is_active = !!is_active;
    if (position !== undefined) update.position = parseInt(position) || 0;

    const { data: existing } = await supabase
      .from('creator_tip_menu').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Item no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('creator_tip_menu').update(update).eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/creator/tip-menu/:id
export const deleteTipMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('creator_tip_menu').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Item no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    await supabase.from('creator_tip_menu').delete().eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/tip-menu/:id/redeem — usuario "compra" un item
// Body: { coins?: optional custom amount (must be >= price_coins) }
// Esto envía un tip al creador con el label como mensaje
export const redeemTipMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { coins: customCoins } = req.body;
    const userId = req.user.id;

    const { data: item } = await supabase
      .from('creator_tip_menu')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();
    if (!item) return res.status(404).json({ error: 'Item no disponible' });
    if (item.creator_id === userId) return res.status(400).json({ error: 'No puedes comprarte a ti mismo' });

    const coinsToSpend = customCoins ? Math.max(item.price_coins, parseInt(customCoins)) : item.price_coins;

    const { spendCoins, addCoins, CREATOR_CUT, coinsToUSD } = await import('./coinController.js');
    const { upsertCreatorEarnings } = await import('./showController.js');

    try {
      await spendCoins(userId, coinsToSpend, 'tip_sent', id);
    } catch (e) {
      if (e?.code === 'INSUFFICIENT_COINS') return res.status(400).json({ error: 'Coins insuficientes', code: 'INSUFFICIENT_COINS' });
      throw e;
    }
    await addCoins(item.creator_id, Math.round(coinsToSpend * CREATOR_CUT), 'tip_received', id);
    const usdEarning = coinsToUSD(coinsToSpend) * CREATOR_CUT;
    await upsertCreatorEarnings(item.creator_id, usdEarning).catch(() => {});

    // Incrementar redemptions count
    await supabase.from('creator_tip_menu')
      .update({ redemptions_count: (item.redemptions_count || 0) + 1 })
      .eq('id', id);

    // Notificar al creador
    const { data: buyer } = await supabase.from('profiles')
      .select('full_name').eq('id', userId).single();
    const { createNotification } = await import('./inAppNotifController.js');
    const { sendPushToUser } = await import('./notificationController.js');
    const label = `${item.emoji || '💌'} ${item.label}`;
    createNotification(item.creator_id, 'tip',
      `${buyer?.full_name || 'Alguien'} pidió: ${label}`,
      `${coinsToSpend} coins`,
      { tip_menu_id: id }
    ).catch(() => {});
    sendPushToUser(item.creator_id, {
      title: `${label} de ${buyer?.full_name || 'Alguien'}`,
      body: `${coinsToSpend} coins`,
    }).catch(() => {});

    // Email
    import('../lib/emailNotifier.js').then(({ notifyUser }) =>
      notifyUser(item.creator_id, 'tip_received', {
        fromName: buyer?.full_name || 'Alguien',
        amountUsd: usdEarning,
        coinsAmount: coinsToSpend,
      })
    ).catch(() => {});

    res.json({ success: true, coins_spent: coinsToSpend });
  } catch (err) {
    console.error('redeemTipMenuItem error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
