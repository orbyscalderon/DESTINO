import { supabase } from '../lib/supabase.js';
import { decryptField } from '../lib/encrypt.js';
import { sendBroadcastNotification } from './notificationController.js';
import { sendWithdrawalStatusEmail } from '../lib/emailService.js';
import { COIN_VALUE_USD, PLATFORM_FEE_RATE } from './coinController.js';

// GET /api/admin/platform-revenue?days=30 — ingresos de la plataforma (el 30%)
// Solo accesible para admin. Suma TODAS las fuentes y devuelve:
// - coin_sales: 100% de las compras de coins (ingreso directo)
// - tx_commission: 30% de cada transacción creator→fan
// - Total + desglose por categoría + comparativa
export const getPlatformRevenue = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const now = Date.now();
    const periodMs = days * 24 * 60 * 60 * 1000;
    const startCurrent  = new Date(now - periodMs).toISOString();
    const startPrevious = new Date(now - 2 * periodMs).toISOString();

    const queries = await Promise.all([
      // [0] Compras de coins (100% va a la plataforma directamente)
      supabase.from('coin_transactions').select('amount, created_at')
        .eq('type', 'purchase').gte('created_at', startPrevious),
      // [1] Tickets de shows — platform_fee directamente almacenado
      supabase.from('show_tickets').select('amount_paid, platform_fee, creator_earnings, purchased_at')
        .gte('purchased_at', startPrevious),
      // [2] Tips en shows — platform_fee
      supabase.from('show_tips').select('amount_usd, platform_fee, creator_earnings, created_at')
        .gte('created_at', startPrevious),
      // [3] Regalos en shows — calculamos USD desde coins
      supabase.from('show_gifts').select('coins_spent, created_at')
        .gte('created_at', startPrevious),
      // [4] Ventas de contenido (PPV en chat / posts pagados)
      supabase.from('content_purchases').select('amount_paid, platform_fee, creator_earnings, created_at')
        .gte('created_at', startPrevious),
      // [5] Encargos de video
      supabase.from('video_requests').select('price, completed_at').eq('status', 'completed')
        .gte('completed_at', startPrevious),
      // [6] Suscripciones a creadores
      supabase.from('creator_subscriptions').select('subscription_price, created_at')
        .gte('created_at', startPrevious),
      // [7] Boost de visibilidad (50 coins por boost, 100% plataforma)
      supabase.from('coin_transactions').select('amount, created_at')
        .eq('type', 'boost').gte('created_at', startPrevious),
      // [8] Suscripciones Premium/VIP — solo desde Stripe webhooks no se guarda en DB
      // Por ahora la suscripción a app premium no aparece desglosada aquí
    ]);
    const safe = (i) => Array.isArray(queries[i].data) ? queries[i].data : [];

    const inRange = (d, since) => new Date(d) >= new Date(since);
    const coinsToUSD = (c) => parseFloat(c || 0) * COIN_VALUE_USD;

    // Definir cada categoría: cómo calcular USD que va a la plataforma
    const cats = {
      coin_sales: {
        rows: safe(0),
        getUsd: r => parseFloat(r.amount || 0) * COIN_VALUE_USD, // amount es +coins comprados
        date: 'created_at',
      },
      show_tickets: {
        rows: safe(1),
        getUsd: r => parseFloat(r.platform_fee || 0) || (parseFloat(r.amount_paid || 0) - parseFloat(r.creator_earnings || 0)),
        date: 'purchased_at',
      },
      show_tips: {
        rows: safe(2),
        getUsd: r => parseFloat(r.platform_fee || 0) || (parseFloat(r.amount_usd || 0) - parseFloat(r.creator_earnings || 0)),
        date: 'created_at',
      },
      show_gifts: {
        // No tienen platform_fee column → calcular desde coins
        rows: safe(3),
        getUsd: r => coinsToUSD(r.coins_spent) * PLATFORM_FEE_RATE,
        date: 'created_at',
      },
      content_sales: {
        rows: safe(4),
        getUsd: r => parseFloat(r.platform_fee || 0) || (parseFloat(r.amount_paid || 0) - parseFloat(r.creator_earnings || 0)),
        date: 'created_at',
      },
      video_requests: {
        rows: safe(5),
        getUsd: r => coinsToUSD(r.price) * PLATFORM_FEE_RATE,
        date: 'completed_at',
      },
      subscriptions: {
        rows: safe(6),
        getUsd: r => parseFloat(r.subscription_price || 0) * PLATFORM_FEE_RATE,
        date: 'created_at',
      },
      boosts: {
        rows: safe(7),
        // type='boost' tiene amount negativo (-50). Tomar abs.
        getUsd: r => Math.abs(parseFloat(r.amount || 0)) * COIN_VALUE_USD,
        date: 'created_at',
      },
    };

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

    // Cuánto ganaron los creadores en el mismo período (referencia)
    const creatorEarningsCurrent =
      safe(1).filter(r => inRange(r.purchased_at, startCurrent)).reduce((s, r) => s + parseFloat(r.creator_earnings || 0), 0) +
      safe(2).filter(r => inRange(r.created_at, startCurrent)).reduce((s, r) => s + parseFloat(r.creator_earnings || 0), 0) +
      safe(3).filter(r => inRange(r.created_at, startCurrent)).reduce((s, r) => s + coinsToUSD(r.coins_spent) * (1 - PLATFORM_FEE_RATE), 0) +
      safe(4).filter(r => inRange(r.created_at, startCurrent)).reduce((s, r) => s + parseFloat(r.creator_earnings || 0), 0) +
      safe(5).filter(r => inRange(r.completed_at, startCurrent)).reduce((s, r) => s + coinsToUSD(r.price) * (1 - PLATFORM_FEE_RATE), 0) +
      safe(6).filter(r => inRange(r.created_at, startCurrent)).reduce((s, r) => s + parseFloat(r.subscription_price || 0) * (1 - PLATFORM_FEE_RATE), 0);

    res.json({
      totals_usd,
      previous_usd,
      breakdown_detail,
      total_current:        parseFloat(totalCurrent.toFixed(2)),
      total_previous:       parseFloat(totalPrevious.toFixed(2)),
      pct_change:           pctChange,
      chart,
      creator_earnings_current: parseFloat(creatorEarningsCurrent.toFixed(2)),
      coin_rate: { usd_per_coin: COIN_VALUE_USD, platform_fee: PLATFORM_FEE_RATE },
      days,
    });
  } catch (err) {
    console.error('getPlatformRevenue error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/stats
export const getStats = async (req, res) => {
  try {
    const [
      { count: users },
      { count: matches },
      { count: messages },
      { count: premium },
      { count: creators },
      { count: shows },
      { data: earnings },
      { data: coins },
      { count: vip },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('is_match', true),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('premium_tier', 'premium'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_creator', true),
      supabase.from('live_shows').select('*', { count: 'exact', head: true }),
      supabase.from('creator_earnings').select('total_earned'),
      supabase.from('profiles').select('coins_balance'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('premium_tier', 'vip'),
    ]);

    const total_earnings = (earnings || []).reduce((s, r) => s + parseFloat(r.total_earned || 0), 0);
    const coins_total = (coins || []).reduce((s, r) => s + (r.coins_balance || 0), 0);

    res.json({ stats: { users, matches, messages, premium, vip: vip ?? 0, creators, shows, total_earnings, coins_total } });
  } catch (err) {
    console.error('getStats error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/users?page=0&q=
export const getUsers = async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = 50;
    const q = req.query.q?.trim();

    let query = supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, is_premium, premium_tier, is_verified, is_creator, is_adult_creator, is_admin, coins_balance, created_at')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (q) query = query.or(`full_name.ilike.%${q}%,username.ilike.%${q}%`);

    const { data: users, error } = await query;
    if (error) throw error;

    res.json({ users: users || [] });
  } catch (err) {
    console.error('getUsers error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/creators
export const getCreators = async (req, res) => {
  try {
    const { data: creators, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, is_verified, is_adult_creator, stripe_account_status, creator_subscription_price, created_at')
      .eq('is_creator', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ids = (creators || []).map(c => c.id);
    let earningsMap = {};
    if (ids.length > 0) {
      const { data: earns } = await supabase
        .from('creator_earnings')
        .select('creator_id, total_earned, available_balance')
        .in('creator_id', ids);
      (earns || []).forEach(e => { earningsMap[e.creator_id] = e; });
    }

    res.json({
      creators: (creators || []).map(c => ({
        ...c,
        total_earned: parseFloat(earningsMap[c.id]?.total_earned || 0),
        available_balance: parseFloat(earningsMap[c.id]?.available_balance || 0),
      })),
    });
  } catch (err) {
    console.error('getCreators error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/shows
export const getShows = async (req, res) => {
  try {
    const { data: shows, error } = await supabase
      .from('live_shows')
      .select(`
        id, title, show_type, category, ticket_price, status, scheduled_at, started_at, ended_at,
        host:profiles!host_id(id, full_name, username, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ shows: shows || [] });
  } catch (err) {
    console.error('getShows error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/premium
export const setUserPremium = async (req, res) => {
  try {
    const { userId, isPremium } = req.body;
    if (!userId || typeof isPremium !== 'boolean') return res.status(400).json({ error: 'Parámetros inválidos' });
    const tier = isPremium ? 'premium' : 'basic';
    const { error } = await supabase.from('profiles')
      .update({ is_premium: isPremium, premium_tier: tier }).eq('id', userId);
    if (error) throw error;
    res.json({ message: `Premium ${isPremium ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('setUserPremium error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/tier
export const setUserTier = async (req, res) => {
  try {
    const { userId, tier } = req.body;
    if (!userId || !['basic', 'premium', 'vip'].includes(tier)) {
      return res.status(400).json({ error: "tier debe ser 'basic', 'premium' o 'vip'" });
    }
    const isPremium = tier !== 'basic';
    const { error } = await supabase.from('profiles')
      .update({ premium_tier: tier, is_premium: isPremium }).eq('id', userId);
    if (error) throw error;
    res.json({ message: `Tier actualizado a ${tier}` });
  } catch (err) {
    console.error('setUserTier error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/verified
export const setUserVerified = async (req, res) => {
  try {
    const { userId, isVerified } = req.body;
    if (!userId || typeof isVerified !== 'boolean') return res.status(400).json({ error: 'Parámetros inválidos' });
    const { error } = await supabase.from('profiles').update({ is_verified: isVerified }).eq('id', userId);
    if (error) throw error;
    res.json({ message: `Verificado ${isVerified ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('setUserVerified error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/creator
export const setUserCreator = async (req, res) => {
  try {
    const { userId, isCreator } = req.body;
    if (!userId || typeof isCreator !== 'boolean') return res.status(400).json({ error: 'Parámetros inválidos' });
    const { error } = await supabase.from('profiles').update({ is_creator: isCreator }).eq('id', userId);
    if (error) throw error;
    if (isCreator) {
      await supabase.from('creator_earnings').upsert(
        { creator_id: userId, total_earned: 0, available_balance: 0, pending_balance: 0, total_paid_out: 0 },
        { onConflict: 'creator_id', ignoreDuplicates: true }
      );
    }
    res.json({ message: `Creador ${isCreator ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('setUserCreator error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/adult
export const setUserAdult = async (req, res) => {
  try {
    const { userId, isAdult } = req.body;
    if (!userId || typeof isAdult !== 'boolean') return res.status(400).json({ error: 'Parámetros inválidos' });
    const { error } = await supabase.from('profiles').update({ is_adult_creator: isAdult }).eq('id', userId);
    if (error) throw error;
    res.json({ message: `Adulto ${isAdult ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('setUserAdult error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// DELETE /api/admin/users/:userId
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId requerido' });
    if (userId === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/withdrawals — listar solicitudes de retiro (descifra payout_details)
export const getWithdrawals = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select(`
        *,
        creator:profiles!creator_id(id, full_name, username, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withdrawals = (data || []).map(w => ({
      ...w,
      payout_details: decryptField(w.payout_details),
    }));

    res.json({ withdrawals });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/withdrawals/:id — aprobar/rechazar retiro
export const processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const { data: request } = await supabase
      .from('withdrawal_requests')
      .select('creator_id, amount_usd, status')
      .eq('id', id)
      .single();

    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });

    // Si se rechaza, devolver el balance
    if (status === 'rejected' && request.status === 'pending') {
      const { data: earnings } = await supabase
        .from('creator_earnings')
        .select('available_balance')
        .eq('creator_id', request.creator_id)
        .maybeSingle();

      if (earnings) {
        await supabase
          .from('creator_earnings')
          .update({ available_balance: parseFloat(earnings.available_balance) + parseFloat(request.amount_usd) })
          .eq('creator_id', request.creator_id);
      }
    }

    const { data: updated } = await supabase
      .from('withdrawal_requests')
      .update({ status, notes: notes || null, processed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    // Notificar al creador por email (fire-and-forget)
    if (status === 'approved' || status === 'rejected') {
      supabase.auth.admin.getUserById(request.creator_id).then(({ data }) => {
        const email = data?.user?.email;
        const name = data?.user?.user_metadata?.full_name || 'Creador';
        if (email) sendWithdrawalStatusEmail(email, name, parseFloat(request.amount_usd), status).catch(() => {});
      }).catch(() => {});
    }

    res.json({ withdrawal: updated });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/content-queue — posts pending moderation
export const getContentQueue = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, caption, media_url, media_type, is_adult, is_subscribers_only, status, moderation_notes, created_at,
        author:profiles!user_id(id, full_name, username, avatar_url, is_adult_creator)
      `)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    res.json({ posts: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/content/:postId — approve or reject a post
export const processContent = async (req, res) => {
  try {
    const { postId } = req.params;
    const { status, notes } = req.body;

    if (!['published', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const { data: post } = await supabase
      .from('posts').select('user_id, caption').eq('id', postId).single();

    const { error } = await supabase
      .from('posts')
      .update({ status, moderation_notes: notes || null })
      .eq('id', postId);

    if (error) throw error;

    if (post?.user_id) {
      const { createNotification } = await import('./inAppNotifController.js');
      const title = status === 'published' ? '✅ Contenido aprobado' : '❌ Contenido rechazado';
      const body = status === 'published'
        ? 'Tu publicación fue aprobada y está disponible'
        : `Tu publicación fue rechazada${notes ? `: ${notes}` : ''}`;
      createNotification(post.user_id, 'moderation', title, body, { post_id: postId }).catch(() => {});
    }

    res.json({ message: status === 'published' ? 'Post aprobado y publicado' : 'Post rechazado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/verifications — listar solicitudes de verificación
export const getVerifications = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('identity_verifications')
      .select(`
        *,
        user:profiles!user_id(id, full_name, username, avatar_url)
      `)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    res.json({ verifications: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/coins — ajustar balance de coins de un usuario
export const adjustUserCoins = async (req, res) => {
  try {
    const { userId, delta, reason } = req.body;
    if (!userId || typeof delta !== 'number' || delta === 0) {
      return res.status(400).json({ error: 'userId y delta (número ≠ 0) requeridos' });
    }
    const { data: profile } = await supabase
      .from('profiles').select('coins_balance').eq('id', userId).single();
    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' });

    const newBalance = Math.max(0, (profile.coins_balance || 0) + delta);
    const { error } = await supabase.from('profiles')
      .update({ coins_balance: newBalance }).eq('id', userId);
    if (error) throw error;

    await supabase.from('coin_transactions').insert({
      user_id: userId,
      amount: Math.abs(delta),
      type: delta > 0 ? 'admin_credit' : 'admin_debit',
      description: reason || (delta > 0 ? 'Ajuste admin (+)' : 'Ajuste admin (-)'),
    }).catch(() => {});

    res.json({ new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/shows/:id/end — terminar un show en vivo
export const endShow = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('live_shows')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Show terminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/admin/notifications/broadcast — push masiva a todos los usuarios
export const broadcastNotification = async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'title y body requeridos' });
    }
    const result = await sendBroadcastNotification(title.trim(), body.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/reports — listar denuncias de usuarios
export const getReports = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { data, error } = await supabase
      .from('reports')
      .select(`
        *,
        reporter:profiles!reporter_id(id, full_name, username, avatar_url),
        reported:profiles!reported_id(id, full_name, username, avatar_url, is_admin)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ reports: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/reports/:id — marcar reporte como revisado o descartado
export const processReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, banUser } = req.body;

    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: "status debe ser 'reviewed' o 'dismissed'" });
    }

    const { data: report } = await supabase
      .from('reports')
      .select('reported_id')
      .eq('id', id)
      .single();

    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    await supabase.from('reports').update({ status }).eq('id', id);

    if (banUser && status === 'reviewed') {
      await supabase.auth.admin.deleteUser(report.reported_id);
    }

    res.json({ message: status === 'reviewed' ? 'Reporte revisado' : 'Reporte descartado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/verifications/:id — aprobar/rechazar verificación
export const processVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const { data: verif } = await supabase
      .from('identity_verifications')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!verif) return res.status(404).json({ error: 'Verificación no encontrada' });

    await supabase
      .from('identity_verifications')
      .update({ status, notes: notes || null, reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (status === 'approved') {
      await supabase.from('profiles').update({ is_verified: true }).eq('id', verif.user_id);
    }

    res.json({ message: `Verificación ${status === 'approved' ? 'aprobada' : 'rechazada'}` });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
