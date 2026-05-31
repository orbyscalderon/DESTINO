import { supabase } from '../lib/supabase.js';
import { addCoins } from './coinController.js';
import { createNotification } from './inAppNotifController.js';

// XP por nivel: lvl 2 = 100, lvl 3 = 300, lvl 4 = 600, lvl N = 100 * (N-1) * N / 2
export const xpForLevel = (lvl) => Math.round(100 * (lvl - 1) * lvl / 2);
export const levelFromXp = (xp) => {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
};

// Concede un achievement al usuario (idempotente).
// Retorna true si fue nuevo, false si ya lo tenía.
export async function grantAchievement(userId, achievementId) {
  try {
    const { data: existing } = await supabase
      .from('user_achievements')
      .select('user_id')
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .maybeSingle();
    if (existing) return false;

    const { data: ach } = await supabase
      .from('achievements')
      .select('name, xp_reward, coin_reward, icon')
      .eq('id', achievementId)
      .single();
    if (!ach) return false;

    await supabase.from('user_achievements').insert({
      user_id: userId,
      achievement_id: achievementId,
    });

    if (ach.xp_reward > 0) await addXP(userId, ach.xp_reward);
    if (ach.coin_reward > 0) await addCoins(userId, ach.coin_reward, 'bonus', `achievement:${achievementId}`).catch(() => {});

    await createNotification(
      userId,
      'achievement',
      `${ach.icon || '🏆'} ¡Logro desbloqueado!`,
      `${ach.name}${ach.xp_reward ? ` (+${ach.xp_reward} XP)` : ''}${ach.coin_reward ? ` +${ach.coin_reward} coins` : ''}`,
      { achievement_id: achievementId }
    ).catch(() => {});

    return true;
  } catch (err) {
    console.error('grantAchievement error:', err.message);
    return false;
  }
}

// Suma XP y sube de nivel si corresponde
export async function addXP(userId, amount) {
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('xp_points, user_level')
      .eq('id', userId)
      .single();

    const newXp = (prof?.xp_points || 0) + amount;
    const newLevel = levelFromXp(newXp);
    const oldLevel = prof?.user_level || 1;

    await supabase.from('profiles')
      .update({ xp_points: newXp, user_level: newLevel })
      .eq('id', userId);

    if (newLevel > oldLevel) {
      await createNotification(
        userId, 'level_up',
        `⬆️ ¡Nivel ${newLevel}!`,
        `Subiste al nivel ${newLevel}. ¡Sigue así!`,
        { level: newLevel }
      ).catch(() => {});
    }
  } catch (err) {
    console.error('addXP error:', err.message);
  }
}

// GET /api/achievements — catálogo público con estado del usuario
export const getAchievements = async (req, res) => {
  try {
    const userId = req.user.id;
    const [{ data: catalog }, { data: earned }] = await Promise.all([
      supabase.from('achievements').select('*').order('rarity', { ascending: true }),
      supabase.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
    ]);

    const earnedMap = new Map((earned || []).map(e => [e.achievement_id, e.earned_at]));
    const result = (catalog || []).map(a => ({
      ...a,
      earned: earnedMap.has(a.id),
      earned_at: earnedMap.get(a.id) || null,
    }));

    const { data: prof } = await supabase
      .from('profiles')
      .select('xp_points, user_level, active_badge')
      .eq('id', userId)
      .single();

    const currentLevel = prof?.user_level || 1;
    const xp = prof?.xp_points || 0;
    res.json({
      achievements: result,
      stats: {
        xp,
        level: currentLevel,
        xp_for_current_level: xpForLevel(currentLevel),
        xp_for_next_level: xpForLevel(currentLevel + 1),
        xp_progress: xp - xpForLevel(currentLevel),
        xp_needed: xpForLevel(currentLevel + 1) - xp,
        active_badge: prof?.active_badge || null,
        earned_count: earnedMap.size,
        total_count: result.length,
      },
    });
  } catch (err) {
    console.error('getAchievements error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/achievements/badge — activar un achievement como badge visible
export const setActiveBadge = async (req, res) => {
  try {
    const { achievement_id } = req.body;
    if (achievement_id !== null) {
      const { data: earned } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('user_id', req.user.id)
        .eq('achievement_id', achievement_id)
        .maybeSingle();
      if (!earned) return res.status(403).json({ error: 'No has ganado este logro' });
    }
    await supabase.from('profiles')
      .update({ active_badge: achievement_id })
      .eq('id', req.user.id);
    res.json({ success: true, active_badge: achievement_id });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/achievements/user/:userId — públicos de otro usuario
export const getUserAchievements = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: earned } = await supabase
      .from('user_achievements')
      .select('achievement_id, earned_at, achievement:achievements(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    const { data: prof } = await supabase
      .from('profiles')
      .select('xp_points, user_level, active_badge')
      .eq('id', userId)
      .single();

    res.json({
      achievements: (earned || []).map(e => ({ ...e.achievement, earned_at: e.earned_at })),
      stats: {
        level: prof?.user_level || 1,
        xp: prof?.xp_points || 0,
        active_badge: prof?.active_badge || null,
      },
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
