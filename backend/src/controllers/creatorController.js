import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { upsertCreatorEarnings } from './showController.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

const BUCKET = 'DESTINO';
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

const PLATFORM_FEE_RATE = 0.30;
const MIN_PAYOUT = 10; // mínimo $10 para retirar

const stripeNotConfigured = (res) =>
  res.status(503).json({ error: 'Pagos no configurados aún', code: 'STRIPE_NOT_CONFIGURED' });

// POST /api/creator/register — activar cuenta de creador
export const becomeCreator = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[becomeCreator] userId:', userId);

    // Paso 1: activar is_creator en profiles
    const { data: updated, error: updateErr } = await supabase
      .from('profiles')
      .update({ is_creator: true })
      .eq('id', userId)
      .select('id, is_creator');

    console.log('[becomeCreator] update result:', { updated, updateErr });
    if (updateErr) {
      return res.status(500).json({ error: `Error actualizando perfil: ${updateErr.message}` });
    }

    // Paso 2: crear fila de earnings (no crítico, ignorar error)
    const { error: earnErr } = await supabase
      .from('creator_earnings')
      .upsert(
        { creator_id: userId, total_earned: 0, available_balance: 0, pending_balance: 0, total_paid_out: 0 },
        { onConflict: 'creator_id', ignoreDuplicates: true }
      );
    if (earnErr) console.warn('[becomeCreator] creator_earnings upsert warning:', earnErr.message);

    res.json({ success: true });
  } catch (err) {
    console.error('[becomeCreator] catch:', err.message);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
};

// GET /api/creator/onboarding-link — URL de configuración de pagos en Stripe
export const getOnboardingLink = async (req, res) => {
  if (!stripe) return stripeNotConfigured(res);

  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, is_creator')
      .eq('id', userId)
      .single();

    if (!profile?.is_creator || !profile?.stripe_account_id) {
      return res.status(400).json({ error: 'Primero debes activar tu cuenta de creador' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
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
      .select('is_creator, stripe_account_id, stripe_account_status')
      .eq('id', creatorId)
      .single();

    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });
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
export const subscribeToCreator = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

  try {
    const { creatorId } = req.params;
    const subscriberId = req.user.id;

    if (creatorId === subscriberId) return res.status(400).json({ error: 'No puedes suscribirte a ti mismo' });

    const { data: creator } = await supabase
      .from('profiles')
      .select('creator_subscription_price, is_creator, full_name, stripe_account_id, stripe_account_status')
      .eq('id', creatorId)
      .single();

    if (!creator?.is_creator) return res.status(404).json({ error: 'Creador no encontrado' });
    if (!creator?.creator_subscription_price) return res.status(400).json({ error: 'Este creador no tiene suscripción activa' });

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

    // Crear Price dinámico o usar fixed — aquí usamos PaymentIntent por simplicidad de implementación
    const amountCents = Math.round(creator.creator_subscription_price * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const piParams = {
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        type: 'creator_subscription',
        creator_id: creatorId,
        subscriber_id: subscriberId,
      },
    };

    if (creator?.stripe_account_id && creator?.stripe_account_status === 'active') {
      piParams.application_fee_amount = platformFeeCents;
      piParams.transfer_data = { destination: creator.stripe_account_id };
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: creator.creator_subscription_price,
      creatorName: creator.full_name,
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

    await supabase.from('creator_subscriptions').upsert({
      subscriber_id: subscriberId,
      creator_id: creatorId,
      subscription_price: creator?.creator_subscription_price || amountPaid,
      status: 'active',
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'subscriber_id,creator_id' });

    await upsertCreatorEarnings(creatorId, earningsUSD);

    const { data: sub } = await supabase.from('profiles').select('full_name').eq('id', subscriberId).single();
    createNotification(creatorId, 'subscription', '¡Nuevo suscriptor!', `${sub?.full_name} se suscribió a tu contenido`, { subscriber_id: subscriberId });
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
export const cancelCreatorSubscription = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const subscriberId = req.user.id;

    await supabase
      .from('creator_subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId);

    res.json({ message: 'Suscripción cancelada' });
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
    (subsByDay || []).forEach(t => addToDay(t.created_at, t.subscription_price * 0.7));

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
        subscriptions: (subsByDay || []).reduce((s, t) => s + parseFloat(t.subscription_price) * 0.7, 0).toFixed(2),
      },
      subscribers: subscribers?.length || 0,
    });
  } catch (err) {
    console.error('getAnalytics error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
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

    // Fetch live shows first so we can surface live creators at top
    const { data: liveShows } = await supabase
      .from('live_shows')
      .select('host_id, id, title, channel_name, cover_url')
      .eq('status', 'live');
    const liveMap = {};
    (liveShows || []).forEach(s => { liveMap[s.host_id] = s; });

    let query = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified, creator_bio, creator_subscription_price, created_at, gender, country, last_active')
      .eq('is_creator', true)
      .eq('is_adult_creator', true)
      .or('is_incognito.is.null,is_incognito.eq.false')
      .range(page * limit, (page + 1) * limit - 1);

    query = query.order('created_at', { ascending: false });

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
      await supabase.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
      coverUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
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

    await supabase.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    const mediaUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

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
    const earningsUSD = gallery.price_coins * 0.05 * 0.7;
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

// POST /api/creator/subscribers/broadcast — mass message to all active subscribers
export const sendBroadcast = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { message } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator, full_name').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });
    if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });
    if (message.length > 500) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 500 caracteres)' });

    const { data: subs } = await supabase
      .from('creator_subscriptions')
      .select('subscriber_id')
      .eq('creator_id', creatorId)
      .eq('status', 'active');

    if (!subs?.length) return res.json({ sent: 0 });

    const { createNotification } = await import('./inAppNotifController.js');
    const { sendPushToUser } = await import('./notificationController.js');

    await Promise.allSettled((subs || []).map(sub =>
      Promise.all([
        createNotification(sub.subscriber_id, 'broadcast', `📢 ${profile.full_name}`, message.trim(), { creator_id: creatorId }),
        sendPushToUser(sub.subscriber_id, { title: `📢 ${profile.full_name}`, body: message.trim() }).catch(() => {}),
      ])
    ));

    res.json({ sent: subs.length });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/analytics/export — CSV export of analytics
