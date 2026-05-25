import { supabase } from '../lib/supabase.js';

export const requirePremium = async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', req.user.id)
      .single();
    const tier = data?.premium_tier || 'basic';
    if (tier === 'basic') {
      return res.status(403).json({ error: 'Se requiere Plan Premium o VIP', code: 'PREMIUM_REQUIRED' });
    }
    req.premium_tier = tier;
    next();
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const requireVip = async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', req.user.id)
      .single();
    if (data?.premium_tier !== 'vip') {
      return res.status(403).json({ error: 'Se requiere Plan VIP', code: 'VIP_REQUIRED' });
    }
    req.premium_tier = 'vip';
    next();
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const isPremiumTier = (tier) => tier === 'premium' || tier === 'vip';
export const isVipTier = (tier) => tier === 'vip';
