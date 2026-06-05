import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import { cached, cacheDel } from '../lib/cache.js';
// Constantes ahora viven en lib/constants.js — re-exportamos para no romper
// imports existentes en otros controllers.
import { COIN_VALUE_USD, PLATFORM_FEE_RATE, CREATOR_CUT } from '../lib/constants.js';
export { COIN_VALUE_USD, PLATFORM_FEE_RATE, CREATOR_CUT };

export const COIN_PACKAGES = [
  { id: 'coins_100',  coins: 100,  bonus_coins: 0,   price_usd: 5.00,   label: '100 Coins' },
  { id: 'coins_250',  coins: 250,  bonus_coins: 0,   price_usd: 10.00,  label: '250 Coins' },
  { id: 'coins_600',  coins: 600,  bonus_coins: 50,  price_usd: 22.00,  label: '600 Coins' },
  { id: 'coins_1500', coins: 1500, bonus_coins: 200, price_usd: 50.00,  label: '1500 Coins' },
  { id: 'coins_3500', coins: 3500, bonus_coins: 500, price_usd: 100.00, label: '3500 Coins' },
];

export function coinsToUSD(coins) {
  return coins * COIN_VALUE_USD;
}
export function creatorCutUSD(coins) {
  return coinsToUSD(coins) * (1 - PLATFORM_FEE_RATE);
}

// GET /api/coins/balance — cacheado 20s (invalidado al gastar/recibir)
export const getBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const coins = await cached(`coins:${userId}`, 20_000, async () => {
      const { data } = await supabase
        .from('profiles').select('coins_balance').eq('id', userId).single();
      return data?.coins_balance || 0;
    });
    res.json({ coins });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/coins/packages
export const getPackages = async (req, res) => {
  res.json({ packages: COIN_PACKAGES });
};

// POST /api/coins/purchase — crear PaymentIntent para comprar coins
export const purchaseCoins = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const { packageId } = req.body;
    const pkg = COIN_PACKAGES.find(p => p.id === packageId);
    if (!pkg) return res.status(400).json({ error: 'Paquete inválido' });

    const amountCents = Math.round(pkg.price_usd * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        type: 'coin_purchase',
        user_id: req.user.id,
        package_id: packageId,
        coins: pkg.coins,
        bonus_coins: pkg.bonus_coins || 0,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      package: pkg,
    });
  } catch (err) {
    console.error('purchaseCoins error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/coins/purchase/confirm — acreditar coins tras pago exitoso
export const confirmCoinPurchase = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const { paymentIntentId } = req.body;
    const userId = req.user.id;
    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId requerido' });

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') return res.status(400).json({ error: 'Pago no completado' });
    if (pi.metadata?.user_id !== userId) return res.status(403).json({ error: 'No autorizado' });

    // Idempotencia: verificar que no se procesó antes
    const { data: existing } = await supabase
      .from('coin_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (existing) {
      const { data: profile } = await supabase.from('profiles').select('coins_balance').eq('id', userId).single();
      return res.json({ success: true, coins: profile?.coins_balance || 0 });
    }

    const coins      = parseInt(pi.metadata.coins) || 0;
    const bonusCoins = parseInt(pi.metadata.bonus_coins) || 0;

    // Acreditar base + bonus en transacciones separadas para trazabilidad
    await addCoins(userId, coins, 'purchase', null, paymentIntentId);
    if (bonusCoins > 0) {
      await addCoins(userId, bonusCoins, 'bonus', `pkg_bonus:${pi.metadata.package_id}`);
    }

    // Email de confirmación de compra
    import('../lib/emailNotifier.js').then(({ notifyUser }) =>
      notifyUser(userId, 'coin_purchase', {
        coinsBase: coins,
        coinsBonus: bonusCoins,
        priceUsd: (pi.amount || 0) / 100,
      })
    ).catch(() => {});

    // Reward referrer on user's first purchase (fire-and-forget, non-blocking)
    triggerReferralReward(userId).catch(() => {});

    // Funnel: primera compra (idempotente)
    import('../lib/funnelTracker.js').then(({ trackFunnel }) =>
      trackFunnel(userId, 'first_purchase', {
        coins: coins + bonusCoins,
        price_usd: (pi.amount || 0) / 100,
      })
    ).catch(() => {});

    const { data: profile } = await supabase.from('profiles').select('coins_balance').eq('id', userId).single();
    res.json({ success: true, coins: profile?.coins_balance || 0, credited: coins + bonusCoins });
  } catch (err) {
    console.error('confirmCoinPurchase error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/coins/transactions
export const getTransactions = async (req, res) => {
  try {
    const { data } = await supabase
      .from('coin_transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ transactions: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Función utilitaria: agregar coins a un usuario
export async function addCoins(userId, coins, type, referenceId = null, stripePaymentIntentId = null) {
  await supabase.rpc('increment_coins', { p_user_id: userId, p_amount: coins });
  await supabase.from('coin_transactions').insert({
    user_id: userId,
    amount: coins,
    type,
    reference_id: referenceId,
    stripe_payment_intent_id: stripePaymentIntentId,
  });
  cacheDel(`coins:${userId}`);
}

// Recompensar al referidor en la primera compra del referido.
// Implementado aquí para evitar importación circular con referralController.
async function triggerReferralReward(referredId) {
  const { data: use } = await supabase
    .from('referral_uses')
    .select('id, referrer_id, rewarded')
    .eq('referred_id', referredId)
    .maybeSingle();

  if (!use || use.rewarded) return;

  const REFERRAL_REWARD_COINS = 50;
  await addCoins(use.referrer_id, REFERRAL_REWARD_COINS, 'bonus', 'Bono de referido');
  await supabase.from('referral_uses').update({ rewarded: true }).eq('id', use.id);

  // Achievements de referidor
  try {
    const { grantAchievement } = await import('./achievementsController.js');
    const { count } = await supabase
      .from('referral_uses')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', use.referrer_id)
      .eq('rewarded', true);
    grantAchievement(use.referrer_id, 'first_referral').catch(() => {});
    if ((count || 0) >= 10) grantAchievement(use.referrer_id, 'ten_referrals').catch(() => {});
  } catch {}
}

// Función utilitaria: gastar coins de un usuario (lanza error si saldo insuficiente)
// Usa spend_coins RPC para chequeo+decremento atómico (sin race condition)
export async function spendCoins(userId, coins, type, referenceId = null) {
  const { data: success, error } = await supabase.rpc('spend_coins', {
    p_user_id: userId,
    p_amount: coins,
  });

  if (error) throw error;
  if (!success) throw { code: 'INSUFFICIENT_COINS', message: 'Saldo de coins insuficiente' };

  await supabase.from('coin_transactions').insert({
    user_id: userId,
    amount: -coins,
    type,
    reference_id: referenceId,
  });
  cacheDel(`coins:${userId}`);
}