export const exportAnalyticsCsv = async (req, res) => {
  try {
    const creatorId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', creatorId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'No eres creador' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: subs } = await supabase
      .from('creator_subscriptions')
      .select('subscriber:profiles!subscriber_id(full_name), subscription_price, created_at, current_period_end')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false });

    const rows = [['Suscriptor', 'Precio', 'Fecha inicio', 'Próxima renovación']];
    (subs || []).forEach(s => {
      rows.push([
        s.subscriber?.full_name || '',
        s.subscription_price || 0,
        s.created_at ? new Date(s.created_at).toLocaleDateString('es') : '',
        s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('es') : '',
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    res.send('﻿' + csv); // BOM for Excel
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/creator/:userId/profile — perfil público de un creador
export const getPublicCreatorProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified, creator_bio, is_creator')
      .eq('id', userId)
      .eq('is_creator', true)
      .single();

    if (!profile) return res.status(404).json({ error: 'Creador no encontrado' });

    // Shows del creador
    const { data: shows } = await supabase
      .from('live_shows')
      .select('id, title, show_type, ticket_price, status, scheduled_at, cover_url')
      .eq('host_id', userId)
      .in('status', ['scheduled', 'live'])
      .order('scheduled_at', { ascending: true })
      .limit(5);

    // Fotos de pago
    const { data: paidPhotos } = await supabase
      .from('profile_photos')
      .select('id, url, price, is_paid')
      .eq('user_id', userId)
      .eq('is_paid', true)
      .order('created_at', { ascending: false });

    res.json({ profile, shows: shows || [], paid_photos: paidPhotos || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
