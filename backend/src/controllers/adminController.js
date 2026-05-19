import { supabase } from '../lib/supabase.js';

const ADMIN_IDS = process.env.ADMIN_USER_IDS
  ?.split(',').map(id => id.trim().toLowerCase()).filter(Boolean) || [];

const checkAdmin = async (userId) => {
  if (ADMIN_IDS.length === 0) return false;
  if (ADMIN_IDS.includes(userId.toLowerCase())) return true;
  // Support email-based admin IDs
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
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('is_match', true),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_premium', true),
    ]);

    res.json({ stats: { users, matches, messages, premium } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/admin/users?page=0
export const getUsers = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = 50;

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, is_premium, is_verified, created_at')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) throw error;

    res.json({ users: users || [] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/premium
export const setUserPremium = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

  try {
    const { userId, isPremium } = req.body;

    if (!userId || typeof isPremium !== 'boolean') {
      return res.status(400).json({ error: 'userId e isPremium (boolean) requeridos' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_premium: isPremium })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Premium ${isPremium ? 'activado' : 'desactivado'}` });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/admin/users/verified
export const setUserVerified = async (req, res) => {
  if (!await checkAdmin(req.user.id)) return res.status(403).json({ error: 'Acceso denegado' });

  try {
    const { userId, isVerified } = req.body;

    if (!userId || typeof isVerified !== 'boolean') {
      return res.status(400).json({ error: 'userId e isVerified (boolean) requeridos' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_verified: isVerified })
      .eq('id', userId);

    if (error) throw error;

    res.json({ message: `Verificado ${isVerified ? 'activado' : 'desactivado'}` });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
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
