import { supabase } from '../lib/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// GET /api/video/usage/today — video aleatorio es gratis e ilimitado para todos
export const getVideoUsageToday = async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('premium_tier').eq('id', req.user.id).single();
    res.json({
      count: 0,
      remaining: null,
      limit: null,
      is_premium: true,
      premium_tier: profile?.premium_tier || 'basic',
    });
  } catch {
    res.json({ count: 0, remaining: null, limit: null, is_premium: true });
  }
};

// POST /api/video/find-partner — videollamada aleatoria
export const findPartner = async (req, res) => {
  try {
    const userId = req.user.id;
    const { genderFilter, countryFilter } = req.body;

    const { data: profile } = await supabase.from('profiles').select('premium_tier').eq('id', userId).single();
    const isPremium = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';

    if (genderFilter && genderFilter !== 'any' && !isPremium) {
      return res.status(403).json({ error: 'El filtro de género es exclusivo Premium', code: 'PREMIUM_REQUIRED' });
    }

    let query = supabase
      .from('video_sessions')
      .select('*')
      .eq('status', 'waiting')
      .neq('user1_id', userId);

    if (genderFilter && genderFilter !== 'any') {
      query = query.eq('gender_filter', genderFilter);
    }
    if (countryFilter && countryFilter !== 'any') {
      // Match hosts who specifically want this country OR hosts from this country with no filter
      query = query.or(`country_filter.eq.${countryFilter},and(country_filter.eq.any,user1_country.eq.${countryFilter})`);
    }

    const { data: availableSessions } = await query.limit(5);

    if (availableSessions && availableSessions.length > 0) {
      const session = availableSessions[Math.floor(Math.random() * availableSessions.length)];

      const { data: updatedSession, error } = await supabase
        .from('video_sessions')
        .update({ user2_id: userId, status: 'active', started_at: new Date().toISOString() })
        .eq('id', session.id)
        .eq('status', 'waiting')
        .select()
        .single();

      if (error || !updatedSession) return createNewSession(userId, genderFilter, countryFilter, res);

      // Incluir info del partner (host) para mostrar su país/idioma
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('id, country, language, full_name, avatar_url')
        .eq('id', updatedSession.user1_id)
        .single();

      return res.json({
        sessionId: updatedSession.id,
        channelName: updatedSession.channel_name,
        role: 'guest',
        partner: partnerProfile || null,
      });
    }

    return createNewSession(userId, genderFilter, countryFilter, res);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

async function createNewSession(userId, genderFilter, countryFilter, res) {
  const channelName = `Destino TV_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('country')
    .eq('id', userId)
    .single();

  const { data: session, error } = await supabase
    .from('video_sessions')
    .insert({
      user1_id: userId,
      channel_name: channelName,
      status: 'waiting',
      gender_filter: genderFilter || 'any',
      country_filter: countryFilter || 'any',
      user1_country: hostProfile?.country || null,
    })
    .select()
    .single();

  if (error) throw error;

  res.json({ sessionId: session.id, channelName: session.channel_name, role: 'host', waiting: true });
}

// GET /api/video/online-count
export const getOnlineCount = async (req, res) => {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('video_sessions')
      .select('user1_id, user2_id')
      .in('status', ['waiting', 'active'])
      .gte('created_at', tenMinAgo);

    if (error) { res.json({ count: 0 }); return; }

    const uniqueUsers = new Set();
    data?.forEach(s => {
      if (s.user1_id) uniqueUsers.add(s.user1_id);
      if (s.user2_id) uniqueUsers.add(s.user2_id);
    });

    res.json({ count: uniqueUsers.size });
  } catch {
    res.json({ count: 0 });
  }
};

// GET /api/video/session/:sessionId/partner
export const getSessionPartner = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'sessionId inválido' });

    const { data: session } = await supabase
      .from('video_sessions')
      .select('user1_id, user2_id')
      .eq('id', sessionId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .single();

    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const partnerId = session.user1_id === userId ? session.user2_id : session.user1_id;
    if (!partnerId) return res.json({ partner: null });

    const { data: partnerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, country, language')
      .eq('id', partnerId)
      .single();

    res.json({ partner: partnerProfile || null });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/video/add-friend
export const sendFriendRequest = async (req, res) => {
  try {
    const { targetUserId, sessionId } = req.body;
    const userId = req.user.id;

    if (!targetUserId) return res.status(400).json({ error: 'targetUserId requerido' });
    if (!isValidUUID(targetUserId)) return res.status(400).json({ error: 'targetUserId inválido' });
    if (targetUserId === userId) return res.status(400).json({ error: 'No puedes agregarte a ti mismo' });

    // Verify both users participated in the session
    if (sessionId && isValidUUID(sessionId)) {
      const { data: session } = await supabase
        .from('video_sessions')
        .select('user1_id, user2_id')
        .eq('id', sessionId)
        .single();

      const valid = session && (
        (session.user1_id === userId && session.user2_id === targetUserId) ||
        (session.user2_id === userId && session.user1_id === targetUserId)
      );
      if (!valid) return res.status(403).json({ error: 'Sesión inválida' });
    }

    // Check existing match in both directions
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from('matches').select('id, is_match').eq('user1_id', userId).eq('user2_id', targetUserId).single(),
      supabase.from('matches').select('id, is_match').eq('user1_id', targetUserId).eq('user2_id', userId).single(),
    ]);

    if (sent?.is_match || received?.is_match) return res.json({ status: 'already_friends' });
    if (sent) return res.json({ status: 'sent', matchId: sent.id });

    // Target already sent us a request → accept it immediately
    if (received) {
      await supabase.from('matches')
        .update({ user2_liked: true, is_match: true, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', received.id);
      return res.json({ status: 'matched', matchId: received.id });
    }

    const { data: myProfile } = await supabase
      .from('profiles').select('full_name, avatar_url').eq('id', userId).single();

    const { data: newMatch } = await supabase
      .from('matches')
      .insert({ user1_id: userId, user2_id: targetUserId, user1_liked: true })
      .select('id').single();

    await supabase.from('in_app_notifications').insert({
      user_id: targetUserId,
      type: 'friend_request',
      title: `${myProfile?.full_name || 'Alguien'} quiere agregarte`,
      body: 'Se conocieron en video aleatorio',
      data: {
        from_user_id: userId,
        match_id: newMatch?.id,
        from_name: myProfile?.full_name,
        from_avatar: myProfile?.avatar_url,
      },
    });

    res.json({ status: 'sent', matchId: newMatch?.id });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /api/video/end-session
export const endSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return res.status(400).json({ error: 'sessionId inválido' });
    }

    await supabase
      .from('video_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .or(`user1_id.eq.${req.user.id},user2_id.eq.${req.user.id}`);

    res.json({ message: 'Sesión terminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

