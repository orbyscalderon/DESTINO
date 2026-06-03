import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import { uploadFile } from '../lib/storageProvider.js';
import multer from 'multer';
import { upsertCreatorEarnings } from './showController.js';
import { COIN_VALUE_USD, CREATOR_CUT, PLATFORM_FEE_RATE, MIN_PAYOUT_USD } from '../lib/constants.js';
import { safeErrorMessage, processBatched } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';
const GALLERY_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];
const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    GALLERY_ALLOWED_MIME.includes(file.mimetype) ? cb(null, true) : cb(new Error('Formato no soportado'), false);
  },
});
export const galleryMediaMiddleware = (req, res, next) => {
  galleryUpload.single('media')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo no puede superar 100 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const MIN_PAYOUT = MIN_PAYOUT_USD;

const stripeNotConfigured = (res) =>
  res.status(503).json({ error: 'Pagos no configurados aún', code: 'STRIPE_NOT_CONFIGURED' });

// POST /api/creator/register — activar cuenta de creador
// Body:
//   { creatorType: 'normal' | 'adult',
//     acceptedTerms: true,
//     acceptedAdultTerms?: true (requerido si creatorType==='adult'),
//     country?: 'US' | 'ES' | ... (opcional, default 'US') }
export const becomeCreator = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const {
      creatorType = 'normal',
      acceptedTerms,
      acceptedAdultTerms,
      country,
    } = req.body || {};

    if (!['normal', 'adult'].includes(creatorType)) {
      return res.status(400).json({ error: 'creatorType inválido' });
    }
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'Debes aceptar los términos de creador' });
    }
    if (creatorType === 'adult' && !acceptedAdultTerms) {
      return res.status(400).json({ error: 'Debes aceptar los términos adicionales para contenido adulto' });
    }

    // Leer profile actual para country/edad
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, is_creator, is_adult_creator, age, country, stripe_account_id, full_name')
      .eq('id', userId)
      .single();

    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

    // Validaciones para creator adulto
    if (creatorType === 'adult') {
      const age = profile.age;
      if (age !== null && age !== undefined && age < 18) {
        return res.status(403).json({ error: 'Debes ser mayor de 18 años para contenido adulto' });
      }
    }

    const now = new Date().toISOString();
    const update = {
      is_creator: true,
      creator_terms_accepted_at: now,
      creator_terms_version: 'v1',
    };
    if (creatorType === 'adult') {
      update.is_adult_creator = true;
      update.adult_terms_accepted_at = now;
      update.adult_terms_version = 'v1';
    }

    // Crear cuenta Stripe Connect Express si no existe (necesaria para payouts)
    if (stripe && !profile.stripe_account_id) {
      try {
        const stripeCountry = (country || profile.country || 'US').toUpperCase();
        const account = await stripe.accounts.create({
          type: 'express',
          country: stripeCountry,
          email: userEmail,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            supabase_user_id: userId,
            creator_type: creatorType,
          },
        });
        update.stripe_account_id = account.id;
        update.stripe_account_status = 'pending';
      } catch (err) {
        console.warn('[becomeCreator] stripe.accounts.create failed:', err.message);
        // No bloqueamos el registro de creator — se puede reintentar en setup
      }
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId);

    if (updateErr) {
      return res.status(500).json({ error: `Error actualizando perfil: ${updateErr.message}` });
    }

    // Crear fila de earnings (no crítico)
    const { error: earnErr } = await supabase
      .from('creator_earnings')
      .upsert(
        { creator_id: userId, total_earned: 0, available_balance: 0, pending_balance: 0, total_paid_out: 0 },
        { onConflict: 'creator_id', ignoreDuplicates: true }
      );
    if (earnErr) console.warn('[becomeCreator] creator_earnings upsert warning:', earnErr.message);

    res.json({
      success: true,
      creatorType,
      stripeAccountCreated: !!update.stripe_account_id && !profile.stripe_account_id,
    });
  } catch (err) {
    console.error('[becomeCreator] catch:', err);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/creator/onboarding-link — URL de configuración de pagos en Stripe
// Si todavía no existe stripe_account_id, lo crea perezosamente. Esto cubre
// cuentas de creador legacy que se activaron antes de v33, o cuando la creación
// inicial en becomeCreator falló (stripe en mantenimiento, etc.)
export const getOnboardingLink = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, is_creator, is_adult_creator, country')
      .eq('id', userId)
      .single();

    if (!profile?.is_creator) {
      return res.status(400).json({ error: 'Primero debes activar tu cuenta de creador' });
    }

    // CRÍTICO: adult creators NO van por Stripe — Stripe TOS bannea NSFW.
    // Deben configurarse en CCBill (sub-account aprobada manualmente).
    if (profile.is_adult_creator) {
      return res.status(400).json({
        error: 'Como creador adulto usas CCBill para pagos. Solicita configuración a soporte.',
        code: 'ADULT_CREATOR_USE_CCBILL',
      });
    }

    let accountId = profile.stripe_account_id;
    if (!accountId) {
      try {
        const account = await stripe.accounts.create({
          type: 'express',
          country: (profile.country || 'US').toUpperCase(),
          email: userEmail,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            supabase_user_id: userId,
            creator_type: profile.is_adult_creator ? 'adult' : 'normal',
          },
        });
        accountId = account.id;
        await supabase
          .from('profiles')
          .update({ stripe_account_id: accountId, stripe_account_status: 'pending' })
          .eq('id', userId);
      } catch (err) {
        // No filtrar err.message — puede contener info de infraestructura
        console.error('getOnboardingLink stripe.accounts.create:', err.message, err.code);
        return res.status(500).json({ error: 'No se pudo crear la cuenta de pagos' });
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/#/creator/dashboard?onboarding=refresh`,
      return_url: `${process.env.FRONTEND_URL}/#/creator/dashboard?onboarding=complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('getOnboardingLink error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/dashboard — datos del panel de creador
export const getCreatorDashboard = async (req, res) => {
  try {
    const creatorId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_creator, stripe_account_id, stripe_account_status, creator_bio')
      .eq('id', creatorId)
      .single();

    if (!profile?.is_creator) {
      return res.status(403).json({ error: 'No eres creador', code: 'NOT_CREATOR' });
    }

    const [
      { data: earnings },
      { data: shows },
      { data: paidPhotos },
      { data: recentSales },
      { data: payouts },
    ] = await Promise.all([
      supabase.from('creator_earnings').select('*').eq('creator_id', creatorId).single(),
      supabase.from('live_shows').select('id, title, show_type, ticket_price, status, created_at').eq('host_id', creatorId).order('created_at', { ascending: false }).limit(10),
      supabase.from('profile_photos').select('id, url, price, is_paid').eq('user_id', creatorId).eq('is_paid', true),
      supabase.from('show_tickets').select('amount_paid, creator_earnings, purchased_at, show_id').in('show_id',
        // subconsulta simulada: obtener IDs de shows del creador
        (await supabase.from('live_shows').select('id').eq('host_id', creatorId)).data?.map(s => s.id) || []
      ).order('purchased_at', { ascending: false }).limit(20),
      supabase.from('withdrawal_requests').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(10),
    ]);

    // Sales de fotos
    const { data: photoSales } = await supabase
      .from('content_purchases')
      .select('amount_paid, creator_earnings, created_at, content_id')
      .eq('seller_id', creatorId)
      .eq('content_type', 'photo')
      .order('created_at', { ascending: false })
      .limit(20);

    const allSales = [
      ...(recentSales || []).map(s => ({ ...s, sale_type: 'show' })),
      ...(photoSales || []).map(s => ({ ...s, sale_type: 'photo' })),
    ].sort((a, b) => new Date(b.purchased_at || b.created_at) - new Date(a.purchased_at || a.created_at)).slice(0, 20);

    res.json({
      profile: {
        is_creator: profile.is_creator,
        stripe_account_status: profile.stripe_account_status,
        creator_bio: profile.creator_bio,
      },
      earnings: earnings || { total_earned: 0, available_balance: 0, pending_balance: 0, total_paid_out: 0 },
      shows: shows || [],
      paid_photos: paidPhotos || [],
      recent_sales: allSales,
      payouts: payouts || [],
      platform_fee_rate: PLATFORM_FEE_RATE,
    });
  } catch (err) {
    console.error('getCreatorDashboard error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/earnings — solo el balance
export const getEarnings = async (req, res) => {
  try {
    const creatorId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_creator')
      .eq('id', creatorId)
      .single();

    if (!profile?.is_creator) {
      return res.status(403).json({ error: 'No eres creador', code: 'NOT_CREATOR' });
    }

    const { data: earnings } = await supabase
      .from('creator_earnings')
      .select('*')
      .eq('creator_id', creatorId)
      .single();

    res.json({ earnings: earnings || { total_earned: 0, available_balance: 0, pending_balance: 0, total_paid_out: 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/payout — solicitar retiro
export const requestPayout = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const creatorId = req.user.id;
    const { amount } = req.body;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_creator, is_adult_creator, stripe_account_id, stripe_account_status')
      .eq('id', creatorId)
      .single();

    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    // Adult creators NO retiran por Stripe — pagos van por CCBill DataLink
    // (procesado separadamente; este endpoint es solo Stripe Connect).
    if (profile.is_adult_creator) {
      return res.status(400).json({
        error: 'Los retiros de creadores adultos se procesan por CCBill. Usa /api/payments/ccbill/payout',
        code: 'ADULT_CREATOR_USE_CCBILL_PAYOUT',
      });
    }
    if (profile?.stripe_account_status !== 'active') {
      return res.status(400).json({ error: 'Completa la configuración de pagos antes de retirar', code: 'STRIPE_SETUP_REQUIRED' });
    }

    const { data: earnings } = await supabase
      .from('creator_earnings')
      .select('available_balance, total_paid_out')
      .eq('creator_id', creatorId)
      .single();

    const available = parseFloat(earnings?.available_balance || 0);
    const requestedAmount = parseFloat(amount) || available;

    if (requestedAmount < MIN_PAYOUT) {
      return res.status(400).json({ error: `El mínimo de retiro es $${MIN_PAYOUT}` });
    }
    if (requestedAmount > available) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    // Descontar atómicamente primero — previene doble-gasto si dos requests llegan en paralelo
    const { data: deducted } = await supabase
      .rpc('deduct_creator_balance', { p_creator_id: creatorId, p_amount: requestedAmount });

    if (!deducted) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const amountCents = Math.round(requestedAmount * 100);

    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: profile.stripe_account_id,
        metadata: { supabase_creator_id: creatorId },
      });
    } catch (stripeErr) {
      // Si Stripe falla, devolver el balance
      await supabase.from('creator_earnings')
        .update({ available_balance: available })
        .eq('creator_id', creatorId);
      throw stripeErr;
    }

    // Registrar el payout y actualizar total_paid_out
    await Promise.all([
      supabase.from('withdrawal_requests').insert({
        creator_id: creatorId,
        amount_usd: requestedAmount,
        payout_details: transfer.id,
        status: 'paid',
      }),
      supabase.from('creator_earnings')
        .update({
          total_paid_out: parseFloat(earnings?.total_paid_out || 0) + requestedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('creator_id', creatorId),
    ]);

    res.json({ success: true, transfer_id: transfer.id, amount: requestedAmount });
  } catch (err) {
    console.error('requestPayout error:', err.message);
    res.status(500).json({ error: 'Error procesando el retiro. Verifica tu cuenta de Stripe.' });
  }
};

// PUT /api/creator/bio — actualizar bio de creador
export const updateCreatorBio = async (req, res) => {
  try {
    const userId = req.user.id;
    const { creator_bio } = req.body;

    await supabase
      .from('profiles')
      .update({ creator_bio: creator_bio?.trim() || null })
      .eq('id', userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/creator/subscription-price — creador establece su precio de suscripción mensual
export const setSubscriptionPrice = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { price } = req.body;
    const parsedPrice = parseFloat(price);

    if (parsedPrice !== null && (parsedPrice < 1 || parsedPrice > 500)) {
      return res.status(400).json({ error: 'El precio debe ser entre $1 y $500' });
    }

    await supabase
      .from('profiles')
      .update({ creator_subscription_price: parsedPrice || null })
      .eq('id', creatorId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/:creatorId/subscribe — suscribirse a un creador
// Body opcional: { tierId } — si se manda, usa el precio del tier; si no, usa
// el precio legacy creator_subscription_price.
export const subscribeToCreator = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const { creatorId } = req.params;
    const { tierId } = req.body || {};
    const subscriberId = req.user.id;

    if (creatorId === subscriberId) return res.status(400).json({ error: 'No puedes suscribirte a ti mismo' });

    const { data: creator } = await supabase
      .from('profiles')
      .select('creator_subscription_price, is_creator, is_adult_creator, full_name, stripe_account_id, stripe_account_status')
      .eq('id', creatorId)
      .single();

    if (!creator?.is_creator) return res.status(404).json({ error: 'Creador no encontrado' });

    // CRÍTICO: los adult creators NO pueden cobrar por Stripe (Stripe cierra
    // cuentas que detectan NSFW). Tienen que usar CCBill — el cliente debe
    // llamar /api/payments/ccbill/subscribe-link en su lugar.
    if (creator.is_adult_creator) {
      return res.status(400).json({
        error: 'Este creador usa CCBill para procesar pagos. Usa el endpoint de CCBill.',
        code: 'ADULT_CREATOR_USE_CCBILL',
      });
    }

    // Resolver precio: si manda tierId, usar tier.price; si no, legacy.
    let priceUsd = null;
    let tierName = null;
    if (tierId) {
      const { data: tier } = await supabase
        .from('creator_tiers')
        .select('id, price, name, creator_id, is_active')
        .eq('id', tierId)
        .single();
      if (!tier || tier.creator_id !== creatorId || !tier.is_active) {
        return res.status(400).json({ error: 'Tier no válido' });
      }
      priceUsd = parseFloat(tier.price);
      tierName = tier.name;
    } else {
      if (!creator?.creator_subscription_price) {
        return res.status(400).json({ error: 'Este creador no tiene suscripción activa' });
      }
      priceUsd = parseFloat(creator.creator_subscription_price);
    }

    // Verificar suscripción existente
    const { data: existing } = await supabase
      .from('creator_subscriptions')
      .select('id, status')
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId)
      .single();

    if (existing?.status === 'active') return res.status(400).json({ error: 'Ya estás suscrito a este creador' });

    // Obtener o crear customer de Stripe para el subscriber
    let { data: subProfile } = await supabase
      .from('profiles').select('stripe_customer_id').eq('id', subscriberId).single();

    let customerId = subProfile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { supabase_user_id: subscriberId },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', subscriberId);
    }

    // BLOQUEAR la compra si el creador NO tiene cuenta Stripe activa.
    // Antes se cobraba al fan pero el dinero quedaba en la plataforma sin
    // transfer al creator → discrepancia silenciosa en earnings.
    if (!creator?.stripe_account_id || creator?.stripe_account_status !== 'active') {
      return res.status(400).json({
        error: 'Este creador aún no tiene configurada su cuenta de pagos',
        code: 'CREATOR_PAYMENTS_NOT_READY',
      });
    }

    const amountCents = Math.round(priceUsd * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const piParams = {
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      setup_future_usage: 'off_session',
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: creator.stripe_account_id },
      metadata: {
        type: 'creator_subscription',
        creator_id: creatorId,
        subscriber_id: subscriberId,
        tier_id: tierId || '',
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(piParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: priceUsd,
      creatorName: creator.full_name,
      tierName,
    });
  } catch (err) {
    console.error('subscribeToCreator error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/:creatorId/subscribe/confirm — confirmar suscripción tras pago
export const confirmCreatorSubscription = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const { creatorId } = req.params;
    const { paymentIntentId } = req.body;
    const subscriberId = req.user.id;

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') return res.status(400).json({ error: 'Pago no completado' });
    if (pi.metadata?.subscriber_id !== subscriberId || pi.metadata?.creator_id !== creatorId) {
      return res.status(403).json({ error: 'Datos de pago no coinciden' });
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('creator_subscription_price')
      .eq('id', creatorId)
      .single();

    const amountPaid = pi.amount / 100;
    const earningsUSD = amountPaid * (1 - PLATFORM_FEE_RATE);
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const tierIdFromPi = pi.metadata?.tier_id || null;

    await supabase.from('creator_subscriptions').upsert({
      subscriber_id: subscriberId,
      creator_id: creatorId,
      tier_id: tierIdFromPi || null,
      subscription_price: amountPaid,
      status: 'active',
      current_period_end: periodEnd,
      stripe_customer_id: pi.customer || null,
      stripe_payment_method_id: pi.payment_method || null,
      auto_renew: true,
      failed_renewal_count: 0,
      canceled_at: null,
      is_gift: false,
      gifted_by: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subscriber_id,creator_id' });

    await upsertCreatorEarnings(creatorId, earningsUSD);

    const { data: sub } = await supabase.from('profiles').select('full_name').eq('id', subscriberId).single();
    createNotification(creatorId, 'subscription', '¡Nuevo suscriptor!', `${sub?.full_name} se suscribió a tu contenido`, { subscriber_id: subscriberId });

    // Achievements de suscripciones (creator side)
    try {
      const { grantAchievement } = await import('./achievementsController.js');
      const { count: activeSubs } = await supabase
        .from('creator_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creatorId)
        .eq('status', 'active');
      grantAchievement(creatorId, 'first_sub').catch(() => {});
      if ((activeSubs || 0) >= 10)  grantAchievement(creatorId, 'ten_subs').catch(() => {});
      if ((activeSubs || 0) >= 100) grantAchievement(creatorId, 'hundred_subs').catch(() => {});
    } catch {}

    // Email al creador (new_subscriber)
    import('../lib/emailNotifier.js').then(({ notifyUser }) =>
      notifyUser(creatorId, 'new_subscriber', {
        subscriberName: sub?.full_name || 'Un fan',
        priceUsd: amountPaid,
      })
    ).catch(() => {});
    sendPushToUser(creatorId, {
      title: '¡Nuevo suscriptor!',
      body: `${sub?.full_name} se suscribió a tu contenido`,
      url: '/creator/dashboard',
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('confirmCreatorSubscription error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/creator/:creatorId/subscribe — cancelar suscripción
// La suscripción queda activa hasta current_period_end pero no se renovará.
export const cancelCreatorSubscription = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const subscriberId = req.user.id;

    await supabase
      .from('creator_subscriptions')
      .update({
        auto_renew: false,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId);

    res.json({ message: 'Renovación automática desactivada. Tu acceso continúa hasta el final del período actual.' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/analytics — analytics del creador
export const getAnalytics = async (req, res) => {
  try {
    const creatorId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Shows del creador para joins
    const { data: myShows } = await supabase
      .from('live_shows').select('id').eq('host_id', creatorId);
    const myShowIds = (myShows || []).map(s => s.id);

    const [
      { data: showTicketsByDay },
      { data: photoSalesByDay },
      { data: tipsByDay },
      { data: subsByDay },
      { data: subscribers },
    ] = await Promise.all([
      // Tickets vendidos en los últimos 30 días
      supabase.from('show_tickets')
        .select('creator_earnings, purchased_at')
        .in('show_id', myShowIds.length ? myShowIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('purchased_at', thirtyDaysAgo),

      // Ventas de fotos en los últimos 30 días
      supabase.from('content_purchases')
        .select('creator_earnings, created_at')
        .eq('seller_id', creatorId)
        .gte('created_at', thirtyDaysAgo),

      // Tips en los últimos 30 días
      supabase.from('show_tips')
        .select('creator_earnings, created_at')
        .eq('creator_id', creatorId)
        .gte('created_at', thirtyDaysAgo),

      // Nuevas suscripciones
      supabase.from('creator_subscriptions')
        .select('subscription_price, created_at')
        .eq('creator_id', creatorId)
        .gte('created_at', thirtyDaysAgo),

      // Total suscriptores activos
      supabase.from('creator_subscriptions')
        .select('id', { count: 'exact' })
        .eq('creator_id', creatorId)
        .eq('status', 'active'),
    ]);

    // Agregar por día
    const byDay = {};
    const addToDay = (dateStr, amount) => {
      const day = dateStr.substring(0, 10);
      if (!byDay[day]) byDay[day] = 0;
      byDay[day] += parseFloat(amount);
    };

    (showTicketsByDay || []).forEach(t => addToDay(t.purchased_at, t.creator_earnings));
    (photoSalesByDay || []).forEach(t => addToDay(t.created_at, t.creator_earnings));
    (tipsByDay || []).forEach(t => addToDay(t.created_at, t.creator_earnings));
    (subsByDay || []).forEach(t => addToDay(t.created_at, t.subscription_price * CREATOR_CUT));

    const chartData = Object.entries(byDay)
      .map(([date, amount]) => ({ date, amount: parseFloat(amount.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalThirtyDays = chartData.reduce((sum, d) => sum + d.amount, 0);

    res.json({
      chart: chartData,
      totals: {
        thirty_days: parseFloat(totalThirtyDays.toFixed(2)),
        show_tickets: (showTicketsByDay || []).reduce((s, t) => s + parseFloat(t.creator_earnings), 0).toFixed(2),
        photo_sales: (photoSalesByDay || []).reduce((s, t) => s + parseFloat(t.creator_earnings), 0).toFixed(2),
        tips: (tipsByDay || []).reduce((s, t) => s + parseFloat(t.creator_earnings), 0).toFixed(2),
        subscriptions: (subsByDay || []).reduce((s, t) => s + parseFloat(t.subscription_price) * CREATOR_CUT, 0).toFixed(2),
      },
      subscribers: subscribers?.length || 0,
    });
  } catch (err) {
    console.error('getAnalytics error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/breakdown?days=30 — desglose unificado y comparativa
// Todos los ingresos en USD ya con el 70% (creator_earnings)
export const getEarningsBreakdown = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const now = Date.now();
    const periodMs = days * 24 * 60 * 60 * 1000;
    const startCurrent  = new Date(now - periodMs).toISOString();
    const startPrevious = new Date(now - 2 * periodMs).toISOString();

    const { data: profile } = await supabase
      .from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    // IDs de shows del creador (necesarios para tickets/tips/gifts)
    const { data: myShows } = await supabase
      .from('live_shows').select('id, title').eq('host_id', creatorId);
    const showMap = Object.fromEntries((myShows || []).map(s => [s.id, s.title]));
    const showIds = (myShows || []).map(s => s.id);
    const showIdsSafe = showIds.length ? showIds : ['00000000-0000-0000-0000-000000000000'];

    const queries = await Promise.all([
      // [0] Tickets de shows — con buyer y show_id para top-shows/top-fans
      supabase.from('show_tickets').select('creator_earnings, purchased_at, show_id, buyer:profiles!buyer_id(id, full_name, avatar_url)')
        .in('show_id', showIdsSafe).gte('purchased_at', startPrevious),
      // [1] Tips en shows
      supabase.from('show_tips').select('creator_earnings, coins_spent, created_at, show_id, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('creator_id', creatorId).gte('created_at', startPrevious),
      // [2] Regalos en shows
      supabase.from('show_gifts').select('coins_spent, created_at, show_id, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('creator_id', creatorId).gte('created_at', startPrevious),
      // [3] Ventas de contenido
      supabase.from('content_purchases').select('creator_earnings, created_at, buyer:profiles!buyer_id(id, full_name, avatar_url)')
        .eq('seller_id', creatorId).gte('created_at', startPrevious),
      // [4] Encargos de video
      supabase.from('video_requests').select('price, completed_at, requester:profiles!requester_id(id, full_name, avatar_url)')
        .eq('creator_id', creatorId).eq('status', 'completed').gte('completed_at', startPrevious),
      // [5] Suscripciones
      supabase.from('creator_subscriptions').select('subscription_price, created_at, subscriber:profiles!subscriber_id(id, full_name, avatar_url)')
        .eq('creator_id', creatorId).gte('created_at', startPrevious),
      // [6] Suscriptores activos
      supabase.from('creator_subscriptions').select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId).eq('status', 'active'),
      // [7] Galería purchases
      supabase.from('gallery_purchases').select('coins_paid, created_at, buyer:profiles!buyer_id(id, full_name, avatar_url)')
        .eq('creator_id', creatorId).gte('created_at', startPrevious),
    ]);

    const safe = (i) => Array.isArray(queries[i].data) ? queries[i].data : [];

    const COIN_USD = COIN_VALUE_USD;
    const CUT = CREATOR_CUT;
    const coinsToUSD = (coins) => parseFloat(coins || 0) * COIN_USD * CUT;
    const inRange = (dateStr, since) => new Date(dateStr) >= new Date(since);

    // Cada categoría con su fuente, función USD, campos relacionados y categoría visual
    const cats = {
      show_tickets:   { rows: safe(0), getUsd: r => parseFloat(r.creator_earnings || 0),     date: 'purchased_at', userKey: 'buyer',     hasShow: true },
      show_tips:      { rows: safe(1), getUsd: r => parseFloat(r.creator_earnings || 0),     date: 'created_at',   userKey: 'sender',    hasShow: true },
      show_gifts:     { rows: safe(2), getUsd: r => coinsToUSD(r.coins_spent),               date: 'created_at',   userKey: 'sender',    hasShow: true },
      photo_sales:    { rows: safe(3), getUsd: r => parseFloat(r.creator_earnings || 0),     date: 'created_at',   userKey: 'buyer' },
      video_requests: { rows: safe(4), getUsd: r => coinsToUSD(r.price),                     date: 'completed_at', userKey: 'requester' },
      subscriptions:  { rows: safe(5), getUsd: r => parseFloat(r.subscription_price || 0) * CUT, date: 'created_at', userKey: 'subscriber' },
      gallery_sales:  { rows: safe(7), getUsd: r => coinsToUSD(r.coins_paid),                date: 'created_at',   userKey: 'buyer' },
    };

    // Por categoría: total + count + avg + max en período actual; previous_usd para comparativa
    const totals_usd       = {};
    const previous_usd     = {};
    const breakdown_detail = {};

    Object.entries(cats).forEach(([key, { rows, getUsd, date }]) => {
      const current  = rows.filter(r => r[date] && inRange(r[date], startCurrent));
      const previous = rows.filter(r => r[date] && inRange(r[date], startPrevious) && !inRange(r[date], startCurrent));

      const sumCur  = current.reduce((s, r) => s + getUsd(r), 0);
      const sumPrev = previous.reduce((s, r) => s + getUsd(r), 0);
      const maxUsd  = current.reduce((m, r) => Math.max(m, getUsd(r)), 0);

      totals_usd[key]   = parseFloat(sumCur.toFixed(2));
      previous_usd[key] = parseFloat(sumPrev.toFixed(2));
      breakdown_detail[key] = {
        total_usd: parseFloat(sumCur.toFixed(2)),
        count:     current.length,
        avg_usd:   current.length > 0 ? parseFloat((sumCur / current.length).toFixed(2)) : 0,
        max_usd:   parseFloat(maxUsd.toFixed(2)),
      };
    });

    const totalCurrent  = Object.values(totals_usd).reduce((s, v) => s + v, 0);
    const totalPrevious = Object.values(previous_usd).reduce((s, v) => s + v, 0);
    const pctChange = totalPrevious > 0
      ? parseFloat((((totalCurrent - totalPrevious) / totalPrevious) * 100).toFixed(1))
      : (totalCurrent > 0 ? 100 : 0);

    // Chart por día
    const byDay = {};
    Object.values(cats).forEach(({ rows, getUsd, date }) => {
      rows.filter(r => r[date] && inRange(r[date], startCurrent)).forEach(r => {
        const day = r[date].substring(0, 10);
        byDay[day] = (byDay[day] || 0) + getUsd(r);
      });
    });
    const chart = Object.entries(byDay)
      .map(([date, amount]) => ({ date, amount: parseFloat(amount.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top shows del período (solo categorías que tienen show_id)
    const showTotals = {};
    Object.entries(cats).filter(([, c]) => c.hasShow).forEach(([catKey, { rows, getUsd, date }]) => {
      rows.filter(r => r[date] && inRange(r[date], startCurrent) && r.show_id).forEach(r => {
        const id = r.show_id;
        if (!showTotals[id]) showTotals[id] = { show_id: id, title: showMap[id] || 'Show', total_usd: 0, count: 0 };
        showTotals[id].total_usd += getUsd(r);
        showTotals[id].count += 1;
      });
    });
    const top_shows = Object.values(showTotals)
      .map(s => ({ ...s, total_usd: parseFloat(s.total_usd.toFixed(2)) }))
      .filter(s => s.total_usd > 0)
      .sort((a, b) => b.total_usd - a.total_usd)
      .slice(0, 5);

    // Top fans del período — suma de TODAS sus contribuciones al creador
    const fanTotals = {};
    Object.entries(cats).forEach(([, { rows, getUsd, date, userKey }]) => {
      rows.filter(r => r[date] && inRange(r[date], startCurrent) && r[userKey]?.id).forEach(r => {
        const u = r[userKey];
        if (!fanTotals[u.id]) fanTotals[u.id] = { id: u.id, name: u.full_name, avatar_url: u.avatar_url, total_usd: 0, count: 0 };
        fanTotals[u.id].total_usd += getUsd(r);
        fanTotals[u.id].count += 1;
      });
    });
    const top_fans = Object.values(fanTotals)
      .map(f => ({ ...f, total_usd: parseFloat(f.total_usd.toFixed(2)) }))
      .filter(f => f.total_usd > 0)
      .sort((a, b) => b.total_usd - a.total_usd)
      .slice(0, 10);

    res.json({
      totals_usd,
      previous_usd,
      breakdown_detail,
      total_current:  parseFloat(totalCurrent.toFixed(2)),
      total_previous: parseFloat(totalPrevious.toFixed(2)),
      pct_change:     pctChange,
      chart,
      top_shows,
      top_fans,
      subscribers_active: queries[6].count || 0,
      coin_rate: { usd_per_coin: COIN_USD, creator_cut: CUT, coins_per_usd: 1 / COIN_USD },
      days,
    });
  } catch (err) {
    console.error('getEarningsBreakdown error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/income-feed?limit=50 — historial unificado de ingresos
export const getIncomeFeed = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const limit = Math.max(10, Math.min(100, parseInt(req.query.limit) || 50));

    const { data: myShows } = await supabase
      .from('live_shows').select('id, title').eq('host_id', creatorId);
    const showMap = Object.fromEntries((myShows || []).map(s => [s.id, s.title]));
    const showIds = (myShows || []).map(s => s.id);
    const showIdsSafe = showIds.length ? showIds : ['00000000-0000-0000-0000-000000000000'];

    const queries = await Promise.all([
      supabase.from('show_tips').select('id, coins_spent, message, created_at, show_id, sender:profiles!sender_id(full_name, avatar_url)')
        .eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('show_gifts').select('id, coins_spent, gift_type, created_at, show_id, sender:profiles!sender_id(full_name, avatar_url)')
        .eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('show_tickets').select('id, creator_earnings, purchased_at, show_id, buyer:profiles!buyer_id(full_name, avatar_url)')
        .in('show_id', showIdsSafe).order('purchased_at', { ascending: false }).limit(limit),
      supabase.from('profile_tips').select('id, amount_coins, message, created_at, sender:profiles!sender_id(full_name, avatar_url)')
        .eq('recipient_id', creatorId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('content_purchases').select('id, creator_earnings, created_at, buyer:profiles!buyer_id(full_name, avatar_url)')
        .eq('seller_id', creatorId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('video_requests').select('id, price, completed_at, requester:profiles!requester_id(full_name, avatar_url)')
        .eq('creator_id', creatorId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(limit),
    ]);

    const safe = (i) => Array.isArray(queries[i].data) ? queries[i].data : [];

    // Conversión consistente con coinController
    const fromCoins = (c) => parseFloat((parseFloat(c || 0) * COIN_VALUE_USD * CREATOR_CUT).toFixed(2));

    const feed = [
      ...safe(0).map(r => ({
        id: 't_' + r.id, type: 'show_tip',
        title: 'Propina en show',
        subtitle: showMap[r.show_id] || 'Show',
        message: r.message,
        from: r.sender,
        coins: r.coins_spent,
        usd: fromCoins(r.coins_spent),
        at: r.created_at,
      })),
      ...safe(1).map(r => ({
        id: 'g_' + r.id, type: 'show_gift',
        title: 'Regalo en show',
        subtitle: showMap[r.show_id] || 'Show',
        from: r.sender,
        coins: r.coins_spent,
        usd: fromCoins(r.coins_spent),
        at: r.created_at,
      })),
      ...safe(2).map(r => ({
        id: 'k_' + r.id, type: 'show_ticket',
        title: 'Ticket de show',
        subtitle: showMap[r.show_id] || 'Show',
        from: r.buyer,
        usd: parseFloat(r.creator_earnings || 0),
        at: r.purchased_at,
      })),
      ...safe(3).map(r => ({
        id: 'p_' + r.id, type: 'profile_tip',
        title: 'Propina de perfil',
        message: r.message,
        from: r.sender,
        coins: r.amount_coins,
        usd: fromCoins(r.amount_coins),
        at: r.created_at,
      })),
      ...safe(4).map(r => ({
        id: 'c_' + r.id, type: 'content_sale',
        title: 'Venta de contenido',
        from: r.buyer,
        usd: parseFloat(r.creator_earnings || 0),
        at: r.created_at,
      })),
      ...safe(5).map(r => ({
        id: 'v_' + r.id, type: 'video_request',
        title: 'Encargo de video',
        from: r.requester,
        coins: r.price,
        usd: fromCoins(r.price),
        at: r.completed_at,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);

    res.json({ items: feed });
  } catch (err) {
    console.error('getIncomeFeed error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/sync-earnings — reconstruye creator_earnings desde las fuentes
// Útil para corregir balances que quedaron desincronizados (RPC fallido, etc).
// Suma TODO el histórico, no solo 30 días. NO toca total_paid_out ni pending_balance.
export const syncEarnings = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { data: profile } = await supabase
      .from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    const { data: myShows } = await supabase
      .from('live_shows').select('id').eq('host_id', creatorId);
    const showIds = (myShows || []).map(s => s.id);
    const showIdsSafe = showIds.length ? showIds : ['00000000-0000-0000-0000-000000000000'];

    const queries = await Promise.all([
      supabase.from('show_tickets').select('creator_earnings').in('show_id', showIdsSafe),
      supabase.from('show_tips').select('creator_earnings').eq('creator_id', creatorId),
      supabase.from('show_gifts').select('coins_spent').eq('creator_id', creatorId),
      supabase.from('content_purchases').select('creator_earnings').eq('seller_id', creatorId),
      supabase.from('video_requests').select('price').eq('creator_id', creatorId).eq('status', 'completed'),
      supabase.from('creator_subscriptions').select('subscription_price').eq('creator_id', creatorId),
      supabase.from('gallery_purchases').select('coins_paid').eq('creator_id', creatorId),
      supabase.from('creator_earnings').select('total_paid_out, pending_balance').eq('creator_id', creatorId).maybeSingle(),
    ]);
    const safe = (i) => Array.isArray(queries[i].data) ? queries[i].data : [];

    const sumUsd  = (rows) => rows.reduce((s, r) => s + parseFloat(r.creator_earnings || 0), 0);
    const fromCoins = (c)  => parseFloat(c || 0) * COIN_VALUE_USD * CREATOR_CUT;

    const ticketsUsd  = sumUsd(safe(0));
    const tipsUsd     = sumUsd(safe(1));
    const giftsUsd    = safe(2).reduce((s, r) => s + fromCoins(r.coins_spent), 0);
    const photosUsd   = sumUsd(safe(3));
    const requestsUsd = safe(4).reduce((s, r) => s + fromCoins(r.price), 0);
    const subsUsd     = safe(5).reduce((s, r) => s + parseFloat(r.subscription_price || 0) * CREATOR_CUT, 0);
    const galleryUsd  = safe(6).reduce((s, r) => s + fromCoins(r.coins_paid), 0);

    const totalEarned = ticketsUsd + tipsUsd + giftsUsd + photosUsd + requestsUsd + subsUsd + galleryUsd;
    const existing    = queries[7].data;
    const paidOut     = parseFloat(existing?.total_paid_out || 0);
    const pending     = parseFloat(existing?.pending_balance || 0);
    const available   = Math.max(0, totalEarned - paidOut - pending);

    const payload = {
      creator_id:        creatorId,
      total_earned:      parseFloat(totalEarned.toFixed(2)),
      available_balance: parseFloat(available.toFixed(2)),
      pending_balance:   pending,
      total_paid_out:    paidOut,
      updated_at:        new Date().toISOString(),
    };

    if (existing) {
      await supabase.from('creator_earnings').update(payload).eq('creator_id', creatorId);
    } else {
      await supabase.from('creator_earnings').insert(payload);
    }

    res.json({
      ok: true,
      total_earned:      payload.total_earned,
      available_balance: payload.available_balance,
      breakdown: {
        show_tickets: parseFloat(ticketsUsd.toFixed(2)),
        show_tips:    parseFloat(tipsUsd.toFixed(2)),
        show_gifts:   parseFloat(giftsUsd.toFixed(2)),
        photo_sales:  parseFloat(photosUsd.toFixed(2)),
        video_requests: parseFloat(requestsUsd.toFixed(2)),
        subscriptions:  parseFloat(subsUsd.toFixed(2)),
        gallery_sales:  parseFloat(galleryUsd.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('syncEarnings error:', err.message);
    res.status(500).json({ error: 'Error al sincronizar' });
  }
};

// PUT /api/creator/adult-mode — activar/desactivar modo creador adulto
export const toggleAdultMode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', userId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'Solo los creadores pueden activar este modo' });

    await supabase.from('profiles')
      .update({ is_adult_creator: !!enabled })
      .eq('id', userId);

    res.json({ success: true, is_adult_creator: !!enabled });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/post-analytics — rendimiento de mis posts
export const getPostAnalytics = async (req, res) => {
  try {
    const creatorId = req.user.id;

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, caption, media_url, media_type, likes_count, comments_count, is_subscribers_only, is_adult, created_at')
      .eq('user_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const result = (posts || []).map(p => {
      const engagement = (p.likes_count || 0) + (p.comments_count || 0);
      return { ...p, engagement };
    });

    const totalLikes    = result.reduce((s, p) => s + (p.likes_count || 0), 0);
    const totalComments = result.reduce((s, p) => s + (p.comments_count || 0), 0);
    const avgEngagement = result.length ? Math.round((totalLikes + totalComments) / result.length) : 0;

    res.json({ posts: result, summary: { total: result.length, totalLikes, totalComments, avgEngagement } });
  } catch (err) {
    console.error('getPostAnalytics error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/subscribers — list my active subscribers
export const getSubscribers = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    const { data, error } = await supabase
      .from('creator_subscriptions')
      .select(`
        id, status, subscription_price, current_period_end, created_at,
        subscriber:profiles!subscriber_id(id, full_name, avatar_url, is_verified)
      `)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalRevenue = (data || []).reduce((s, sub) => s + parseFloat(sub.subscription_price || 0), 0);
    res.json({ subscribers: data || [], count: (data || []).length, total_revenue: parseFloat(totalRevenue.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/discover — authenticated list of adult creators (age gate enforced)
export const discoverAdultCreators = async (req, res) => {
  try {
    // Age gate: requiere auth (garantizado por authMiddleware en la ruta)
    const requesterId = req.user.id;
    const { data: requester } = await supabase
      .from('profiles')
      .select('age, is_adult_creator')
      .eq('id', requesterId)
      .single();
    if (!requester?.is_adult_creator && (requester?.age === null || requester?.age === undefined || requester.age < 18)) {
      return res.status(403).json({ error: 'Debes ser mayor de 18 años para acceder a este contenido.', code: 'AGE_REQUIRED' });
    }

    const q          = req.query.q?.trim();
    const gender     = req.query.gender;   // 'male' | 'female' | 'other'
    const country    = req.query.country;  // country code / name
    const onlineOnly = req.query.online === 'true';
    const sort       = req.query.sort || 'new'; // 'new' | 'popular'
    const page       = Math.max(0, parseInt(req.query.page) || 0);
    const limit      = 24;
    // Categorías: viene como "slug1,slug2,slug3" — todas deben matchear (AND)
    const categorySlugs = (req.query.categories || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    // Fetch live shows first so we can surface live creators at top
    const { data: liveShows } = await supabase
      .from('live_shows')
      .select('host_id, id, title, channel_name, cover_url')
      .eq('status', 'live');
    const liveMap = {};
    (liveShows || []).forEach(s => { liveMap[s.host_id] = s; });

    // Si vienen categorías, pre-filtrar IDs que las tengan TODAS (AND)
    let categoryFilteredIds = null;
    if (categorySlugs.length > 0) {
      const { data: cats } = await supabase
        .from('adult_categories')
        .select('id, slug')
        .in('slug', categorySlugs)
        .eq('is_active', true);
      const catIds = (cats || []).map(c => c.id);
      if (catIds.length === 0) {
        return res.json({ creators: [], hasMore: false });
      }
      // Para AND: contamos cuántas categorías tiene cada creator de las pedidas.
      // Solo los que tengan todas pasan.
      const { data: relations } = await supabase
        .from('creator_adult_categories')
        .select('creator_id, category_id')
        .in('category_id', catIds);
      const countByCreator = {};
      (relations || []).forEach(r => {
        countByCreator[r.creator_id] = (countByCreator[r.creator_id] || 0) + 1;
      });
      categoryFilteredIds = Object.entries(countByCreator)
        .filter(([, n]) => n === catIds.length)
        .map(([id]) => id);
      if (categoryFilteredIds.length === 0) {
        return res.json({ creators: [], hasMore: false });
      }
    }

    let query = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified, creator_bio, creator_subscription_price, created_at, gender, country, last_active')
      .eq('is_creator', true)
      .eq('is_adult_creator', true)
      .or('is_incognito.is.null,is_incognito.eq.false')
      .range(page * limit, (page + 1) * limit - 1);

    query = query.order('created_at', { ascending: false });

    if (categoryFilteredIds) query = query.in('id', categoryFilteredIds);
    if (q)          query = query.ilike('full_name', `%${q}%`);
    if (gender)     query = query.eq('gender', gender);
    if (country)    query = query.eq('country', country);
    if (onlineOnly) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      query = query.gte('last_active', fiveMinAgo);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Attach subscriber counts
    const ids = (data || []).map(c => c.id);
    let subMap = {};
    if (ids.length > 0) {
      const { data: counts } = await supabase
        .from('creator_subscriptions')
        .select('creator_id')
        .in('creator_id', ids)
        .eq('status', 'active');
      (counts || []).forEach(r => { subMap[r.creator_id] = (subMap[r.creator_id] || 0) + 1; });
    }

    let result = (data || []).map(c => ({
      ...c,
      subscribers_count: subMap[c.id] || 0,
      is_live: !!liveMap[c.id],
      live_show: liveMap[c.id] || null,
    }));
    if (sort === 'popular') result.sort((a, b) => b.subscribers_count - a.subscribers_count);

    // Live creators always first (within their sort group)
    result.sort((a, b) => (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0));

    res.json({ creators: result, hasMore: result.length === limit });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/:userId/galleries — galleries of a creator (with lock status)
export const getCreatorGalleries = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.id;

    const { data: galleries, error } = await supabase
      .from('creator_galleries')
      .select('id, title, description, price_coins, cover_url, items_count, created_at')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let purchasedSet = new Set();
    if (viewerId && galleries?.length) {
      const galleryIds = galleries.map(g => g.id);
      const { data: purchases } = await supabase
        .from('gallery_purchases')
        .select('gallery_id')
        .eq('buyer_id', viewerId)
        .in('gallery_id', galleryIds);
      purchasedSet = new Set((purchases || []).map(p => p.gallery_id));
    }

    const result = (galleries || []).map(g => {
      const isOwn = viewerId === userId;
      const unlocked = isOwn || purchasedSet.has(g.id);
      return { ...g, unlocked };
    });

    res.json({ galleries: result });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/galleries/:id/items — items of a gallery (gated)
export const getGalleryItems = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.id;

    const { data: gallery } = await supabase
      .from('creator_galleries')
      .select('creator_id, price_coins')
      .eq('id', id)
      .single();

    if (!gallery) return res.status(404).json({ error: 'Galería no encontrada' });

    const isOwn = viewerId === gallery.creator_id;
    if (!isOwn && gallery.price_coins > 0) {
      const { data: purchase } = await supabase
        .from('gallery_purchases')
        .select('id')
        .eq('gallery_id', id)
        .eq('buyer_id', viewerId)
        .single();

      if (!purchase) return res.status(403).json({ error: 'Galería bloqueada', code: 'GALLERY_LOCKED' });
    }

    const { data: items, error } = await supabase
      .from('gallery_items')
      .select('id, url, type, created_at')
      .eq('gallery_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    const mapped = (items || []).map(i => ({ ...i, media_url: i.url, media_type: i.type }));
    res.json({ items: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/galleries — create gallery
export const createGallery = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { title, description, price_coins } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'Solo los creadores pueden crear galerías' });

    if (!title?.trim()) return res.status(400).json({ error: 'El título es requerido' });

    const price = Math.max(0, parseInt(price_coins) || 0);

    let coverUrl = null;
    if (req.file) {
      const ext = req.file.mimetype.includes('webp') ? 'webp' : 'jpg';
      const path = `galleries/${creatorId}/covers/${Date.now()}.${ext}`;
      coverUrl = await uploadFile(path, req.file.buffer, req.file.mimetype);
    }

    const { data: gallery, error } = await supabase
      .from('creator_galleries')
      .insert({ creator_id: creatorId, title: title.trim(), description: description?.trim() || null, price_coins: price, cover_url: coverUrl })
      .select()
      .single();

    if (error) throw error;
    res.json({ gallery });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/galleries/:id/items — add item to gallery
export const addGalleryItem = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { id: galleryId } = req.params;

    const { data: gallery } = await supabase
      .from('creator_galleries')
      .select('creator_id, items_count, cover_url')
      .eq('id', galleryId)
      .single();

    if (!gallery) return res.status(404).json({ error: 'Galería no encontrada' });
    if (gallery.creator_id !== creatorId) return res.status(403).json({ error: 'Sin permiso' });
    if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const ext = isVideo ? 'mp4' : req.file.mimetype.includes('webp') ? 'webp' : 'jpg';
    const path = `galleries/${creatorId}/${galleryId}/${Date.now()}.${ext}`;

    const mediaUrl = await uploadFile(path, req.file.buffer, req.file.mimetype);

    const { data: item, error } = await supabase
      .from('gallery_items')
      .insert({
        gallery_id: galleryId,
        url: mediaUrl,
        type: isVideo ? 'video' : 'photo',
      })
      .select('id, url, type, created_at')
      .single();

    if (error) throw error;

    await supabase.from('creator_galleries')
      .update({ items_count: (gallery.items_count || 0) + 1, cover_url: gallery.cover_url || mediaUrl })
      .eq('id', galleryId);

    res.json({ item: { ...item, media_url: item.url, media_type: item.type } });
  } catch (err) {
    console.error('addGalleryItem error:', err?.message, err?.code, err?.details);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/creator/galleries/:id — delete gallery
export const deleteGallery = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { id: galleryId } = req.params;

    const { data: gallery } = await supabase
      .from('creator_galleries').select('creator_id').eq('id', galleryId).single();

    if (!gallery) return res.status(404).json({ error: 'Galería no encontrada' });
    if (gallery.creator_id !== creatorId) return res.status(403).json({ error: 'Sin permiso' });

    await supabase.from('creator_galleries').delete().eq('id', galleryId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/galleries/:id/unlock — unlock gallery with coins
export const unlockGallery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: galleryId } = req.params;

    const { data: gallery } = await supabase
      .from('creator_galleries')
      .select('creator_id, price_coins, title')
      .eq('id', galleryId)
      .single();

    if (!gallery) return res.status(404).json({ error: 'Galería no encontrada' });
    if (gallery.creator_id === userId) return res.status(400).json({ error: 'Eres el creador de esta galería' });

    const { data: existing } = await supabase
      .from('gallery_purchases')
      .select('id').eq('gallery_id', galleryId).eq('buyer_id', userId).single();
    if (existing) return res.status(400).json({ error: 'Ya tienes acceso a esta galería' });

    // Deduct coins
    const { data: deducted } = await supabase.rpc('spend_coins', {
      p_user_id: userId,
      p_amount: gallery.price_coins,
      p_description: `Galería: ${gallery.title}`,
    });
    if (!deducted) return res.status(400).json({ error: 'Monedas insuficientes', code: 'INSUFFICIENT_COINS' });

    await supabase.from('gallery_purchases').insert({ gallery_id: galleryId, buyer_id: userId, amount_coins: gallery.price_coins });

    // Credit creator earnings
    const earningsUSD = gallery.price_coins * COIN_VALUE_USD * CREATOR_CUT;
    await supabase.from('creator_earnings')
      .select('total_earned, available_balance').eq('creator_id', gallery.creator_id).single()
      .then(({ data: e }) => {
        if (e) {
          supabase.from('creator_earnings').update({
            total_earned: parseFloat(e.total_earned || 0) + earningsUSD,
            available_balance: parseFloat(e.available_balance || 0) + earningsUSD,
          }).eq('creator_id', gallery.creator_id);
        }
      });

    const { data: newBal } = await supabase.from('profiles').select('coins_balance').eq('id', userId).single();
    res.json({ success: true, coins_remaining: newBal?.coins_balance ?? 0 });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/creator/galleries/:galleryId/items/:itemId — delete one item from gallery
export const deleteGalleryItem = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { galleryId, itemId } = req.params;

    const { data: gallery } = await supabase
      .from('creator_galleries').select('creator_id, items_count').eq('id', galleryId).single();
    if (!gallery) return res.status(404).json({ error: 'Galería no encontrada' });
    if (gallery.creator_id !== creatorId) return res.status(403).json({ error: 'Sin permiso' });

    const { error } = await supabase.from('gallery_items').delete().eq('id', itemId).eq('gallery_id', galleryId);
    if (error) throw error;

    await supabase.from('creator_galleries')
      .update({ items_count: Math.max(0, (gallery.items_count || 1) - 1) })
      .eq('id', galleryId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/subscribers/broadcast — mass message a suscriptores activos
// Body: { message, is_paid?, price_coins?, target? }
//   target: 'subscribers' (default) | 'all_matches' (todos los que pueden hablarte)
//   is_paid + price_coins: convierte el broadcast en PPV — los receptores deben
//   pagar para verlo (el mensaje aparece en su chat como bloqueado)
export const sendBroadcast = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { message, is_paid, price_coins, target = 'subscribers' } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator, full_name').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });
    if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });
    if (message.length > 1000) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 1000)' });

    const ppvPrice = is_paid ? parseInt(price_coins) : 0;
    if (is_paid && (!ppvPrice || ppvPrice < 1 || ppvPrice > 9999)) {
      return res.status(400).json({ error: 'Precio PPV inválido (1-9999 coins)' });
    }

    // Resolver lista de destinatarios
    let recipients = [];
    if (target === 'all_matches') {
      // Usuarios con quien tengo match (puedes hablarles)
      const { data: matches } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${creatorId},user2_id.eq.${creatorId}`)
        .eq('is_match', true);
      recipients = [...new Set((matches || []).map(m =>
        m.user1_id === creatorId ? m.user2_id : m.user1_id
      ))];
    } else {
      const { data: subs } = await supabase
        .from('creator_subscriptions')
        .select('subscriber_id')
        .eq('creator_id', creatorId)
        .eq('status', 'active');
      recipients = (subs || []).map(s => s.subscriber_id);
    }

    if (!recipients.length) return res.json({ sent: 0 });

    // Generar batch ID para asociar todos los mensajes del blast
    const batchId = (await import('crypto')).default.randomUUID();

    // Crear mensaje en chat de cada destinatario (si tiene match con el creator).
    // Si es PPV, marcar como is_paid hasta que paguen.
    const matchRows = await supabase
      .from('matches')
      .select('id, user1_id, user2_id')
      .or(`user1_id.eq.${creatorId},user2_id.eq.${creatorId}`)
      .eq('is_match', true);
    const matchMap = new Map();
    (matchRows.data || []).forEach(m => {
      const other = m.user1_id === creatorId ? m.user2_id : m.user1_id;
      matchMap.set(other, m.id);
    });

    const rowsToInsert = [];
    for (const recipientId of recipients) {
      const matchId = matchMap.get(recipientId);
      if (!matchId) continue; // sin match no podemos crearle un mensaje
      rowsToInsert.push({
        match_id: matchId,
        sender_id: creatorId,
        receiver_id: recipientId,
        content: message.trim(),
        type: 'text',
        is_paid: !!is_paid,
        price: ppvPrice || null,
        is_broadcast: true,
        broadcast_batch_id: batchId,
      });
    }

    let createdCount = 0;
    if (rowsToInsert.length) {
      const { count } = await supabase.from('messages').insert(rowsToInsert, { count: 'exact' });
      createdCount = count || rowsToInsert.length;
    }

    // Notificaciones in-app + push (siempre, aunque sea PPV — saben que hay mensaje)
    const { createNotification } = await import('./inAppNotifController.js');
    const { sendPushToUser } = await import('./notificationController.js');
    const title = is_paid ? `💎 ${profile.full_name} envió contenido premium` : `📢 ${profile.full_name}`;
    const body = is_paid ? `Desbloquéalo por ${ppvPrice} coins` : message.trim();

    // Batch en 100 recipients con 100ms delay para no tumbar Resend/FCM
    await processBatched(recipients, 100, async (uid) => {
      await Promise.allSettled([
        createNotification(uid, 'broadcast', title, body, { creator_id: creatorId, ppv: !!is_paid }),
        sendPushToUser(uid, { title, body, url: '/messages' }).catch(() => {}),
      ]);
    }, 100);

    res.json({
      sent: recipients.length,
      messages_created: createdCount,
      is_paid: !!is_paid,
      price_coins: ppvPrice || null,
      batch_id: batchId,
    });
  } catch (err) {
    console.error('sendBroadcast error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/creator/subscribers/blast-email — mass EMAIL a suscriptores activos
// Body: { subject, body_html }
// Respeta email_prefs.creator_blast del suscriptor.
export const sendBlastEmail = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { subject, body_html } = req.body;

    const { data: profile } = await supabase.from('profiles')
      .select('is_creator, full_name').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });
    if (!subject?.trim()) return res.status(400).json({ error: 'Asunto requerido' });
    if (!body_html?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });
    if (body_html.length > 20000) return res.status(400).json({ error: 'Mensaje demasiado largo' });

    // Throttle: 1 blast por hora por creador
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabase.from('creator_blasts')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).gte('created_at', oneHourAgo);
    if ((recent || 0) >= 1) {
      return res.status(429).json({ error: 'Solo puedes enviar 1 blast por hora' });
    }

    const { data: subs } = await supabase
      .from('creator_subscriptions')
      .select('subscriber_id, subscriber:profiles!subscriber_id(id, full_name, email_prefs)')
      .eq('creator_id', creatorId).eq('status', 'active');

    if (!subs?.length) return res.json({ sent: 0 });

    // Crear log
    const { data: blast } = await supabase.from('creator_blasts').insert({
      creator_id: creatorId, subject: subject.trim().substring(0, 200),
      body_html, recipients_count: subs.length,
    }).select('id').single();

    // Sanitización mínima del HTML: solo permitir tags básicos
    const safeHtml = String(body_html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');

    // Enviar emails en batches de 20 con 200ms delay (Resend rate limit-aware)
    const { sendCreatorBlastEmail } = await import('../lib/emailService.js');
    let sent = 0;
    await processBatched(subs, 20, async (sub) => {
      const prefs = sub.subscriber?.email_prefs || {};
      if (prefs.creator_blast === false) return;
      const { data: authUser } = await supabase.auth.admin.getUserById(sub.subscriber_id).catch(() => ({ data: null }));
      const email = authUser?.user?.email;
      if (!email) return;
      try {
        await sendCreatorBlastEmail(
          email,
          sub.subscriber?.full_name || 'Suscriptor',
          profile.full_name,
          subject.trim(),
          safeHtml
        );
        sent++;
      } catch { /* skip individual failures */ }
    }, 200);

    await supabase.from('creator_blasts').update({
      sent_count: sent, completed_at: new Date().toISOString(),
    }).eq('id', blast.id);

    res.json({ sent, total: subs.length });
  } catch (err) {
    console.error('sendBlastEmail error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/analytics/export — CSV export of analytics
export const exportAnalyticsCsv = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    // IDs de mis shows
    const { data: myShows } = await supabase.from('live_shows').select('id, title').eq('host_id', creatorId);
    const showMap = Object.fromEntries((myShows || []).map(s => [s.id, s.title]));
    const showIds = (myShows || []).map(s => s.id);
    const showIdsSafe = showIds.length ? showIds : ['00000000-0000-0000-0000-000000000000'];

    const queries = await Promise.all([
      supabase.from('show_tickets').select('creator_earnings, purchased_at, show_id, buyer:profiles!buyer_id(full_name)').in('show_id', showIdsSafe),
      supabase.from('show_tips').select('creator_earnings, coins_spent, message, created_at, show_id, sender:profiles!sender_id(full_name)').eq('creator_id', creatorId),
      supabase.from('show_gifts').select('coins_spent, gift_type, created_at, show_id, sender:profiles!sender_id(full_name)').eq('creator_id', creatorId),
      supabase.from('content_purchases').select('creator_earnings, coins_paid, created_at, buyer:profiles!buyer_id(full_name)').eq('seller_id', creatorId),
      supabase.from('video_requests').select('price, completed_at, requester:profiles!requester_id(full_name)').eq('creator_id', creatorId).eq('status', 'completed'),
      supabase.from('creator_subscriptions').select('subscriber:profiles!subscriber_id(full_name), subscription_price, status, created_at, current_period_end').eq('creator_id', creatorId),
    ]);
    const safe = (i) => Array.isArray(queries[i].data) ? queries[i].data : [];

    const fromCoins = (c) => parseFloat(parseFloat(c || 0) * COIN_VALUE_USD * CREATOR_CUT).toFixed(2);

    // Hoja unificada de transacciones
    const txRows = [['Fecha', 'Tipo', 'De', 'Show', 'Coins', 'USD (70%)', 'Mensaje']];
    safe(0).forEach(r => txRows.push([
      r.purchased_at ? new Date(r.purchased_at).toLocaleString('es') : '',
      'Ticket de show', r.buyer?.full_name || '', showMap[r.show_id] || '', '', parseFloat(r.creator_earnings || 0).toFixed(2), '',
    ]));
    safe(1).forEach(r => txRows.push([
      r.created_at ? new Date(r.created_at).toLocaleString('es') : '',
      'Propina en show', r.sender?.full_name || '', showMap[r.show_id] || '', r.coins_spent || '', parseFloat(r.creator_earnings || 0).toFixed(2), r.message || '',
    ]));
    safe(2).forEach(r => txRows.push([
      r.created_at ? new Date(r.created_at).toLocaleString('es') : '',
      `Regalo: ${r.gift_type || ''}`, r.sender?.full_name || '', showMap[r.show_id] || '', r.coins_spent || '', fromCoins(r.coins_spent), '',
    ]));
    safe(3).forEach(r => txRows.push([
      r.created_at ? new Date(r.created_at).toLocaleString('es') : '',
      'Venta de contenido', r.buyer?.full_name || '', '', r.coins_paid || '', parseFloat(r.creator_earnings || 0).toFixed(2), '',
    ]));
    safe(4).forEach(r => txRows.push([
      r.completed_at ? new Date(r.completed_at).toLocaleString('es') : '',
      'Encargo de video', r.requester?.full_name || '', '', r.price || '', fromCoins(r.price), '',
    ]));
    safe(5).forEach(r => txRows.push([
      r.created_at ? new Date(r.created_at).toLocaleString('es') : '',
      `Suscripción (${r.status})`, r.subscriber?.full_name || '', '', '', (parseFloat(r.subscription_price || 0) * CREATOR_CUT).toFixed(2), '',
    ]));

    // Ordenar por fecha desc
    const header = txRows[0];
    const dataRows = txRows.slice(1).sort((a, b) => new Date(b[0]) - new Date(a[0]));
    const allRows = [header, ...dataRows];

    const csv = allRows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ingresos-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + csv); // BOM for Excel
  } catch (err) {
    console.error('exportAnalyticsCsv error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/:userId/profile — perfil público de un creador
// Consolida shows, paid_photos, subscriber count, post count, tiers
// (con legacy_price) y my_subscription (si hay user logueado) en una sola
// respuesta para evitar 4+ round-trips desde el frontend.
export const getPublicCreatorProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    // El header Authorization es opcional aquí: si está, intentamos resolver
    // viewerId para devolver my_subscription.
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const { data } = await supabase.auth.getUser(token);
        viewerId = data?.user?.id || null;
      } catch { /* ignore — endpoint público */ }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified, creator_bio, is_creator, creator_subscription_price')
      .eq('id', userId)
      .eq('is_creator', true)
      .single();

    if (!profile) return res.status(404).json({ error: 'Creador no encontrado' });

    // Si hay viewer y NO es el propio creador, traer su suscripción al mismo
    // pull. Cuesta 1 query extra pero ahorra 1 round-trip desde frontend.
    const mySubPromise = (viewerId && viewerId !== userId)
      ? supabase
          .from('creator_subscriptions')
          .select(`
            id, status, current_period_end, is_gift, gifted_by, gift_message,
            subscription_price, created_at, auto_renew,
            tier:tier_id (id, tier_level, name, badge_emoji, badge_color, perks, description)
          `)
          .eq('subscriber_id', viewerId)
          .eq('creator_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null });

    const [showsRes, photosRes, subsRes, postsRes, tiersRes, mySubRes] = await Promise.all([
      supabase
        .from('live_shows')
        .select('id, title, show_type, ticket_price, status, scheduled_at, cover_url')
        .eq('host_id', userId)
        .in('status', ['scheduled', 'live'])
        .order('scheduled_at', { ascending: true })
        .limit(5),
      supabase
        .from('profile_photos')
        .select('id, url, price, is_paid')
        .eq('user_id', userId)
        .eq('is_paid', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('creator_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', userId)
        .eq('status', 'active'),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('creator_tiers')
        .select('id, tier_level, name, price, badge_color, badge_emoji, perks, description')
        .eq('creator_id', userId)
        .eq('is_active', true)
        .order('tier_level', { ascending: true }),
      mySubPromise,
    ]);

    res.json({
      profile,
      shows: showsRes.data || [],
      paid_photos: photosRes.data || [],
      subscribers_count: subsRes.count || 0,
      posts_count: postsRes.count || 0,
      tiers: tiersRes.data || [],
      legacy_price: profile.creator_subscription_price
        ? parseFloat(profile.creator_subscription_price)
        : null,
      my_subscription: mySubRes?.data || null,
    });
  } catch (err) {
    console.error('getPublicCreatorProfile error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


// GET /api/creator/story-analytics — vistas de mis stories
export const getStoryAnalytics = async (req, res) => {
  try {
    const creatorId = req.user.id;

    const { data: stories } = await supabase
      .from('stories')
      .select('id, media_url, media_type, created_at')
      .eq('user_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!stories?.length) return res.json({ stories: [] });

    const storyIds = stories.map(s => s.id);
    const { data: views } = await supabase
      .from('story_views')
      .select('story_id')
      .in('story_id', storyIds);

    const viewCounts = {};
    (views || []).forEach(v => { viewCounts[v.story_id] = (viewCounts[v.story_id] || 0) + 1; });

    res.json({ stories: stories.map(s => ({ ...s, views_count: viewCounts[s.id] || 0 })) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
