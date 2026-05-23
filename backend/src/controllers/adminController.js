import { supabase } from '../lib/supabase.js';

const ADMIN_IDS = process.env.ADMIN_USER_IDS
  ?.split(',').map(id => id.trim().toLowerCase()).filter(Boolean) || [];

const checkAdmin = async (userId) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (profile?.is_admin) return true;

  if (ADMIN_IDS.length === 0) return false;
  if (ADMIN_IDS.includes(userId.toLowerCase())) return true;
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  return ADMIN_IDS.includes(user?.email?.toLowerCase());
};

// GET /api/admin/stats
export const getStats = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

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
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('is_match', true),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_premium', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_creator', true),
      supabase.from('live_shows').select('*', { count: 'exact', head: true }),
      supabase.from('creator_earnings').select('total_earned'),
      supabase.from('profiles').select('coins_balance'),
    ]);

    const total_earnings = (earnings || []).reduce((s, r) => s + parseFloat(r.total_earned || 0), 0);
    const coins_total = (coins || []).reduce((s, r) => s + (r.coins_balance || 0), 0);

    res.json({ stats: { users, matches, messages, premium, creators, shows, total_earnings, coins_total } });
  } catch (err) {
    console.error('getStats error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/users?page=0&q=
export const getUsers = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = 50;
    const q = req.query.q?.trim();

    let query = supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, is_premium, is_verified, is_creator, is_adult_creator, is_admin, coins_balance, created_at')
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
  try {
    const { userId, isPremium } = req.body;
    if (!userId || typeof isPremium !== 'boolean') return res.status(400).json({ error: 'Parámetros inválidos' });
    const { error } = await supabase.from('profiles').update({ is_premium: isPremium }).eq('id', userId);
    if (error) throw error;
    res.json({ message: `Premium ${isPremium ? 'activado' : 'desactivado'}` });
  } catch (err) {
    console.error('setUserPremium error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/verified
export const setUserVerified = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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

// GET /api/admin/withdrawals — listar solicitudes de retiro
export const getWithdrawals = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
  try {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select(`
        *,
        creator:profiles!creator_id(id, full_name, username, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ withdrawals: data || [] });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/withdrawals/:id — aprobar/rechazar retiro
export const processWithdrawal = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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

    res.json({ withdrawal: updated });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/content-queue — posts pending moderation
export const getContentQueue = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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

    // Notify creator
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
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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

// PATCH /api/admin/verifications/:id — aprobar/rechazar verificación
export const processVerification = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });
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
