import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import { upsertCreatorEarnings } from './showController.js';
import { PLATFORM_FEE_RATE } from './coinController.js';

const PREMIUM_PRICE_ID = process.env.STRIPE_PRICE_ID;
const VIP_PRICE_ID     = process.env.STRIPE_VIP_PRICE_ID;

const stripeNotConfigured = (res) =>
  res.status(503).json({ error: 'Pagos no configurados aún', code: 'STRIPE_NOT_CONFIGURED' });

const getTierFromPriceId = (priceId) => {
  if (priceId && priceId === VIP_PRICE_ID)     return 'vip';
  if (priceId && priceId === PREMIUM_PRICE_ID) return 'premium';
  return 'basic';
};

const getPriceIdForPlan = (plan) => {
  if (plan === 'vip')     return VIP_PRICE_ID || PREMIUM_PRICE_ID;
  return PREMIUM_PRICE_ID;
};

// POST /api/payments/create-checkout
// Body: { plan: 'premium' | 'vip' }
export const createCheckout = async (req, res) => {
  if (!stripe || !PREMIUM_PRICE_ID) return stripeNotConfigured(res);

  const plan = req.body.plan === 'vip' ? 'vip' : 'premium';
  const priceId = getPriceIdForPlan(plan);
  if (!priceId) return stripeNotConfigured(res);

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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/#/premium?success=true&plan=${plan}`,
      cancel_url: `${process.env.FRONTEND_URL}/#/premium?canceled=true`,
      metadata: { supabase_user_id: userId, plan },
      subscription_data: {
        metadata: { supabase_user_id: userId, plan },
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

  // Idempotency: skip already-processed events.
  // CRÍTICO: si esto falla por cualquier razón, NO procesar el evento.
  // Antes había un `catch { continue }` que permitía doble-cobrar si la
  // tabla no existía o Supabase fallaba.
  try {
    const { error: insertErr } = await supabase
      .from('processed_stripe_events')
      .insert({ event_id: event.id });
    if (insertErr?.code === '23505') {
      // Ya procesado — Stripe reenvía webhooks como retry, esto es normal
      return res.json({ received: true, skipped: true, reason: 'already_processed' });
    }
    if (insertErr) {
      // Cualquier otro error de DB es bloqueante. Stripe reintenta automáticamente.
      console.error('[webhook] critical: failed to mark event as processed', event.id, insertErr.message);
      return res.status(500).json({ error: 'Idempotency check failed' });
    }
  } catch (err) {
    console.error('[webhook] critical: idempotency table unreachable', event.id, err.message);
    return res.status(500).json({ error: 'Idempotency check failed' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = getUserIdFromEvent(sub);
        if (!userId) break;

        const isActive = sub.status === 'active' || sub.status === 'trialing';
        const priceId  = sub.items?.data?.[0]?.price?.id;
        const tier     = isActive ? getTierFromPriceId(priceId) : 'basic';

        await supabase
          .from('profiles')
          .update({ is_premium: isActive, premium_tier: tier, stripe_subscription_id: sub.id })
          .eq('id', userId);

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          status: sub.status,
          plan: tier,
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
          .update({ is_premium: false, premium_tier: 'basic', stripe_subscription_id: null })
          .eq('id', userId);

        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', plan: 'basic', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = getUserIdFromEvent(invoice.subscription_details);
        if (!userId) break;

        // Marcar suscripción como past_due
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer);

        // Notificar al usuario (in-app)
        const { createNotification } = await import('./inAppNotifController.js');
        const { sendPushToUser: pushUser } = await import('./notificationController.js');
        createNotification(
          userId,
          'payment',
          'Pago fallido',
          'No pudimos cobrar tu suscripción Premium. Actualiza tu método de pago.',
          { url: '/premium' }
        );
        pushUser(userId, {
          title: 'Pago de suscripción fallido',
          body: 'Actualiza tu método de pago para mantener el acceso Premium.',
          url: '/premium',
        }).catch(() => {});
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const userId = getUserIdFromEvent(invoice.subscription_details);
        if (!userId) break;
        // Asegurar que la suscripción Premium de la app quede activa tras renovación
        await supabase
          .from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer);
        // Reflejar también en el perfil
        await supabase
          .from('profiles')
          .update({ is_premium: true })
          .eq('id', userId);
        break;
      }

      // PaymentIntent payment failed (off-session renewal de creator subs)
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        if (pi.metadata?.type === 'creator_subscription_renewal') {
          const { subscriber_id, creator_id, subscription_id } = pi.metadata;
          if (subscription_id) {
            await supabase.rpc('increment_failed_renewal', { p_sub_id: subscription_id }).catch(async () => {
              const { data: cur } = await supabase
                .from('creator_subscriptions')
                .select('failed_renewal_count')
                .eq('id', subscription_id).single();
              await supabase.from('creator_subscriptions').update({
                failed_renewal_count: (cur?.failed_renewal_count || 0) + 1,
                last_renewal_attempt: new Date().toISOString(),
              }).eq('id', subscription_id);
            });
          }
          const { createNotification } = await import('./inAppNotifController.js');
          createNotification(
            subscriber_id,
            'subscription_renewal_failed',
            'Renovación fallida',
            'No pudimos cobrar tu suscripción. Actualiza tu método de pago.',
            { url: '/premium' }
          ).catch(() => {});
        }
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

      // Cuenta de Stripe Connect activada
      case 'account.updated': {
        const account = event.data.object;
        const creatorId = account.metadata?.supabase_user_id;
        if (!creatorId) break;

        const status = account.charges_enabled ? 'active' : 'pending';
        await supabase
          .from('profiles')
          .update({ stripe_account_status: status })
          .eq('stripe_account_id', account.id);
        break;
      }

      // Pago de ticket de show o foto completado (cobrado directamente desde el cliente)
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const { type, show_id, buyer_id, seller_id, photo_id } = pi.metadata || {};

        if (type === 'show_ticket' && show_id && buyer_id && seller_id) {
          const amountPaid = pi.amount / 100;
          const platformFee = amountPaid * PLATFORM_FEE_RATE;
          const creatorEarnings = amountPaid - platformFee;

          const { data: existing } = await supabase
            .from('show_tickets')
            .select('id')
            .eq('show_id', show_id)
            .eq('buyer_id', buyer_id)
            .single();

          if (!existing) {
            await supabase.from('show_tickets').insert({
              show_id, buyer_id,
              amount_paid: amountPaid,
              creator_earnings: creatorEarnings,
              platform_fee: platformFee,
              stripe_payment_intent_id: pi.id,
              status: 'active',
            });
            await upsertCreatorEarnings(seller_id, creatorEarnings);
          }
        }

        if (type === 'photo_purchase' && photo_id && buyer_id && seller_id) {
          const amountPaid = pi.amount / 100;
          const platformFee = amountPaid * PLATFORM_FEE_RATE;
          const creatorEarnings = amountPaid - platformFee;

          const { data: existing } = await supabase
            .from('content_purchases')
            .select('id')
            .eq('buyer_id', buyer_id)
            .eq('content_type', 'photo')
            .eq('content_id', photo_id)
            .single();

          if (!existing) {
            await supabase.from('content_purchases').insert({
              buyer_id, seller_id,
              content_type: 'photo',
              content_id: photo_id,
              amount_paid: amountPaid,
              creator_earnings: creatorEarnings,
              platform_fee: platformFee,
              stripe_payment_intent_id: pi.id,
            });
            await upsertCreatorEarnings(seller_id, creatorEarnings);
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        // Registrar reembolso — solo notificamos; la reversión de premium
        // la maneja subscription.deleted cuando Stripe cancela la sub
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', charge.customer)
          .single();
        if (sub?.user_id) {
          const { createNotification } = await import('./inAppNotifController.js');
          createNotification(
            sub.user_id,
            'payment',
            'Reembolso procesado',
            `Se procesó un reembolso de $${(charge.amount_refunded / 100).toFixed(2)} USD.`,
            {}
          );
        }
        break;
      }

      case 'customer.subscription.paused': {
        const sub = event.data.object;
        const userId = getUserIdFromEvent(sub);
        if (!userId) break;
        await supabase
          .from('profiles')
          .update({ is_premium: false, premium_tier: 'basic' })
          .eq('id', userId);
        await supabase
          .from('subscriptions')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'customer.subscription.resumed': {
        const sub = event.data.object;
        const userId = getUserIdFromEvent(sub);
        if (!userId) break;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const tier    = getTierFromPriceId(priceId);
        await supabase
          .from('profiles')
          .update({ is_premium: true, premium_tier: tier })
          .eq('id', userId);
        await supabase
          .from('subscriptions')
          .update({ status: 'active', plan: tier, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);
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
      .select('is_verified, premium_tier')
      .eq('id', userId)
      .single();

    if (!profile?.premium_tier || profile.premium_tier === 'basic') {
      return res.status(403).json({ error: 'La verificación de identidad requiere Plan Premium o VIP', code: 'PREMIUM_REQUIRED' });
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

// POST /api/payments/pause — pausar suscripción
export const pauseSubscription = async (req, res) => {
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
      pause_collection: { behavior: 'void' },
    });

    res.json({ message: 'Suscripción pausada. Puedes reanudarla en cualquier momento.' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/payments/resume — reanudar suscripción pausada
export const resumeSubscription = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return res.status(404).json({ error: 'No tienes suscripción' });
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      pause_collection: '',
    });

    res.json({ message: 'Suscripción reanudada' });
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

// POST /api/payments/photo/:photoId — comprar acceso a una foto de pago
export const purchasePhoto = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const { photoId } = req.params;
    const buyerId = req.user.id;

    const { data: photo } = await supabase
      .from('profile_photos')
      .select('id, user_id, price, is_paid')
      .eq('id', photoId)
      .single();

    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    if (!photo.is_paid || !photo.price) return res.status(400).json({ error: 'Esta foto es gratuita' });
    if (photo.user_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propia foto' });

    // Verificar si ya la compró
    const { data: existing } = await supabase
      .from('content_purchases')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('content_type', 'photo')
      .eq('content_id', photoId)
      .single();

    if (existing) return res.status(400).json({ error: 'Ya compraste esta foto' });

    // Obtener info del creador para Stripe Connect
    const { data: seller } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_account_status')
      .eq('id', photo.user_id)
      .single();

    // BLOQUEAR si el seller no tiene Stripe activo (issue auditoría #8)
    if (!seller?.stripe_account_id || seller?.stripe_account_status !== 'active') {
      return res.status(400).json({
        error: 'Este creador aún no tiene configurada su cuenta de pagos',
        code: 'CREATOR_PAYMENTS_NOT_READY',
      });
    }

    const amountCents = Math.round(photo.price * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const piParams = {
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: seller.stripe_account_id },
      metadata: {
        type: 'photo_purchase',
        photo_id: photoId,
        buyer_id: buyerId,
        seller_id: photo.user_id,
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(piParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: photo.price,
    });
  } catch (err) {
    console.error('purchasePhoto error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/payments/photo/:photoId/confirm — confirmar compra de foto tras pago exitoso
export const confirmPhotoPurchase = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const { photoId } = req.params;
    const { paymentIntentId } = req.body;
    const buyerId = req.user.id;

    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId requerido' });

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'El pago no se completó', code: 'PAYMENT_NOT_SUCCEEDED' });
    }

    if (pi.metadata?.photo_id !== photoId || pi.metadata?.buyer_id !== buyerId) {
      return res.status(403).json({ error: 'Datos de pago no coinciden' });
    }

    const amountPaid = pi.amount / 100;
    const platformFee = amountPaid * PLATFORM_FEE_RATE;
    const creatorEarnings = amountPaid - platformFee;
    const sellerId = pi.metadata.seller_id;

    const { data: existing } = await supabase
      .from('content_purchases')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('content_type', 'photo')
      .eq('content_id', photoId)
      .single();

    if (!existing) {
      await supabase.from('content_purchases').insert({
        buyer_id: buyerId,
        seller_id: sellerId,
        content_type: 'photo',
        content_id: photoId,
        amount_paid: amountPaid,
        creator_earnings: creatorEarnings,
        platform_fee: platformFee,
        stripe_payment_intent_id: paymentIntentId,
      });

      await upsertCreatorEarnings(sellerId, creatorEarnings);
    }

    // Devolver la URL real de la foto
    const { data: photo } = await supabase
      .from('profile_photos')
      .select('url')
      .eq('id', photoId)
      .single();

    res.json({ success: true, url: photo?.url });
  } catch (err) {
    console.error('confirmPhotoPurchase error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
