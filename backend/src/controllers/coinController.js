import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';

// 1 coin = $0.05 USD
const COIN_VALUE_USD = 0.05;
const PLATFORM_FEE_RATE = 0.30;

export const COIN_PACKAGES = [
  { id: 'coins_100',  coins: 100,  price_usd: 5.00,  label: '100 Coins',  bonus: '' },
  { id: 'coins_250',  coins: 250,  price_usd: 10.00, label: '250 Coins',  bonus: '' },
  { id: 'coins_600',  coins: 600,  price_usd: 22.00, label: '600 Coins',  bonus: '+50 bonus' },
  { id: 'coins_1500', coins: 1500, price_usd: 50.00, label: '1500 Coins', bonus: '+200 bonus' },
  { id: 'coins_3500', coins: 3500, price_usd: 100.00, label: '3500 Coins', bonus: '+500 bonus' },
];

export function coinsToUSD(coins) {
  return coins * COIN_VALUE_USD;
}
export function creatorCutUSD(coins) {
  return coinsToUSD(coins) * (1 - PLATFORM_FEE_RATE);
}

// GET /api/coins/balance
export const getBalance = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('coins_balance')
      .eq('id', req.user.id)
      .single();

    res.json({ coins: profile?.coins_balance || 0 });
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

    const coins = parseInt(pi.metadata.coins);
    await addCoins(userId, coins, 'purchase', null, paymentIntentId);

    // Reward referrer on user's first purchase (fire-and-forget, non-blocking)
    triggerReferralReward(userId).catch(() => {});

    const { data: profile } = await supabase.from('profiles').select('coins_balance').eq('id', userId).single();
    res.json({ success: true, coins: profile?.coins_balance || 0 });
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
}
