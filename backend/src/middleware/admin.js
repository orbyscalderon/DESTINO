import { supabase } from '../lib/supabase.js';
import { SUPER_ADMIN_EMAIL } from '../lib/constants.js';
import { logError } from '../lib/logger.js';

const ADMIN_IDS = process.env.ADMIN_USER_IDS
  ?.split(',').map(id => id.trim().toLowerCase()).filter(Boolean) || [];

export const isAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email?.toLowerCase();
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    // CRÍTICO: super admin hardcoded (no se puede revocar desde DB)
    if (userEmail === SUPER_ADMIN_EMAIL) return next();

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (profile?.is_admin) return next();

    if (ADMIN_IDS.length > 0) {
      if (ADMIN_IDS.includes(userId.toLowerCase())) return next();
      if (userEmail && ADMIN_IDS.includes(userEmail)) return next();
    }

    return res.status(403).json({ error: 'Acceso denegado' });
  } catch (err) {
    logError('isAdmin', err);
    return res.status(500).json({ error: 'Error de autorización' });
  }
};
