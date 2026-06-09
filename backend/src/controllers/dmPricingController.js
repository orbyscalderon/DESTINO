import { supabase } from '../lib/supabase.js';

// GET /api/creator-monetization/dm-pricing
export const getMyDmPricing = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_dm_pricing').select('*').eq('creator_id', req.user.id).maybeSingle();
    res.json({ pricing: data || { creator_id: req.user.id, paywall_enabled: false, sexting_enabled: false } });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// PUT /api/creator-monetization/dm-pricing
export const upsertMyDmPricing = async (req, res) => {
  try {
    const {
      paywall_enabled, paywall_price_coins,
      sexting_enabled, sexting_price_coins,
      exempt_active_subs, exempt_tier_min,
    } = req.body;

    const paywallPrice = parseInt(paywall_price_coins) || 0;
    const sextingPrice = parseInt(sexting_price_coins) || 0;
    if (paywallPrice < 0 || sextingPrice < 0) {
      return res.status(400).json({ error: 'Precios no pueden ser negativos' });
    }

    const { data, error } = await supabase.from('creator_dm_pricing').upsert({
      creator_id: req.user.id,
      paywall_enabled: !!paywall_enabled,
      paywall_price_coins: paywallPrice,
      sexting_enabled: !!sexting_enabled,
      sexting_price_coins: sextingPrice,
      exempt_active_subs: exempt_active_subs !== false,
      exempt_tier_min: exempt_tier_min ? parseInt(exempt_tier_min) : null,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    res.json({ pricing: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/creator-monetization/dm-pricing/:creatorId/check
// Devuelve si el user actual necesita pagar para enviar DM a este creator
export const checkDmPricingForFan = async (req, res) => {
  try {
    const fanId = req.user.id;
    const { creatorId } = req.params;
    if (fanId === creatorId) return res.json({ requires_payment: false });

    const { data: pricing } = await supabase
      .from('creator_dm_pricing').select('*').eq('creator_id', creatorId).maybeSingle();

    if (!pricing || (!pricing.paywall_enabled && !pricing.sexting_enabled)) {
      return res.json({ requires_payment: false });
    }

    // Subs activos exentos?
    if (pricing.exempt_active_subs) {
      const { data: sub } = await supabase
        .from('creator_subscriptions')
        .select('tier_id, status, creator_tiers(tier_level)')
        .eq('creator_id', creatorId).eq('subscriber_id', fanId).eq('status', 'active').maybeSingle();
      if (sub) {
        const tierLevel = sub.creator_tiers?.tier_level || 1;
        if (!pricing.exempt_tier_min || tierLevel >= pricing.exempt_tier_min) {
          return res.json({ requires_payment: false, exempt_reason: 'active_subscription' });
        }
      }
    }

    const mode = pricing.paywall_enabled ? 'paywall' : 'sexting';
    const price = mode === 'paywall' ? pricing.paywall_price_coins : pricing.sexting_price_coins;
    res.json({ requires_payment: true, mode, price });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// Helper interno — cobrar al fan por enviar DM. Llamado desde messageController.
export async function chargeDmIfRequired({ payerId, receiverId, matchId, messageId }) {
  try {
    if (payerId === receiverId) return { charged: false };

    const { data: pricing } = await supabase
      .from('creator_dm_pricing').select('*').eq('creator_id', receiverId).maybeSingle();
    if (!pricing || (!pricing.paywall_enabled && !pricing.sexting_enabled)) {
      return { charged: false };
    }

    // Exenciones por subscripción activa
    if (pricing.exempt_active_subs) {
      const { data: sub } = await supabase
        .from('creator_subscriptions')
        .select('tier_id, status, creator_tiers(tier_level)')
        .eq('creator_id', receiverId).eq('subscriber_id', payerId).eq('status', 'active').maybeSingle();
      if (sub) {
        const tierLevel = sub.creator_tiers?.tier_level || 1;
        if (!pricing.exempt_tier_min || tierLevel >= pricing.exempt_tier_min) {
          return { charged: false, exempt: true };
        }
      }
    }

    const mode = pricing.paywall_enabled ? 'paywall' : 'sexting';
    const price = mode === 'paywall' ? pricing.paywall_price_coins : pricing.sexting_price_coins;
    if (price <= 0) return { charged: false };

    // Descontar coins atomicamente — usar RPC existente si está, sino simple update
    const { data: result } = await supabase.rpc('transfer_coins', {
      p_from: payerId, p_to: receiverId, p_amount: price, p_reason: `dm_${mode}`,
    }).single().catch(() => ({ data: null }));

    if (result?.error || !result?.success) {
      // Fallback simple si la RPC no existe
      const { data: bal } = await supabase.from('profiles').select('coins_balance').eq('id', payerId).single();
      if (!bal || bal.coins_balance < price) {
        return { charged: false, error: 'insufficient_coins', price };
      }
      await supabase.from('profiles').update({ coins_balance: bal.coins_balance - price }).eq('id', payerId);
      await supabase.rpc('increment_balance', { p_user_id: receiverId, p_amount: price }).catch(async () => {
        const { data: rb } = await supabase.from('profiles').select('coins_balance').eq('id', receiverId).single();
        if (rb) await supabase.from('profiles').update({ coins_balance: (rb.coins_balance || 0) + price }).eq('id', receiverId);
      });
    }

    await supabase.from('dm_paywall_charges').insert({
      match_id: matchId, payer_id: payerId, receiver_id: receiverId,
      message_id: messageId || null, price_coins: price, mode,
    });

    if (messageId) {
      await supabase.from('messages').update({ dm_paywall_charged: true }).eq('id', messageId).catch(() => {});
    }

    return { charged: true, price, mode };
  } catch (err) {
    console.error('[chargeDmIfRequired]', err.message);
    return { charged: false, error: err.message };
  }
}
