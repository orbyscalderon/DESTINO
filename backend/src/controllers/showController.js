import { supabase } from '../lib/supabase.js';
import { stripe } from '../lib/stripe.js';
import { v4 as uuidv4 } from 'uuid';
import { spendCoins, addCoins, coinsToUSD, creatorCutUSD } from './coinController.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

const PLATFORM_FEE_RATE = 0.30;

const VALID_CATEGORIES = ['music', 'dance', 'comedy', 'chat', 'gaming', 'fitness', 'cooking', 'art', 'adult'];

// GET /api/shows — lista shows live y programados
export const listShows = async (req, res) => {
  try {
    const { type, status = 'live', category } = req.query;

    let query = supabase
      .from('live_shows')
      .select(`
        id, title, description, show_type, ticket_price, status,
        cover_url, scheduled_at, started_at, category,
        host:profiles!host_id(id, full_name, avatar_url, is_verified)
      `)
      .in('status', status === 'live' ? ['live'] : ['scheduled', 'live'])
      .order('started_at', { ascending: false, nullsFirst: false })
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (type && ['broadcast', 'private'].includes(type)) {
      query = query.eq('show_type', type);
    }

    if (category && VALID_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Agregar conteo de tickets vendidos (viewers)
    const showIds = (data || []).map(s => s.id);
    let ticketCounts = {};
    if (showIds.length > 0) {
      const { data: counts } = await supabase
        .from('show_tickets')
        .select('show_id')
        .in('show_id', showIds)
        .eq('status', 'active');

      (counts || []).forEach(t => {
        ticketCounts[t.show_id] = (ticketCounts[t.show_id] || 0) + 1;
      });
    }

    const shows = (data || [])
      .map(s => ({ ...s, viewer_count: ticketCounts[s.id] || 0 }))
      .sort((a, b) => {
        // Adult shows always last
        if (a.category === 'adult' && b.category !== 'adult') return 1;
        if (b.category === 'adult' && a.category !== 'adult') return -1;
        return b.viewer_count - a.viewer_count;
      });

    res.json({ shows });
  } catch (err) {
    console.error('listShows error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id — detalle de un show
export const getShow = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: show, error } = await supabase
      .from('live_shows')
      .select(`
        id, title, description, show_type, ticket_price, status,
        channel_name, cover_url, scheduled_at, started_at, ended_at, category,
        host:profiles!host_id(id, full_name, avatar_url, is_verified, creator_bio)
      `)
      .eq('id', id)
      .single();

    if (error || !show) return res.status(404).json({ error: 'Show no encontrado' });

    const isHost = show.host.id === userId;

    // ¿el usuario ya tiene ticket?
    let hasTicket = isHost;
    if (!isHost && show.ticket_price > 0) {
      const { data: ticket } = await supabase
        .from('show_tickets')
        .select('id')
        .eq('show_id', id)
        .eq('buyer_id', userId)
        .eq('status', 'active')
        .single();
      hasTicket = !!ticket;
    } else if (!isHost) {
      hasTicket = true; // show gratuito
    }

    // conteo de viewers
    const { count: viewerCount } = await supabase
      .from('show_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('show_id', id)
      .eq('status', 'active');

    res.json({ show: { ...show, is_host: isHost, has_ticket: hasTicket, viewer_count: viewerCount || 0 } });
  } catch (err) {
    console.error('getShow error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows — crear show
export const createShow = async (req, res) => {
  try {
    const hostId = req.user.id;
    const { title, description, show_type, ticket_price, cover_url, scheduled_at, category = 'chat', tip_goal } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    if (!['broadcast', 'private'].includes(show_type)) {
      return res.status(400).json({ error: 'show_type debe ser broadcast o private' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    const price = parseFloat(ticket_price) || 0;
    if (price < 0 || price > 9999) return res.status(400).json({ error: 'Precio inválido' });

    // Verificar que el usuario sea creador con cuenta de Stripe activa
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_creator, stripe_account_id, stripe_account_status, is_adult_creator')
      .eq('id', hostId)
      .single();

    if (!profile?.is_creator) {
      return res.status(403).json({ error: 'Debes activar tu cuenta de creador primero', code: 'NOT_CREATOR' });
    }

    if (category === 'adult' && !profile?.is_adult_creator) {
      return res.status(403).json({ error: 'Solo creadores adultos pueden crear shows en la categoría Adulto', code: 'ADULT_CREATOR_REQUIRED' });
    }

    if (price > 0 && profile?.stripe_account_status !== 'active') {
      return res.status(403).json({
        error: 'Debes completar la configuración de pagos para crear shows de pago',
        code: 'STRIPE_SETUP_REQUIRED',
      });
    }

    const { data: show, error } = await supabase
      .from('live_shows')
      .insert({
        host_id: hostId,
        title: title.trim(),
        description: description?.trim() || null,
        show_type,
        ticket_price: price,
        cover_url: cover_url || null,
        scheduled_at: scheduled_at || null,
        status: 'scheduled',
        category,
        tip_goal: tip_goal ? parseFloat(tip_goal) : null,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ show });
  } catch (err) {
    console.error('createShow error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/start — el host inicia el show
export const startShow = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, channel_name')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });
    if (show.status === 'ended') return res.status(400).json({ error: 'El show ya terminó' });

    const channelName = show.channel_name || `show_${id.replace(/-/g, '').substring(0, 20)}`;

    const { data: updated } = await supabase
      .from('live_shows')
      .update({ status: 'live', channel_name: channelName, started_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    res.json({ show: updated });

    // Notificar a suscriptores del creador — fire & forget
    try {
      const [{ data: subs }, { data: host }] = await Promise.all([
        supabase
          .from('creator_subscriptions')
          .select('subscriber_id')
          .eq('creator_id', hostId)
          .eq('status', 'active'),
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', hostId)
          .single(),
      ]);

      if (subs?.length > 0) {
        const pushPayload = {
          title: `🔴 ${host?.full_name || 'Un creador'} está en vivo`,
          body: (updated?.title) || 'Acaba de iniciar un show',
          icon: '/icon-192.png',
          data: { url: `/shows/${id}` },
        };
        subs.forEach(({ subscriber_id }) => {
          sendPushToUser(subscriber_id, pushPayload).catch(() => {});
          createNotification(subscriber_id, 'show_ticket', pushPayload.title, pushPayload.body, { show_id: id });
        });
      }
      // Notificar a usuarios con "Me interesa" en el show
      const { data: interested } = await supabase
        .from('show_interests')
        .select('user_id')
        .eq('show_id', id);

      if (interested?.length > 0) {
        const interestPush = {
          title: `🔴 Show comenzando ahora`,
          body: updated?.title || 'El show que marcaste como interesante está en vivo',
          icon: '/icon-192.png',
          data: { url: `/shows/${id}` },
        };
        interested.forEach(({ user_id }) => {
          if (user_id === hostId) return;
          sendPushToUser(user_id, interestPush).catch(() => {});
          createNotification(user_id, 'show_ticket', interestPush.title, interestPush.body, { show_id: id });
        });
      }
    } catch { /* No bloquear el inicio del show si falla */ }
  } catch (err) {
    console.error('startShow error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/end — el host termina el show
export const endShow = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    await supabase
      .from('live_shows')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ message: 'Show terminado' });
  } catch (err) {
    console.error('endShow error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/token — token Agora para viewers con ticket
export const getShowToken = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, channel_name, ticket_price, show_type')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.status !== 'live') return res.status(400).json({ error: 'El show no está en vivo' });

    const isHost = show.host_id === userId;

    if (!isHost) {
      // Para shows privados, verificar que solo hay un viewer
      if (show.show_type === 'private') {
        const { count } = await supabase
          .from('show_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('show_id', id)
          .eq('status', 'active');

        if ((count || 0) >= 1) {
          // Verificar que este usuario ES el viewer con ticket
          const { data: myTicket } = await supabase
            .from('show_tickets')
            .select('id')
            .eq('show_id', id)
            .eq('buyer_id', userId)
            .eq('status', 'active')
            .single();

          if (!myTicket) {
            return res.status(403).json({ error: 'Este show privado ya tiene un viewer activo', code: 'SHOW_FULL' });
          }
        }
      }

      // Verificar ticket si el show es de pago
      if (show.ticket_price > 0) {
        const { data: ticket } = await supabase
          .from('show_tickets')
          .select('id')
          .eq('show_id', id)
          .eq('buyer_id', userId)
          .eq('status', 'active')
          .single();

        if (!ticket) return res.status(403).json({ error: 'Necesitas un ticket para unirte', code: 'TICKET_REQUIRED' });
      }
    }

    const roomId = `show_${id.replace(/-/g, '')}`;
    res.json({ roomId, role: isHost ? 'host' : 'viewer' });
  } catch (err) {
    console.error('getShowToken error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/ticket — comprar ticket de un show
export const purchaseShowTicket = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

    const { id } = req.params;
    const buyerId = req.user.id;

    const { data: show } = await supabase
      .from('live_shows')
      .select(`
        id, title, ticket_price, status, show_type, host_id,
        host:profiles!host_id(stripe_account_id, stripe_account_status, full_name)
      `)
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.status === 'ended') return res.status(400).json({ error: 'El show ya terminó' });
    if (show.host_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propio show' });

    if (show.ticket_price <= 0) {
      return res.status(400).json({ error: 'Este show es gratuito, no necesita ticket' });
    }

    // Verificar si ya tiene ticket
    const { data: existing } = await supabase
      .from('show_tickets')
      .select('id')
      .eq('show_id', id)
      .eq('buyer_id', buyerId)
      .single();

    if (existing) return res.status(400).json({ error: 'Ya tienes un ticket para este show' });

    const amountCents = Math.round(show.ticket_price * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const paymentIntentParams = {
      amount: amountCents,
      currency: 'usd',
      metadata: {
        type: 'show_ticket',
        show_id: id,
        buyer_id: buyerId,
        seller_id: show.host_id,
      },
    };

    // Si el creador tiene Stripe Connect activo, usar destination charges
    if (show.host?.stripe_account_id && show.host?.stripe_account_status === 'active') {
      paymentIntentParams.application_fee_amount = platformFeeCents;
      paymentIntentParams.transfer_data = { destination: show.host.stripe_account_id };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: show.ticket_price,
      showTitle: show.title,
    });
  } catch (err) {
    console.error('purchaseShowTicket error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/ticket/confirm — confirmar ticket después de pago exitoso
export const confirmShowTicket = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Pagos no configurados' });

    const { id } = req.params;
    const { paymentIntentId } = req.body;
    const buyerId = req.user.id;

    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId requerido' });

    // Verificar estado del PaymentIntent en Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'El pago no se completó', code: 'PAYMENT_NOT_SUCCEEDED' });
    }

    // Validar que los metadata coincidan
    if (pi.metadata?.show_id !== id || pi.metadata?.buyer_id !== buyerId) {
      return res.status(403).json({ error: 'Datos de pago no coinciden' });
    }

    const amountPaid = pi.amount / 100;
    const platformFee = amountPaid * PLATFORM_FEE_RATE;
    const creatorEarnings = amountPaid - platformFee;
    const sellerId = pi.metadata.seller_id;

    // Idempotencia: no duplicar si ya existe
    const { data: existing } = await supabase
      .from('show_tickets')
      .select('id')
      .eq('show_id', id)
      .eq('buyer_id', buyerId)
      .single();

    if (!existing) {
      await supabase.from('show_tickets').insert({
        show_id: id,
        buyer_id: buyerId,
        amount_paid: amountPaid,
        creator_earnings: creatorEarnings,
        platform_fee: platformFee,
        stripe_payment_intent_id: paymentIntentId,
        status: 'active',
      });

      // Actualizar balance del creador
      await upsertCreatorEarnings(sellerId, creatorEarnings);
    }

    res.json({ success: true, message: 'Ticket confirmado' });
  } catch (err) {
    console.error('confirmShowTicket error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/my — shows creados por el usuario autenticado
export const getMyShows = async (req, res) => {
  try {
    const hostId = req.user.id;

    const { data: shows } = await supabase
      .from('live_shows')
      .select('*')
      .eq('host_id', hostId)
      .order('created_at', { ascending: false });

    // Agregar earnings por show
    const showIds = (shows || []).map(s => s.id);
    let earningsByShow = {};
    if (showIds.length > 0) {
      const { data: tickets } = await supabase
        .from('show_tickets')
        .select('show_id, creator_earnings')
        .in('show_id', showIds);

      (tickets || []).forEach(t => {
        earningsByShow[t.show_id] = (earningsByShow[t.show_id] || 0) + parseFloat(t.creator_earnings);
      });
    }

    res.json({
      shows: (shows || []).map(s => ({
        ...s,
        total_earnings: earningsByShow[s.id] || 0,
      })),
    });
  } catch (err) {
    console.error('getMyShows error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/tip — enviar propina con coins durante un show
export const sendTip = async (req, res) => {
  try {
    const { id } = req.params;
    const tipperId = req.user.id;
    const { coins, message } = req.body;

    const coinsAmount = parseInt(coins);
    if (!coinsAmount || coinsAmount < 1 || coinsAmount > 10000) {
      return res.status(400).json({ error: 'Cantidad de coins inválida' });
    }

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, title')
      .eq('id', id)
      .single();

    if (!show || show.status !== 'live') return res.status(400).json({ error: 'Show no está en vivo' });
    if (show.host_id === tipperId) return res.status(400).json({ error: 'No puedes darte propina a ti mismo' });

    // Gastar coins del tipper
    await spendCoins(tipperId, coinsAmount, 'tip_sent', id);

    const amountUSD = coinsToUSD(coinsAmount);
    const creatorEarnings = creatorCutUSD(coinsAmount);
    const platformFee = amountUSD - creatorEarnings;

    // Registrar tip
    await supabase.from('show_tips').insert({
      show_id: id,
      tipper_id: tipperId,
      creator_id: show.host_id,
      coins_spent: coinsAmount,
      amount_usd: amountUSD,
      creator_earnings: creatorEarnings,
      platform_fee: platformFee,
      message: message?.trim() || null,
    });

    // Acreditar coins (como ingresos) al creador
    await addCoins(show.host_id, Math.round(coinsAmount * 0.7), 'tip_received', id);
    await upsertCreatorEarnings(show.host_id, creatorEarnings);

    // Notificar al creador
    const { data: tipper } = await supabase
      .from('profiles').select('full_name').eq('id', tipperId).single();
    createNotification(
      show.host_id,
      'tip',
      `¡Nueva propina de ${tipper?.full_name}!`,
      `${coinsAmount} coins · ${message || show.title}`,
      { show_id: id, coins: coinsAmount }
    );
    sendPushToUser(show.host_id, {
      title: `¡Nueva propina de ${tipper?.full_name}!`,
      body: `${coinsAmount} coins`,
      url: `/shows/${id}`,
    }).catch(() => {});

    res.json({ success: true, coins_sent: coinsAmount });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'Saldo de coins insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    console.error('sendTip error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/gift — enviar regalo animado con coins
const GIFT_TYPES = {
  rose:    { coins: 10,  label: 'Rosa' },
  heart:   { coins: 50,  label: 'Corazón' },
  diamond: { coins: 200, label: 'Diamante' },
  crown:   { coins: 500, label: 'Corona' },
};

export const sendGift = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;
    const { gift_type } = req.body;

    const gift = GIFT_TYPES[gift_type];
    if (!gift) return res.status(400).json({ error: 'Tipo de regalo inválido' });

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, title')
      .eq('id', id)
      .single();

    if (!show || show.status !== 'live') return res.status(400).json({ error: 'Show no está en vivo' });
    if (show.host_id === senderId) return res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });

    await spendCoins(senderId, gift.coins, 'tip_sent', id);

    const amountUSD      = coinsToUSD(gift.coins);
    const creatorEarnings = creatorCutUSD(gift.coins);

    await supabase.from('show_gifts').insert({
      show_id:     id,
      sender_id:   senderId,
      creator_id:  show.host_id,
      gift_type,
      coins_spent: gift.coins,
    });

    await addCoins(show.host_id, Math.round(gift.coins * 0.7), 'tip_received', id);
    await upsertCreatorEarnings(show.host_id, creatorEarnings);

    const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', senderId).single();
    createNotification(show.host_id, 'tip', `¡${sender?.full_name} te envió un regalo!`, `${gift.label} · ${gift.coins} coins`, { show_id: id });
    sendPushToUser(show.host_id, {
      title: `¡${sender?.full_name} te envió un ${gift.label}!`,
      body: `${gift.coins} coins`,
      url: `/shows/${id}`,
    }).catch(() => {});

    res.json({ success: true, gift_type, coins_spent: gift.coins });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'Saldo de coins insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/tippers — top 5 donantes del show
export const getShowTippers = async (req, res) => {
  try {
    const { id } = req.params;

    const [{ data: tips }, { data: gifts }] = await Promise.all([
      supabase.from('show_tips').select('tipper_id, coins_spent').eq('show_id', id),
      supabase.from('show_gifts').select('sender_id, coins_spent').eq('show_id', id),
    ]);

    const totals = {};
    (tips || []).forEach(t => { totals[t.tipper_id] = (totals[t.tipper_id] || 0) + t.coins_spent; });
    (gifts || []).forEach(g => { totals[g.sender_id] = (totals[g.sender_id] || 0) + g.coins_spent; });

    const sorted = Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    if (sorted.length === 0) return res.json({ tippers: [] });

    const userIds = sorted.map(([uid]) => uid);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const tippers = sorted.map(([uid, coins]) => ({ ...profileMap[uid], coins_total: coins }));

    res.json({ tippers });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/interest — toggle "me interesa" en un show programado
export const toggleInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: existing } = await supabase
      .from('show_interests')
      .select('id')
      .eq('user_id', userId)
      .eq('show_id', id)
      .maybeSingle();

    if (existing) {
      await supabase.from('show_interests').delete().eq('id', existing.id);
      return res.json({ interested: false });
    }

    await supabase.from('show_interests').insert({ user_id: userId, show_id: id });
    res.json({ interested: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/interest — comprobar si el usuario está interesado
export const checkInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data } = await supabase
      .from('show_interests')
      .select('id')
      .eq('user_id', userId)
      .eq('show_id', id)
      .maybeSingle();

    const { count } = await supabase
      .from('show_interests')
      .select('*', { count: 'exact', head: true })
      .eq('show_id', id);

    res.json({ interested: !!data, interest_count: count || 0 });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/ban/:userId — banear usuario del chat (solo host)
export const banUserFromShow = async (req, res) => {
  try {
    const { id, userId: bannedId } = req.params;
    const hostId = req.user.id;

    const { data: show } = await supabase.from('live_shows').select('host_id').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'Solo el host puede banear usuarios' });

    const { error } = await supabase.from('show_bans').insert({ show_id: id, user_id: bannedId });
    if (error?.code === '23505') return res.json({ banned: true }); // ya estaba baneado
    if (error) throw error;

    res.json({ banned: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/shows/:id/ban/:userId — desbanear usuario (solo host)
export const unbanUserFromShow = async (req, res) => {
  try {
    const { id, userId: bannedId } = req.params;
    const hostId = req.user.id;

    const { data: show } = await supabase.from('live_shows').select('host_id').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('show_bans').delete().eq('show_id', id).eq('user_id', bannedId);
    res.json({ banned: false });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/shows/:id/recording — guardar URL de grabación (host)
export const setRecordingUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { recording_url } = req.body;
    const hostId = req.user.id;

    const { data: show } = await supabase.from('live_shows').select('host_id').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('live_shows').update({ recording_url: recording_url || null }).eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/leaderboard — top 10 creadores por coins ganados este mes
export const getLeaderboard = async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: tips } = await supabase
      .from('show_tips')
      .select('creator_id, coins, show_id')
      .gte('created_at', startOfMonth.toISOString());

    const { data: gifts } = await supabase
      .from('show_gifts')
      .select('creator_id, coins_spent, show_id')
      .gte('created_at', startOfMonth.toISOString());

    const totals = {};
    for (const t of tips || []) {
      if (!totals[t.creator_id]) totals[t.creator_id] = { total_coins: 0, shows: new Set(), total_viewers: 0 };
      totals[t.creator_id].total_coins += t.coins || 0;
      if (t.show_id) totals[t.creator_id].shows.add(t.show_id);
    }
    for (const g of gifts || []) {
      if (!totals[g.creator_id]) totals[g.creator_id] = { total_coins: 0, shows: new Set(), total_viewers: 0 };
      totals[g.creator_id].total_coins += g.coins_spent || 0;
      if (g.show_id) totals[g.creator_id].shows.add(g.show_id);
    }

    if (Object.keys(totals).length === 0) return res.json({ creators: [] });

    const topIds = Object.entries(totals)
      .sort((a, b) => b[1].total_coins - a[1].total_coins)
      .slice(0, 10)
      .map(([id]) => id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified')
      .in('id', topIds);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const creators = topIds.map(id => ({
      ...profileMap[id],
      total_coins: totals[id].total_coins,
      show_count: totals[id].shows.size,
      total_viewers: totals[id].total_viewers,
    })).filter(c => c.id);

    res.json({ creators });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export async function upsertCreatorEarnings(creatorId, amount) {
  const { error } = await supabase.rpc('add_creator_earnings', {
    p_creator_id: creatorId,
    p_amount: amount,
  });
  if (error) throw error;
}
