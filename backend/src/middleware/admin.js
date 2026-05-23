import { supabase } from '../lib/supabase.js';

const ADMIN_IDS = process.env.ADMIN_USER_IDS
  ?.split(',').map(id => id.trim().toLowerCase()).filter(Boolean) || [];

export const isAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (profile?.is_admin) return next();

    if (ADMIN_IDS.length > 0) {
      if (ADMIN_IDS.includes(userId.toLowerCase())) return next();
      const { data: { user } } = await supabase.auth.admin.getUserById(userId);
      if (ADMIN_IDS.includes(user?.email?.toLowerCase())) return next();
    }

    return res.status(403).json({ error: 'Acceso denegado' });
  } catch {
    return res.status(500).json({ error: 'Error de autorización' });
  }
};
