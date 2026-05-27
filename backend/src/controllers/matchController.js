import { supabase } from '../lib/supabase.js';
import { sendPushToUser } from './notificationController.js';
import { sendMatchEmail } from '../lib/emailService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

const DAILY_LIKE_LIMIT = 50;

// POST /api/matches/like
export const likeProfile = async (req, res) => {
  try {
    const { targetUserId, isSuperLike = false } = req.body;
    const userId = req.user.id;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId requerido' });
    if (!isValidUUID(targetUserId)) return res.status(400).json({ error: 'targetUserId inválido' });
    if (targetUserId === userId) return res.status(400).json({ error: 'No puedes darte like a ti mismo' });

    // Obtener perfil del usuario (premium check)
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('premium_tier, full_name')
      .eq('id', userId)
      .single();

    const isPremium = myProfile?.premium_tier === 'premium' || myProfile?.premium_tier === 'vip';

    // Super like requiere Premium
    if (isSuperLike && !isPremium) {
      return res.status(403).json({ error: 'Los Super Likes son exclusivos para Premium', code: 'PREMIUM_REQUIRED' });
    }

    // Límite diario de likes para usuarios gratuitos
    if (!isPremium) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const today = new Date().toISOString().split('T')[0];

      const [{ count }, { data: bonusRow }] = await Promise.all([
        supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('user1_id', userId)
          .eq('user1_liked', true)
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('daily_bonus_likes')
          .select('bonus')
          .eq('user_id', userId)
          .eq('date', today)
          .single(),
      ]);

      const bonus = bonusRow?.bonus || 0;
      const effectiveLimit = DAILY_LIKE_LIMIT + bonus;

      if ((count || 0) >= effectiveLimit) {
        return res.status(429).json({
          error: 'Límite diario de likes alcanzado. Hazte Premium para likes ilimitados.',
          code: 'LIKE_LIMIT_REACHED',
          limit: effectiveLimit,
          remaining: 0,
        });
      }
    }

    const { data: existingMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('user1_id', targetUserId)
      .eq('user2_id', userId)
      .single();

    let isMatch = false;
    let matchId = null;

    if (existingMatch) {
      const { error } = await supabase
        .from('matches')
        .update({
          user2_liked: true,
          is_match: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', existingMatch.id);

      if (error) throw error;
      isMatch = true;
      matchId = existingMatch.id;
    } else {
      const { data: newMatch, error } = await supabase
        .from('matches')
        .insert({ user1_id: userId, user2_id: targetUserId, user1_liked: true, is_super_like: isSuperLike })
        .select('id')
        .single();

      if (error && error.code !== '23505') throw error;
      matchId = newMatch?.id || null;
    }

    if (isMatch) {
      sendPushToUser(targetUserId, {
        title: '¡Nuevo match! 💕',
        body: `${myProfile?.full_name || 'Alguien'} también te gustó. ¡Empieza a chatear!`,
        url: '/matches',
      }).catch(() => {});

      // Email de match al usuario que recibió el like (fire-and-forget)
      supabase.auth.admin.getUserById(targetUserId).then(({ data }) => {
        const targetEmail = data?.user?.email;
        const targetName = data?.user?.user_metadata?.full_name || 'Usuario';
        if (targetEmail) {
          sendMatchEmail(targetEmail, targetName, myProfile?.full_name || 'Alguien').catch(() => {});
        }
      }).catch(() => {});
    } else if (isSuperLike) {
      sendPushToUser(targetUserId, {
        title: '¡Tienes un Super Like! ⭐',
        body: `${myProfile?.full_name || 'Alguien'} te dio un Super Like`,
        url: '/matches',
      }).catch(() => {});
    }

    // Calcular likes restantes para usuarios gratuitos
    let remainingLikes = null;
    if (!isPremium) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStr = new Date().toISOString().split('T')[0];

      const [{ count: newCount }, { data: bonusRow2 }] = await Promise.all([
        supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('user1_id', userId)
          .eq('user1_liked', true)
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('daily_bonus_likes')
          .select('bonus')
          .eq('user_id', userId)
          .eq('date', todayStr)
          .single(),
      ]);

      const bonus2 = bonusRow2?.bonus || 0;
      remainingLikes = Math.max(0, DAILY_LIKE_LIMIT + bonus2 - (newCount || 0));
    }

    res.json({
      isMatch,
      matchId,
      message: isMatch ? '¡Es un match!' : isSuperLike ? '⭐ Super Like enviado' : 'Like enviado',
      remainingLikes,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/matches/dislike
export const dislikeProfile = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId requerido' });
    if (!isValidUUID(targetUserId)) return res.status(400).json({ error: 'targetUserId inválido' });

    const { error } = await supabase
      .from('matches')
      .insert({ user1_id: userId, user2_id: targetUserId, user1_liked: false });

    if (error && error.code !== '23505') throw error;

    res.json({ message: 'Dislike registrado' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/matches/likes/count — likes restantes hoy (para usuarios gratuitos)
export const getLikesCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', userId)
      .single();

    const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
    if (isPremium) {
      return res.json({ count: 0, limit: DAILY_LIKE_LIMIT, remaining: null });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = new Date().toISOString().split('T')[0];

    const [{ count }, { data: bonusRow }] = await Promise.all([
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('user1_id', userId)
        .eq('user1_liked', true)
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('daily_bonus_likes')
        .select('bonus')
        .eq('user_id', userId)
        .eq('date', today)
        .single(),
    ]);

    const used = count || 0;
    const bonus = bonusRow?.bonus || 0;
    const totalLimit = DAILY_LIKE_LIMIT + bonus;
    res.json({ count: used, limit: totalLimit, remaining: Math.max(0, totalLimit - used) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/matches
export const getMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: matches, error } = await supabase
      .from('matches')
      .select(`
        id,
        is_match,
        created_at,
        expires_at,
        user1_id,
        user2_id,
        user1:profiles!user1_id(id, full_name, avatar_url, is_premium, is_verified, last_active, country, language),
        user2:profiles!user2_id(id, full_name, avatar_url, is_premium, is_verified, last_active, country, language)
      `)
      .eq('is_match', true)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const normalized = matches?.map(m => {
      const other = m.user1_id === userId ? m.user2 : m.user1;
      const isOnline = other?.last_active
        ? (Date.now() - new Date(other.last_active).getTime()) < ONLINE_THRESHOLD_MS
        : false;
      return {
        id: m.id,
        created_at: m.created_at,
        expires_at: m.expires_at,
        other: { ...other, is_online: isOnline },
      };
    }) || [];

    if (normalized.length === 0) return res.json({ matches: [] });

    const matchIds = normalized.map(m => m.id);

    const { data: msgData } = await supabase
      .from('messages')
      .select('match_id, content, type, image_url, audio_url, created_at, sender_id, is_read')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false });

    const lastMsgMap = {};
    const unreadMap = {};

    (msgData || []).forEach(msg => {
      if (!lastMsgMap[msg.match_id]) {
        let preview = msg.content;
        if (msg.image_url) preview = '📷 Foto';
        else if (msg.type === 'voice') preview = '🎤 Mensaje de voz';
        lastMsgMap[msg.match_id] = {
          content: preview,
          created_at: msg.created_at,
          sender_id: msg.sender_id,
        };
      }
      if (!msg.is_read && msg.sender_id !== userId) {
        unreadMap[msg.match_id] = (unreadMap[msg.match_id] || 0) + 1;
      }
    });

    const result = normalized.map(m => {
      const hasMessages = !!lastMsgMap[m.id];
      const expiresAt = m.expires_at && !hasMessages ? m.expires_at : null;
      return {
        ...m,
        expires_at: expiresAt,
        last_message: lastMsgMap[m.id] || null,
        unread_count: unreadMap[m.id] || 0,
      };
    });

    result.sort((a, b) => {
      const aDate = a.last_message?.created_at || a.created_at;
      const bDate = b.last_message?.created_at || b.created_at;
      return new Date(bDate) - new Date(aDate);
    });

    res.json({ matches: result });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/matches/:matchId — devuelve un match concreto (para Chat.jsx)
export const getMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;

    const { data: m, error } = await supabase
      .from('matches')
      .select(`
        id, is_match, created_at, expires_at, user1_id, user2_id,
        user1:profiles!user1_id(id, full_name, avatar_url, is_premium, is_verified, last_active, country, language),
        user2:profiles!user2_id(id, full_name, avatar_url, is_premium, is_verified, last_active, country, language)
      `)
      .eq('id', matchId)
      .eq('is_match', true)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .maybeSingle();

    if (error) throw error;
    if (!m) return res.status(404).json({ error: 'Match no encontrado' });

    const other = m.user1_id === userId ? m.user2 : m.user1;
    const isOnline = other?.last_active
      ? (Date.now() - new Date(other.last_active).getTime()) < 5 * 60 * 1000
      : false;

    res.json({ match: { id: m.id, created_at: m.created_at, other: { ...other, is_online: isOnline } } });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/matches/likes/add — añade likes desbloqueados por anuncio (persiste en BD)
export const addBonusLikes = async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Math.min(parseInt(req.body.amount) || 10, 50); // max 50 por llamada

    const { data: profile } = await supabase
      .from('profiles')
      .select('premium_tier')
      .eq('id', userId)
      .single();

    const isPremiumUser = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
    if (isPremiumUser) return res.json({ remaining: null });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: used } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('user1_id', userId)
      .eq('user1_liked', true)
      .gte('created_at', todayStart.toISOString());

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('daily_bonus_likes')
      .select('bonus')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    const currentBonus = existing?.bonus || 0;
    // Máximo 1 recompensa de bonus por día (equivale a ver 1 anuncio)
    const MAX_DAILY_BONUS = 50;
    if (currentBonus >= MAX_DAILY_BONUS) {
      const totalLimit = DAILY_LIKE_LIMIT + currentBonus;
      return res.json({ remaining: Math.max(0, totalLimit - (used || 0)), bonus: currentBonus });
    }
    const newBonus = Math.min(currentBonus + amount, MAX_DAILY_BONUS);

    await supabase
      .from('daily_bonus_likes')
      .upsert({ user_id: userId, date: today, bonus: newBonus }, { onConflict: 'user_id,date' });

    const totalLimit = DAILY_LIKE_LIMIT + newBonus;
    const remaining = Math.max(0, totalLimit - (used || 0));

    res.json({ remaining, bonus: newBonus });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/matches/undo — deshacer el último swipe (solo premium)
export const undoLastSwipe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId requerido' });
    if (!isValidUUID(targetUserId)) return res.status(400).json({ error: 'targetUserId inválido' });

    // Solo Premium puede deshacer swipes — verificado en servidor
    const { data: me } = await supabase.from('profiles').select('premium_tier').eq('id', userId).single();
    const isPremium = me?.premium_tier === 'premium' || me?.premium_tier === 'vip';
    if (!isPremium) {
      return res.status(403).json({ error: 'Deshacer swipes es exclusivo Premium', code: 'PREMIUM_REQUIRED' });
    }

    // Case 1: user1_id = userId (user initiated the swipe)
    const { data: row1 } = await supabase
      .from('matches')
      .select('id, is_match')
      .eq('user1_id', userId)
      .eq('user2_id', targetUserId)
      .single();

    if (row1) {
      await supabase.from('matches').delete().eq('id', row1.id);
      return res.json({ undone: true });
    }

    // Case 2: user liked back on an existing record (user1_id = target, user2_id = userId)
    const { data: row2 } = await supabase
      .from('matches')
      .select('id')
      .eq('user1_id', targetUserId)
      .eq('user2_id', userId)
      .single();

    if (row2) {
      await supabase
        .from('matches')
        .update({ user2_liked: false, is_match: false })
        .eq('id', row2.id);
      return res.json({ undone: true });
    }

    res.json({ undone: false });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/matches/sent — likes/super likes que envié y aún no son match
export const getSentLikes = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: sent, error } = await supabase
      .from('matches')
      .select(`
        id,
        is_super_like,
        created_at,
        user2:profiles!user2_id(id, full_name, avatar_url, is_verified, age)
      `)
      .eq('user1_id', userId)
      .eq('user1_liked', true)
      .eq('is_match', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      sent: sent?.map(l => ({
        ...l.user2,
        match_id: l.id,
        is_super_like: l.is_super_like,
        sent_at: l.created_at,
      })) || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/matches/likes — quién me dio like (solo premium)
export const getWhoLikedMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: likes, error } = await supabase
      .from('matches')
      .select(`
        id,
        is_super_like,
        created_at,
        user1:profiles!user1_id(id, full_name, avatar_url, is_verified)
      `)
      .eq('user2_id', userId)
      .eq('user1_liked', true)
      .eq('is_match', false);

    if (error) throw error;

    res.json({
      likes: likes?.map(l => ({ ...l.user1, match_id: l.id, is_super_like: l.is_super_like })) || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
