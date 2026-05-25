import { supabase } from '../lib/supabase.js';

// Verifica que el usuario tenga suscripción premium activa
export const premiumMiddleware = async (req, res, next) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', req.user.id)
      .single();

    if (!profile?.premium_tier || profile.premium_tier === 'basic') {
      return res.status(403).json({
        error: 'Función exclusiva Premium',
        code: 'PREMIUM_REQUIRED',
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Error verificando suscripción' });
  }
};
