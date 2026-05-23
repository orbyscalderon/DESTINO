import { supabase } from '../lib/supabase.js';
import { createNotification } from './inAppNotifController.js';

const COIN_VALUE_USD = 0.05;
const PLATFORM_FEE_RATE = 0.20;

const TIP_PRESETS = [10, 25, 50, 100, 200];

// POST /api/tips/:userId — send coins as a tip
export const sendTip = async (req, res) => {
  try {
    const fromId = req.user.id;
    const { userId: toId } = req.params;
    const { amount, message } = req.body;
    const coins = parseInt(amount);

    if (!toId || toId === fromId) return res.status(400).json({ error: 'Destinatario inválido' });
    if (!coins || coins < 1 || !TIP_PRESETS.includes(coins) && coins > 5000) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }

    const { data: toProfile } = await supabase
      .from('profiles')
      .select('id, full_name, is_creator, is_adult_creator, coins_balance')
      .eq('id', toId)
      .single();

    if (!toProfile) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Deduct coins from sender atomically
    const { data: deducted, error: deductErr } = await supabase
      .rpc('spend_coins', { p_user_id: fromId, p_amount: coins, p_description: `Propina a ${toProfile.full_name}` });

    if (deductErr || !deducted) {
      return res.status(400).json({ error: 'Monedas insuficientes', code: 'INSUFFICIENT_COINS' });
    }

    // Credit creator (80% of coin value as USD in earnings)
    const earningsUSD = coins * COIN_VALUE_USD * (1 - PLATFORM_FEE_RATE);
    await supabase
      .from('creator_earnings')
      .upsert(
        { creator_id: toId, total_earned: earningsUSD, available_balance: earningsUSD, pending_balance: 0, total_paid_out: 0 },
        { onConflict: 'creator_id', ignoreDuplicates: false }
      );
    // Try RPC increment instead (if available)
    await supabase.rpc('increment_creator_earnings', { p_creator_id: toId, p_amount: earningsUSD }).catch(() => {
      // Fallback: manual increment
      supabase.from('creator_earnings')
        .select('total_earned, available_balance')
        .eq('creator_id', toId)
        .single()
        .then(({ data: e }) => {
          if (e) {
            supabase.from('creator_earnings').update({
              total_earned: parseFloat(e.total_earned || 0) + earningsUSD,
              available_balance: parseFloat(e.available_balance || 0) + earningsUSD,
            }).eq('creator_id', toId);
          }
        });
    });

    // Record tip
    await supabase.from('profile_tips').insert({
      from_user_id: fromId,
      to_user_id: toId,
      amount_coins: coins,
      message: message?.trim()?.substring(0, 200) || null,
    });

    // Notify recipient
    const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', fromId).single();
    const tipMsg = message?.trim() ? `"${message.trim().substring(0, 60)}"` : '';
    createNotification(toId, 'tip', `💰 Propina recibida: ${coins} monedas`, `${sender?.full_name || 'Alguien'} te envió una propina${tipMsg ? ` — ${tipMsg}` : ''}`, { from_user_id: fromId });

    const { data: newBal } = await supabase.from('profiles').select('coins_balance').eq('id', fromId).single();
    res.json({ success: true, coins_remaining: newBal?.coins_balance ?? 0 });
  } catch (err) {
    console.error('sendTip error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/tips/received — tips received by creator
export const getTipsReceived = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('profile_tips')
      .select(`
        id, amount_coins, message, created_at,
        sender:profiles!from_user_id(id, full_name, avatar_url)
      `)
      .eq('to_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const total = (data || []).reduce((s, t) => s + t.amount_coins, 0);
    res.json({ tips: data || [], total_coins: total });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
