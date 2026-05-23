import { supabase } from '../lib/supabase.js';
import { addCoins } from './coinController.js';

const REFERRAL_REWARD_COINS = 50; // coins para el referidor cuando el referido hace su primer depósito

function generateCode(userId) {
  // 6 chars alfanuméricos derivados del userId
  return userId.replace(/-/g, '').substring(0, 6).toUpperCase();
}

// GET /api/referrals/code — obtener (o crear) el código del usuario
export const getMyCode = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, full_name')
      .eq('id', userId)
      .single();

    let code = profile?.referral_code;

    if (!code) {
      // Generar código único
      let attempt = generateCode(userId);
      let suffix = 0;
      while (true) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', attempt)
          .maybeSingle();
        if (!existing) { code = attempt; break; }
        suffix++;
        attempt = generateCode(userId) + suffix;
      }

      await supabase
        .from('profiles')
        .update({ referral_code: code })
        .eq('id', userId);
    }

    // Contar referidos
    const { count } = await supabase
      .from('referral_uses')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', userId);

    const { count: rewarded } = await supabase
      .from('referral_uses')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('rewarded', true);

    res.json({
      code,
      share_url: `${process.env.FRONTEND_URL || 'https://destino.app'}/?ref=${code}`,
      total_referrals: count || 0,
      rewarded_referrals: rewarded || 0,
      coins_earned: (rewarded || 0) * REFERRAL_REWARD_COINS,
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/referrals/apply — aplicar un código de referido
export const applyCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code?.trim()) return res.status(400).json({ error: 'Código requerido' });

    // Verificar que el usuario no tenga ya un referido
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('referred_by, referral_code')
      .eq('id', userId)
      .single();

    if (myProfile?.referred_by) {
      return res.status(400).json({ error: 'Ya usaste un código de referido' });
    }

    // No puedes usar tu propio código
    if (myProfile?.referral_code === code.toUpperCase()) {
      return res.status(400).json({ error: 'No puedes usar tu propio código' });
    }

    // Buscar el dueño del código
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('referral_code', code.toUpperCase())
      .maybeSingle();

    if (!referrer) return res.status(404).json({ error: 'Código inválido o no encontrado' });

    // Registrar el uso
    await supabase.from('profiles').update({ referred_by: referrer.id }).eq('id', userId);
    await supabase.from('referral_uses').insert({ referrer_id: referrer.id, referred_id: userId });

    res.json({ message: `Código aplicado. Tu referidor es ${referrer.full_name}` });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Llamar desde coinController cuando el usuario hace su primer depósito
export const rewardReferrer = async (referredId) => {
  try {
    const { data: use } = await supabase
      .from('referral_uses')
      .select('id, referrer_id, rewarded')
      .eq('referred_id', referredId)
      .maybeSingle();

    if (!use || use.rewarded) return;

    await addCoins(use.referrer_id, REFERRAL_REWARD_COINS, 'bonus', 'Bono de referido');
    await supabase.from('referral_uses').update({ rewarded: true }).eq('id', use.id);
  } catch {}
};
