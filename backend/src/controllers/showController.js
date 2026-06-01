import { supabase, broadcastToChannel } from '../lib/supabase.js';
import { stripe } from '../lib/stripe.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { uploadFile } from '../lib/storageProvider.js';
import { spendCoins, addCoins, coinsToUSD, creatorCutUSD, CREATOR_CUT } from './coinController.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

// Multer para grabaciones de show (hasta 1GB)
const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['video/webm', 'video/mp4', 'video/x-matroska'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de video no soportado'), false);
  },
});
export const uploadRecordingMiddleware = (req, res, next) => {
  recordingUpload.single('recording')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La grabación no puede superar 1 GB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const PLATFORM_FEE_RATE = 0.30;

const VALID_CATEGORIES = ['music', 'dance', 'comedy', 'chat', 'gaming', 'fitness', 'cooking', 'art', 'adult'];

// GET /api/shows — lista shows live y programados
export const listShows = async (req, res) => {
  try {
    const { type, status = 'live', category } = req.query;
    const userId = req.user.id;
    const isAdultSection = category === 'adult';

    // La sección adulta requiere VIP o ser creador adulto
    if (isAdultSection) {
      const { data: viewerProfile } = await supabase
        .from('profiles')
        .select('is_adult_creator, premium_tier')
        .eq('id', userId)
        .single();
      const canSeeAdult = viewerProfile?.is_adult_creator || viewerProfile?.premium_tier === 'vip';
      if (!canSeeAdult) {
        return res.json({ shows: [], requires_vip: true });
      }
    }

    const statusFilter = status === 'live' ? ['live']
                       : status === 'scheduled' ? ['scheduled']
                       : ['scheduled', 'live'];

    const buildQuery = (withHost) => {
      let q = supabase
        .from('live_shows')
        .select(withHost
          ? `id, title, description, show_type, ticket_price, status,
             cover_url, scheduled_at, started_at, ended_at, category, host_id,
             host:profiles!host_id(id, full_name, avatar_url, is_verified)`
          : `id, title, description, show_type, ticket_price, status,
             cover_url, scheduled_at, started_at, ended_at, category, host_id`
        )
        .in('status', statusFilter)
        .order('started_at', { ascending: false, nullsFirst: false })
        .order('scheduled_at', { ascending: true })
        .limit(50);

      if (type && ['broadcast', 'private'].includes(type)) q = q.eq('show_type', type);

      if (isAdultSection) {
        q = q.eq('category', 'adult');
      } else if (category && VALID_CATEGORIES.includes(category)) {
        q = q.eq('category', category);
      } else {
        q = q.neq('category', 'adult');
      }
      return q;
    };

    let { data, error } = await buildQuery(true);

    // Fallback sin join si el FK no está correctamente nombrado en el schema
    if (error) {
      ({ data, error } = await buildQuery(false));
      if (error) throw error;

      // Enriquecer con perfiles manualmente
      const hostIds = [...new Set((data || []).map(s => s.host_id).filter(Boolean))];
      if (hostIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, is_verified')
          .in('id', hostIds);
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        data = (data || []).map(s => ({ ...s, host: profileMap[s.host_id] || null }));
      }
    }

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
      .sort((a, b) => b.viewer_count - a.viewer_count);

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

    let { data: show, error } = await supabase
      .from('live_shows')
      .select(`
        id, title, description, show_type, ticket_price, status,
        cover_url, scheduled_at, started_at, ended_at, category,
        private_rate, exclusive_rate, min_private_minutes,
        host:profiles!host_id(id, full_name, avatar_url, is_verified, creator_bio)
      `)
      .eq('id', id)
      .single();

    // Fallback si las columnas de show privado aún no existen en la BD
    if (error?.message?.includes('private_rate') || error?.message?.includes('column')) {
      ({ data: show, error } = await supabase
        .from('live_shows')
        .select(`
          id, title, description, show_type, ticket_price, status,
          cover_url, scheduled_at, started_at, ended_at, category,
          host:profiles!host_id(id, full_name, avatar_url, is_verified, creator_bio)
        `)
        .eq('id', id)
        .single());
    }

    if (error || !show) return res.status(404).json({ error: 'Show no encontrado' });

    // Bloquear acceso a shows adultos: requiere Plan VIP (o ser el creador adulto)
    if (show.category === 'adult') {
      const { data: vp } = await supabase
        .from('profiles')
        .select('is_adult_creator, premium_tier')
        .eq('id', userId)
        .single();
      const canSeeAdult = vp?.is_adult_creator || vp?.premium_tier === 'vip';
      if (!canSeeAdult) {
        return res.status(403).json({ error: 'Los shows adultos requieren Plan VIP', code: 'VIP_REQUIRED' });
      }
    }

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

    // Mi estatus como co-host (si aplica)
    let myCoHostStatus = null;
    if (!isHost) {
      const { data: co } = await supabase
        .from('show_co_hosts')
        .select('status')
        .eq('show_id', id)
        .eq('user_id', userId)
        .maybeSingle();
      myCoHostStatus = co?.status || null;
    }

    res.json({
      show: {
        ...show,
        is_host: isHost,
        has_ticket: hasTicket,
        viewer_count: viewerCount || 0,
        my_co_host_status: myCoHostStatus,
      },
    });
  } catch (err) {
    console.error('getShow error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows — crear show
export const createShow = async (req, res) => {
  try {
    const hostId = req.user.id;
    const { title, description, show_type, ticket_price, cover_url, scheduled_at, category = 'chat', tip_goal,
            private_rate, exclusive_rate, min_private_minutes } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    if (!['broadcast', 'private'].includes(show_type)) {
      return res.status(400).json({ error: 'show_type debe ser broadcast o private' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (cover_url && !/^https?:\/\/.{4,}/.test(cover_url)) {
      return res.status(400).json({ error: 'cover_url debe ser una URL válida' });
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

    const insertPayload = {
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
      private_rate: Math.max(5, Math.min(500, parseInt(private_rate) || 20)),
      exclusive_rate: Math.max(5, Math.min(500, parseInt(exclusive_rate) || 35)),
      min_private_minutes: Math.max(1, Math.min(60, parseInt(min_private_minutes) || 3)),
    };

    let { data: show, error } = await supabase
      .from('live_shows').insert(insertPayload).select().single();

    // Si fallan las columnas de show privado (migración pendiente), reintenta sin ellas
    if (error?.message?.includes('private_rate') || error?.message?.includes('column')) {
      const { private_rate: _pr, exclusive_rate: _er, min_private_minutes: _mm, ...basePayload } = insertPayload;
      ({ data: show, error } = await supabase
        .from('live_shows').insert(basePayload).select().single());
    }

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
      .select('host_id, status')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });
    if (show.status === 'ended') return res.status(400).json({ error: 'El show ya terminó' });

    const now = new Date().toISOString();
    let { data: updated, error: startErr } = await supabase
      .from('live_shows')
      .update({ status: 'live', started_at: now, host_heartbeat_at: now })
      .eq('id', id)
      .select()
      .single();

    // Fallback si host_heartbeat_at aún no existe (migración pendiente)
    if (startErr?.message?.includes('host_heartbeat_at') || startErr?.message?.includes('column')) {
      ({ data: updated, error: startErr } = await supabase
        .from('live_shows')
        .update({ status: 'live', started_at: now })
        .eq('id', id)
        .select()
        .single());
    }

    if (startErr) throw startErr;

    res.json({ show: updated });

    // Achievement: primer show del creador (fire-and-forget)
    try {
      const { grantAchievement } = await import('./achievementsController.js');
      grantAchievement(hostId, 'first_show').catch(() => {});
    } catch {}

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
        const { notifyUser } = await import('../lib/emailNotifier.js');
        interested.forEach(({ user_id }) => {
          if (user_id === hostId) return;
          sendPushToUser(user_id, interestPush).catch(() => {});
          createNotification(user_id, 'show_ticket', interestPush.title, interestPush.body, { show_id: id });
          // Email — solo para interesados que activaron pref show_starting
          notifyUser(user_id, 'show_starting', {
            creatorName: host?.full_name || 'Un creador',
            showTitle:   updated?.title || 'Show',
            showId:      id,
          }).catch(() => {});
        });
      }

      // Notificar a seguidores (evitar duplicados con suscriptores ya notificados)
      const { data: followers } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', hostId);

      if (followers?.length > 0) {
        const subscriberSet = new Set((subs || []).map(s => s.subscriber_id));
        const followerPush = {
          title: `🔴 ${host?.full_name || 'Un creador'} está en vivo`,
          body: updated?.title || 'Está transmitiendo ahora',
          icon: '/icon-192.png',
          data: { url: `/shows/${id}` },
        };
        followers.forEach(({ follower_id }) => {
          if (follower_id === hostId) return;
          if (subscriberSet.has(follower_id)) return; // ya notificado como suscriptor
          sendPushToUser(follower_id, followerPush).catch(() => {});
          createNotification(follower_id, 'show_live', followerPush.title, followerPush.body, { show_id: id });
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
      .select('host_id, status, ticket_price, show_type, category')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.status !== 'live') return res.status(400).json({ error: 'El show no está en vivo' });

    // Gate de edad para shows adultos
    if (show.category === 'adult') {
      const { data: vp } = await supabase.from('profiles').select('is_adult_creator, age_verified_at').eq('id', userId).single();
      if (!vp?.is_adult_creator && !vp?.age_verified_at) {
        return res.status(403).json({ error: 'Debes verificar tu edad para acceder a este contenido', code: 'AGE_VERIFICATION_REQUIRED' });
      }
    }

    const isHost = show.host_id === userId;

    // Co-host aceptado: acceso como publisher
    let isCoHost = false;
    if (!isHost) {
      const { data: co } = await supabase
        .from('show_co_hosts')
        .select('status')
        .eq('show_id', id)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .maybeSingle();
      isCoHost = !!co;
    }

    if (!isHost && !isCoHost) {
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
    const role = isHost ? 'host' : isCoHost ? 'co_host' : 'viewer';
    res.json({ roomId, role, can_publish: isHost || isCoHost });
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

    // Gate de edad para shows adultos
    if (show.category === 'adult') {
      const { data: vp } = await supabase.from('profiles').select('is_adult_creator, age_verified_at').eq('id', buyerId).single();
      if (!vp?.is_adult_creator && !vp?.age_verified_at) {
        return res.status(403).json({ error: 'Debes verificar tu edad para acceder a este contenido', code: 'AGE_VERIFICATION_REQUIRED' });
      }
    }

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

    // BLOQUEAR la compra si el host NO tiene Stripe activo (issue auditoría #8)
    if (!show.host?.stripe_account_id || show.host?.stripe_account_status !== 'active') {
      return res.status(400).json({
        error: 'Este creador aún no tiene configurada su cuenta de pagos',
        code: 'CREATOR_PAYMENTS_NOT_READY',
      });
    }

    const amountCents = Math.round(show.ticket_price * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const paymentIntentParams = {
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: show.host.stripe_account_id },
      metadata: {
        type: 'show_ticket',
        show_id: id,
        buyer_id: buyerId,
        seller_id: show.host_id,
      },
    };

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
      sender_id: tipperId,
      creator_id: show.host_id,
      coins_spent: coinsAmount,
      amount_usd: amountUSD,
      creator_earnings: creatorEarnings,
      platform_fee: platformFee,
      message: message?.trim() || null,
    });

    // Acreditar coins (como ingresos) al creador
    await addCoins(show.host_id, Math.round(coinsAmount * CREATOR_CUT), 'tip_received', id);
    await upsertCreatorEarnings(show.host_id, creatorEarnings);

    // Achievements del tipper
    try {
      const { grantAchievement } = await import('./achievementsController.js');
      grantAchievement(tipperId, 'first_tip').catch(() => {});
      const { data: totalSpent } = await supabase.rpc('sum_user_spent_usd', { p_user_id: tipperId }).catch(() => ({ data: null }));
      const spent = parseFloat(totalSpent || 0) || amountUSD;
      if (spent >= 50)  grantAchievement(tipperId, 'big_spender').catch(() => {});
      if (spent >= 500) grantAchievement(tipperId, 'whale').catch(() => {});
    } catch {}

    // Notificar al creador
    const { data: tipper } = await supabase
      .from('profiles').select('full_name, avatar_url').eq('id', tipperId).single();
    const { data: tipperBalance } = await supabase
      .from('profiles').select('coins_balance').eq('id', tipperId).single();
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

    // Broadcast desde el server — garantiza entrega
    broadcastToChannel(`show:${id}`, 'tip', {
      senderName: tipper?.full_name || 'Alguien',
      senderId:   tipperId,
      avatar:     tipper?.avatar_url || null,
      coins:      coinsAmount,
      message:    message?.trim() || null,
    }).catch(() => {});

    // Email al creador (respeta email_prefs.tip_received), solo si > $1
    if (amountUSD >= 1) {
      import('../lib/emailNotifier.js').then(({ notifyUser }) =>
        notifyUser(show.host_id, 'tip_received', {
          fromName: tipper?.full_name || 'Alguien',
          amountUsd: creatorEarnings,
          coinsAmount,
        })
      ).catch(() => {});
    }

    res.json({
      success: true,
      coins_sent: coinsAmount,
      new_balance: tipperBalance?.coins_balance ?? null,
    });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'Saldo de coins insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    console.error('sendTip error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/gift — enviar regalo animado con coins
// Regalos default: claves cortas. Custom: 'custom:UUID'
const GIFT_TYPES = {
  rose:    { coins: 10,  label: 'Rosa',     emoji: '🌹' },
  heart:   { coins: 50,  label: 'Corazón',  emoji: '💝' },
  diamond: { coins: 200, label: 'Diamante', emoji: '💎' },
  crown:   { coins: 500, label: 'Corona',   emoji: '👑' },
};

async function resolveGift(gift_type, hostId) {
  // Default
  if (GIFT_TYPES[gift_type]) {
    return { ...GIFT_TYPES[gift_type], custom_gift_id: null };
  }
  // Custom: 'custom:UUID'
  if (typeof gift_type === 'string' && gift_type.startsWith('custom:')) {
    const giftId = gift_type.slice(7);
    const { data: cg } = await supabase
      .from('creator_gifts')
      .select('id, label, emoji, image_url, coins, active, creator_id')
      .eq('id', giftId)
      .single();
    if (!cg || !cg.active || cg.creator_id !== hostId) return null;
    return {
      coins:      cg.coins,
      label:      cg.label,
      emoji:      cg.emoji || '🎁',
      image_url:  cg.image_url || null,
      custom_gift_id: cg.id,
    };
  }
  return null;
}

export const sendGift = async (req, res) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;
    const { gift_type } = req.body;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, title')
      .eq('id', id)
      .single();

    if (!show || show.status !== 'live') return res.status(400).json({ error: 'Show no está en vivo' });
    if (show.host_id === senderId) return res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });

    const gift = await resolveGift(gift_type, show.host_id);
    if (!gift) return res.status(400).json({ error: 'Tipo de regalo inválido' });

    await spendCoins(senderId, gift.coins, 'gift_sent', id);

    const amountUSD       = coinsToUSD(gift.coins);
    const creatorEarnings = creatorCutUSD(gift.coins);

    await supabase.from('show_gifts').insert({
      show_id:        id,
      sender_id:      senderId,
      creator_id:     show.host_id,
      gift_type,
      coins_spent:    gift.coins,
      custom_gift_id: gift.custom_gift_id,
    });

    await addCoins(show.host_id, Math.round(gift.coins * CREATOR_CUT), 'gift_received', id);
    await upsertCreatorEarnings(show.host_id, creatorEarnings);

    const { data: sender }    = await supabase.from('profiles').select('full_name, avatar_url').eq('id', senderId).single();
    const { data: balanceRow } = await supabase.from('profiles').select('coins_balance').eq('id', senderId).single();

    createNotification(show.host_id, 'tip', `¡${sender?.full_name} te envió un regalo!`, `${gift.label} · ${gift.coins} coins`, { show_id: id });
    sendPushToUser(show.host_id, {
      title: `¡${sender?.full_name} te envió un ${gift.label}!`,
      body: `${gift.coins} coins`,
      url: `/shows/${id}`,
    }).catch(() => {});

    // Broadcast desde el server — garantiza entrega aunque el cliente no pueda
    broadcastToChannel(`show:${id}`, 'gift', {
      emoji:      gift.emoji,
      image_url:  gift.image_url || null,
      senderName: sender?.full_name || 'Alguien',
      senderId,
      avatar:     sender?.avatar_url || null,
      coins:      gift.coins,
      gift_type,
      label:      gift.label,
    }).catch(() => {});

    // Email al creador
    if (coinsToUSD(gift.coins) >= 1) {
      import('../lib/emailNotifier.js').then(({ notifyUser }) =>
        notifyUser(show.host_id, 'gift_received', {
          fromName: sender?.full_name || 'Alguien',
          giftName: gift.label,
          amountUsd: creatorEarnings,
        })
      ).catch(() => {});
    }

    res.json({
      success: true,
      gift_type,
      coins_spent: gift.coins,
      new_balance: balanceRow?.coins_balance ?? null,
    });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_COINS') {
      return res.status(400).json({ error: 'Saldo de coins insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    console.error('sendGift error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/tippers — top 5 donantes del show
export const getShowTippers = async (req, res) => {
  try {
    const { id } = req.params;

    const [{ data: tips }, { data: gifts }] = await Promise.all([
      supabase.from('show_tips').select('sender_id, coins_spent').eq('show_id', id),
      supabase.from('show_gifts').select('sender_id, coins_spent').eq('show_id', id),
    ]);

    const totals = {};
    (tips || []).forEach(t => { totals[t.sender_id] = (totals[t.sender_id] || 0) + t.coins_spent; });
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

    if (recording_url && !/^https?:\/\/.{4,}/.test(recording_url)) {
      return res.status(400).json({ error: 'recording_url debe ser una URL válida' });
    }

    await supabase.from('live_shows').update({ recording_url: recording_url || null }).eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/recording/upload — subir grabación (host)
export const uploadRecording = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;

    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const { data: show } = await supabase
      .from('live_shows').select('host_id, title').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    const ext = req.file.mimetype === 'video/mp4' ? 'mp4' : 'webm';
    const path = `recordings/${hostId}/${id}-${Date.now()}.${ext}`;
    const url = await uploadFile(path, req.file.buffer, req.file.mimetype);

    await supabase.from('live_shows').update({ recording_url: url }).eq('id', id);

    res.json({ success: true, recording_url: url });
  } catch (err) {
    console.error('uploadRecording error:', err.message);
    res.status(500).json({ error: 'Error al subir grabación' });
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
      .select('creator_id, coins_spent, show_id')
      .gte('created_at', startOfMonth.toISOString());

    const { data: gifts } = await supabase
      .from('show_gifts')
      .select('creator_id, coins_spent, show_id')
      .gte('created_at', startOfMonth.toISOString());

    const totals = {};
    for (const t of tips || []) {
      if (!totals[t.creator_id]) totals[t.creator_id] = { total_coins: 0, shows: new Set(), total_viewers: 0 };
      totals[t.creator_id].total_coins += t.coins_spent || 0;
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
  const amt = parseFloat(amount) || 0;
  if (amt === 0) return;

  // Intento 1: RPC atómico (preferido)
  try {
    const { error } = await supabase.rpc('add_creator_earnings', {
      p_creator_id: creatorId,
      p_amount: amt,
    });
    if (!error) return;
    console.warn('[upsertCreatorEarnings] RPC failed, using fallback:', error.message);
  } catch (rpcErr) {
    console.warn('[upsertCreatorEarnings] RPC threw, using fallback:', rpcErr.message);
  }

  // Fallback: upsert manual (no atómico pero garantiza que el balance se actualice
  // incluso si la migración v13 no se aplicó)
  try {
    const { data: existing } = await supabase
      .from('creator_earnings')
      .select('total_earned, available_balance')
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (existing) {
      await supabase.from('creator_earnings').update({
        total_earned:      parseFloat(existing.total_earned || 0) + amt,
        available_balance: parseFloat(existing.available_balance || 0) + amt,
        updated_at:        new Date().toISOString(),
      }).eq('creator_id', creatorId);
    } else {
      await supabase.from('creator_earnings').insert({
        creator_id:        creatorId,
        total_earned:      amt,
        available_balance: amt,
        pending_balance:   0,
        total_paid_out:    0,
      });
    }
  } catch (fallbackErr) {
    console.error('[upsertCreatorEarnings] both RPC and fallback failed:', fallbackErr.message);
  }
}

// ── SHOW PRIVADO ──────────────────────────────────────────────────────────────

// POST /api/shows/:id/private/request — viewer solicita show privado al host
export const requestPrivateShow = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { type = 'private' } = req.body;
    const showId = req.params.id;

    let { data: show } = await supabase
      .from('live_shows')
      .select('host_id, private_rate, exclusive_rate, min_private_minutes, status')
      .eq('id', showId)
      .single();

    if (!show || show.status !== 'live') {
      return res.status(400).json({ error: 'Show no activo', code: 'SHOW_ENDED' });
    }
    if (show.host_id === viewerId) {
      return res.status(400).json({ error: 'No puedes solicitarte un show privado a ti mismo' });
    }

    const rate       = type === 'exclusive' ? (show.exclusive_rate ?? 35) : (show.private_rate ?? 20);
    const minMinutes = show.min_private_minutes ?? 3;
    const required   = rate * minMinutes;

    const { data: profile } = await supabase
      .from('profiles').select('coins_balance, full_name, avatar_url').eq('id', viewerId).single();

    if ((profile?.coins_balance ?? 0) < required) {
      return res.status(402).json({
        error: `Necesitas al menos ${required} coins (${minMinutes} min mínimo)`,
        code: 'INSUFFICIENT_COINS', required, balance: profile?.coins_balance ?? 0,
      });
    }

    // Broadcast al host (vía backend, no cliente — entrega garantizada)
    broadcastToChannel(`show:${showId}`, 'private_request', {
      viewerId,
      viewerName:   profile?.full_name || 'Alguien',
      viewerAvatar: profile?.avatar_url || null,
      type, rate, minMinutes,
    }).catch(() => {});

    res.json({ ok: true, rate, minMinutes });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/private/accept — host acepta la solicitud
export const acceptPrivateShow = async (req, res) => {
  try {
    const hostId = req.user.id;
    const showId = req.params.id;
    const { viewerId, type = 'private' } = req.body;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, private_rate, exclusive_rate')
      .eq('id', showId).single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });
    if (show.status !== 'live')  return res.status(400).json({ error: 'Show no activo' });

    const rate = type === 'exclusive' ? (show.exclusive_rate ?? 35) : (show.private_rate ?? 20);
    const { data: host } = await supabase.from('profiles').select('full_name').eq('id', hostId).single();

    broadcastToChannel(`show:${showId}`, 'private_accept', {
      viewerId, type, rate, hostName: host?.full_name || 'El host',
    }).catch(() => {});

    res.json({ ok: true, rate });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/private/decline — host rechaza la solicitud
export const declinePrivateShow = async (req, res) => {
  try {
    const hostId = req.user.id;
    const showId = req.params.id;
    const { viewerId } = req.body;

    const { data: show } = await supabase
      .from('live_shows').select('host_id').eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    broadcastToChannel(`show:${showId}`, 'private_decline', { viewerId }).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/private/end — termina la sesión privada (viewer o host)
export const endPrivateShow = async (req, res) => {
  try {
    const userId = req.user.id;
    const showId = req.params.id;
    const { viewerId, reason = 'manual' } = req.body;

    const { data: show } = await supabase
      .from('live_shows').select('host_id').eq('id', showId).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });

    // Solo el host o el propio viewer pueden terminar
    if (show.host_id !== userId && viewerId !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    broadcastToChannel(`show:${showId}`, 'private_end', {
      viewerId: viewerId || userId,
      endedBy: show.host_id === userId ? 'host' : 'viewer',
      reason,
    }).catch(() => {});

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/private/validate — verifica saldo antes de iniciar
export const validatePrivateShow = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { type = 'private' } = req.body;
    const showId = req.params.id;

    let { data: show } = await supabase
      .from('live_shows')
      .select('private_rate, exclusive_rate, min_private_minutes, status')
      .eq('id', showId)
      .single();

    // Fallback si columnas privadas aún no existen
    if (!show) {
      ({ data: show } = await supabase
        .from('live_shows').select('status').eq('id', showId).single());
    }

    if (!show || show.status !== 'live') {
      return res.status(400).json({ error: 'Show no activo', code: 'SHOW_ENDED' });
    }

    const rate = type === 'exclusive'
      ? (show.exclusive_rate ?? 35)
      : (show.private_rate ?? 20);
    const minMinutes = show.min_private_minutes ?? 3;
    const required = rate * minMinutes;

    const { data: profile } = await supabase
      .from('profiles')
      .select('coins_balance')
      .eq('id', viewerId)
      .single();

    const balance = profile?.coins_balance ?? 0;
    if (balance < required) {
      return res.status(402).json({
        error: `Necesitas al menos ${required} coins para iniciar (${minMinutes} min mínimo)`,
        code: 'INSUFFICIENT_COINS',
        required,
        balance,
      });
    }

    res.json({ ok: true, rate, minMinutes, balance });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/private/tick — deducir 1 minuto de show privado
export const privateShowTick = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { type = 'private' } = req.body;
    const showId = req.params.id;

    let { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, private_rate, exclusive_rate')
      .eq('id', showId)
      .single();

    // Fallback si columnas privadas aún no existen
    if (!show) {
      ({ data: show } = await supabase
        .from('live_shows').select('host_id, status').eq('id', showId).single());
    }

    if (!show || show.status !== 'live') {
      return res.status(400).json({ error: 'Show no activo', code: 'SHOW_ENDED' });
    }

    const rate = type === 'exclusive'
      ? (show.exclusive_rate ?? 35)
      : (show.private_rate ?? 20);

    // Deducir del viewer
    await spendCoins(viewerId, rate, 'private_show');

    // Acreditar al creador (70%)
    const creatorCut = Math.round(rate * CREATOR_CUT);
    await addCoins(show.host_id, creatorCut, 'private_show_earning');
    await upsertCreatorEarnings(show.host_id, creatorCut);

    const { data: balRow } = await supabase
      .from('profiles')
      .select('coins_balance')
      .eq('id', viewerId)
      .single();

    res.json({ deducted: rate, remaining: balRow?.coins_balance ?? 0 });
  } catch (err) {
    if (err.message === 'Saldo insuficiente') {
      return res.status(402).json({ error: 'Saldo insuficiente', code: 'INSUFFICIENT_COINS' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


// POST /api/shows/:id/heartbeat — host keepalive while show is live
export const heartbeatShow = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;

    const { error } = await supabase
      .from('live_shows')
      .update({ host_heartbeat_at: new Date().toISOString() })
      .eq('id', id)
      .eq('host_id', hostId)
      .eq('status', 'live');

    if (error && !error.message?.includes('host_heartbeat_at') && !error.message?.includes('column')) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/shows/:id/tip-goal — actualizar meta de propinas en vivo
export const updateTipGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;
    const { tip_goal } = req.body;

    const { data: show } = await supabase.from('live_shows').select('host_id').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    const goal = tip_goal ? Math.max(1, parseFloat(tip_goal)) : null;
    await supabase.from('live_shows').update({ tip_goal: goal }).eq('id', id);
    res.json({ tip_goal: goal });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── CREATOR GIFTS (regalos personalizados) ───────────────────────────────────

// GET /api/shows/:hostId/gifts/catalog — lista pública para mostrar en GiftPanel
export const getGiftsCatalog = async (req, res) => {
  try {
    const { hostId } = req.params;
    const { data } = await supabase
      .from('creator_gifts')
      .select('id, label, emoji, image_url, coins, position')
      .eq('creator_id', hostId)
      .eq('active', true)
      .order('position', { ascending: true })
      .order('coins', { ascending: true });
    res.json({ custom_gifts: data || [] });
  } catch {
    res.json({ custom_gifts: [] });
  }
};

// GET /api/shows/my/gifts — gifts del creador autenticado (para gestión)
export const getMyGifts = async (req, res) => {
  try {
    const { data } = await supabase
      .from('creator_gifts')
      .select('*')
      .eq('creator_id', req.user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    res.json({ gifts: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/shows/my/gifts
export const createGift = async (req, res) => {
  try {
    const userId = req.user.id;
    const { label, emoji, image_url, coins, position } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_creator').eq('id', userId).single();
    if (!profile?.is_creator) return res.status(403).json({ error: 'Solo creadores pueden crear regalos' });

    if (!label?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!emoji && !image_url) return res.status(400).json({ error: 'Debes proporcionar emoji o imagen' });
    const c = parseInt(coins);
    if (!c || c < 1 || c > 99999) return res.status(400).json({ error: 'Coins entre 1 y 99999' });

    const { data: gift, error } = await supabase
      .from('creator_gifts')
      .insert({
        creator_id: userId,
        label: label.trim().substring(0, 50),
        emoji: emoji || null,
        image_url: image_url || null,
        coins: c,
        position: parseInt(position) || 0,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json({ gift });
  } catch {
    res.status(500).json({ error: 'Error al crear regalo' });
  }
};

// PUT /api/shows/my/gifts/:id
export const updateGift = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('creator_gifts').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Regalo no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    const updates = {};
    const { label, emoji, image_url, coins, active, position } = req.body;
    if (label !== undefined) updates.label = String(label).trim().substring(0, 50);
    if (emoji !== undefined) updates.emoji = emoji || null;
    if (image_url !== undefined) updates.image_url = image_url || null;
    if (coins !== undefined) {
      const c = parseInt(coins);
      if (!c || c < 1 || c > 99999) return res.status(400).json({ error: 'Coins inválidos' });
      updates.coins = c;
    }
    if (active !== undefined) updates.active = !!active;
    if (position !== undefined) updates.position = parseInt(position) || 0;
    updates.updated_at = new Date().toISOString();

    const { data: gift, error } = await supabase
      .from('creator_gifts').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json({ gift });
  } catch {
    res.status(500).json({ error: 'Error al actualizar' });
  }
};

// DELETE /api/shows/my/gifts/:id
export const deleteGift = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing } = await supabase
      .from('creator_gifts').select('creator_id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Regalo no encontrado' });
    if (existing.creator_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('creator_gifts').delete().eq('id', id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
};

// GET /api/shows/:id/tip-goal — progreso actual del tip goal
export const getTipGoalProgress = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: show } = await supabase
      .from('live_shows')
      .select('tip_goal, status')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });

    const { data: tips } = await supabase
      .from('show_tips')
      .select('coins_spent')
      .eq('show_id', id);

    const totalCoins = (tips || []).reduce((sum, t) => sum + (t.coins_spent || 0), 0);

    res.json({ tip_goal: show.tip_goal, collected: totalCoins, completed: show.tip_goal ? totalCoins >= show.tip_goal : false });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/poll — crear/actualizar poll (solo host)
export const setPoll = async (req, res) => {
  try {
    const { id } = req.params;
    const hostId = req.user.id;
    const { question, options, active = true } = req.body;

    const { data: show } = await supabase.from('live_shows').select('host_id').eq('id', id).single();
    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (show.host_id !== hostId) return res.status(403).json({ error: 'No autorizado' });

    if (!question?.trim()) return res.status(400).json({ error: 'La pregunta es obligatoria' });
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return res.status(400).json({ error: 'Se requieren entre 2 y 4 opciones' });
    }

    await supabase.from('live_shows').update({
      poll_question: question.trim(),
      poll_options: options.map((o, i) => ({ index: i, text: String(o).trim(), votes: 0 })),
      poll_active: !!active,
    }).eq('id', id);

    // Eliminar votos anteriores al reiniciar la encuesta
    await supabase.from('show_poll_votes').delete().eq('show_id', id);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/shows/:id/poll/vote — votar en poll
export const votePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { option_index } = req.body;

    const { data: show } = await supabase
      .from('live_shows')
      .select('poll_active, poll_options')
      .eq('id', id)
      .single();

    if (!show?.poll_active) return res.status(400).json({ error: 'No hay una encuesta activa' });
    if (option_index === undefined || option_index < 0 || option_index >= (show.poll_options?.length || 0)) {
      return res.status(400).json({ error: 'Opción inválida' });
    }

    // Upsert: solo un voto por usuario por show
    const { error } = await supabase.from('show_poll_votes').upsert(
      { show_id: id, user_id: userId, option_index },
      { onConflict: 'show_id,user_id' }
    );

    if (error) throw error;

    // Devolver resultados actualizados
    const { data: votes } = await supabase
      .from('show_poll_votes')
      .select('option_index')
      .eq('show_id', id);

    const counts = {};
    (votes || []).forEach(v => { counts[v.option_index] = (counts[v.option_index] || 0) + 1; });

    const results = (show.poll_options || []).map((opt, i) => ({ ...opt, votes: counts[i] || 0 }));
    res.json({ results, total_votes: votes?.length || 0 });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/shows/:id/poll — obtener resultados del poll
export const getPoll = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: show } = await supabase
      .from('live_shows')
      .select('poll_question, poll_options, poll_active')
      .eq('id', id)
      .single();

    if (!show) return res.status(404).json({ error: 'Show no encontrado' });
    if (!show.poll_active) return res.json({ active: false });

    const { data: votes } = await supabase
      .from('show_poll_votes')
      .select('option_index, user_id')
      .eq('show_id', id);

    const userId = req.user.id;
    const myVote = (votes || []).find(v => v.user_id === userId);
    const counts = {};
    (votes || []).forEach(v => { counts[v.option_index] = (counts[v.option_index] || 0) + 1; });

    const results = (show.poll_options || []).map((opt, i) => ({ ...opt, votes: counts[i] || 0 }));
    res.json({
      active: true,
      question: show.poll_question,
      results,
      total_votes: votes?.length || 0,
      my_vote: myVote?.option_index ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
