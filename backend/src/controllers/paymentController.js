import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';

const PREMIUM_PRICE_ID = process.env.STRIPE_PRICE_ID;

const stripeNotConfigured = (res) =>
  res.status(503).json({ error: 'Pagos no configurados aún', code: 'STRIPE_NOT_CONFIGURED' });

// POST /api/payments/create-checkout
export const createCheckout = async (req, res) => {
  if (!stripe || !PREMIUM_PRICE_ID) return stripeNotConfigured(res);

  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: profile?.full_name,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/#/premium?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/#/premium?canceled=true`,
      metadata: { supabase_user_id: userId },
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/payments/webhook — Stripe llama este endpoint automáticamente
export const handleWebhook = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const getUserIdFromEvent = (obj) => obj?.metadata?.supabase_user_id;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = getUserIdFromEvent(sub);
        if (!userId) break;

        const isActive = sub.status === 'active' || sub.status === 'trialing';

        await supabase
          .from('profiles')
          .update({ is_premium: isActive, stripe_subscription_id: sub.id })
          .eq('id', userId);

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'stripe_subscription_id' });

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = getUserIdFromEvent(sub);
        if (!userId) break;

        await supabase
          .from('profiles')
          .update({ is_premium: false, stripe_subscription_id: null })
          .eq('id', userId);

        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = getUserIdFromEvent(invoice.subscription_details);
        console.error(`Pago fallido — customer: ${invoice.customer}, user: ${userId || 'desconocido'}`);
        break;
      }

      case 'identity.verification_session.verified': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;
        await supabase
          .from('profiles')
          .update({ is_verified: true, verification_status: 'verified' })
          .eq('id', userId);
        break;
      }

      case 'identity.verification_session.requires_input': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;
        await supabase
          .from('profiles')
          .update({ verification_status: null })
          .eq('id', userId);
        break;
      }
    }
  } catch (err) {
    console.error(`Error procesando webhook ${event.type}:`, err.message);
    // No retornar error — Stripe reintentará si no recibe 2xx
  }

  res.json({ received: true });
};

// POST /api/payments/identity/create-session
export const createIdentitySession = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_verified, is_premium')
      .eq('id', userId)
      .single();

    if (!profile?.is_premium) {
      return res.status(403).json({ error: 'La verificación de identidad es exclusiva para usuarios Premium' });
    }

    if (profile?.is_verified) {
      return res.status(400).json({ error: 'Tu cuenta ya está verificada' });
    }

    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { supabase_user_id: userId },
      options: {
        document: {
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
    });

    await supabase
      .from('profiles')
      .update({ verification_status: 'pending' })
      .eq('id', userId);

    res.json({ clientSecret: verificationSession.client_secret });
  } catch (err) {
    console.error('Error creating identity session:', err.message);
    res.status(500).json({ error: 'Error al crear sesión de verificación' });
  }
};

// POST /api/payments/cancel
export const cancelSubscription = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return res.status(404).json({ error: 'No tienes suscripción activa' });
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    res.json({ message: 'Suscripción cancelada al final del período actual' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/payments/status
export const getSubscriptionStatus = async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({ subscription: subscription || null, stripeConfigured: !!stripe });
  } catch (err) {
    res.json({ subscription: null, stripeConfigured: !!stripe });
  }
};
