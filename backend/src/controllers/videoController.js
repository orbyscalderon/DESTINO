import { supabase } from '../lib/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const VIDEO_CALL_LIMIT = 5;

async function getVideoCallsToday(userId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ count: hostCount }, { count: guestCount }] = await Promise.all([
    supabase.from('video_sessions').select('*', { count: 'exact', head: true })
      .eq('user1_id', userId).gte('started_at', todayStart.toISOString()),
    supabase.from('video_sessions').select('*', { count: 'exact', head: true })
      .eq('user2_id', userId).gte('started_at', todayStart.toISOString()),
  ]);

  return (hostCount || 0) + (guestCount || 0);
}

// GET /api/video/usage/today
export const getVideoUsageToday = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('is_premium').eq('id', userId).single();
    const count = await getVideoCallsToday(userId);
    res.json({
      count,
      remaining: profile?.is_premium ? null : Math.max(0, VIDEO_CALL_LIMIT - count),
      limit: profile?.is_premium ? null : VIDEO_CALL_LIMIT,
      is_premium: !!profile?.is_premium,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/video/find-partner — videollamada aleatoria
export const findPartner = async (req, res) => {
  try {
    const userId = req.user.id;
    const { genderFilter, countryFilter } = req.body;

    const { data: profile } = await supabase.from('profiles').select('is_premium').eq('id', userId).single();

    if (genderFilter && genderFilter !== 'any' && !profile?.is_premium) {
      return res.status(403).json({ error: 'El filtro de género es exclusivo Premium', code: 'PREMIUM_REQUIRED' });
    }

    if (!profile?.is_premium) {
      const callsToday = await getVideoCallsToday(userId);
      if (callsToday >= VIDEO_CALL_LIMIT) {
        return res.status(403).json({
          error: 'Límite de videollamadas alcanzado',
          code: 'VIDEO_LIMIT_REACHED',
          remaining: 0,
        });
      }
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
      query = query.eq('country_filter', countryFilter);
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
        .select('country, language, full_name')
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
  const channelName = `destino_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

  const { data: session, error } = await supabase
    .from('video_sessions')
    .insert({
      user1_id: userId,
      channel_name: channelName,
      status: 'waiting',
      gender_filter: genderFilter || 'any',
      country_filter: countryFilter || 'any',
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

