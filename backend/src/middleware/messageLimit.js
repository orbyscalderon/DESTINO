import { supabase } from '../lib/supabase.js';

const DAILY_LIMIT = 10; // Mensajes gratis por día

// Verifica el límite diario de mensajes para usuarios gratuitos
export const messageLimitMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Usuarios premium tienen chat ilimitado
    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', userId)
      .single();

    if (profile?.premium_tier && profile.premium_tier !== 'basic') return next();

    const today = new Date().toISOString().split('T')[0];

    const { data: counter } = await supabase
      .from('daily_message_count')
      .select('count')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    const currentCount = counter?.count || 0;

    if (currentCount >= DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Límite diario de mensajes alcanzado',
        code: 'MESSAGE_LIMIT_REACHED',
        limit: DAILY_LIMIT,
        remaining: 0,
      });
    }

    // Inyecta el contador actual para usarlo en el controlador
    req.messageCount = currentCount;
    req.remainingMessages = DAILY_LIMIT - currentCount - 1;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Error verificando límite de mensajes' });
  }
};
