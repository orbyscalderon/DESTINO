import { supabase } from '../lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/rtc/call/:matchId/init — caller notifies callee, returns LiveKit roomId
export const initiateCall = async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!UUID_RE.test(matchId)) return res.status(400).json({ error: 'matchId inválido' });

    const callerId = req.user.id;
    const { data: caller } = await supabase
      .from('profiles')
      .select('is_premium, full_name, avatar_url')
      .eq('id', callerId)
      .single();

    if (!caller?.is_premium) {
      return res.status(403).json({ error: 'Llamadas directas son exclusivas Premium', code: 'PREMIUM_REQUIRED' });
    }

    const { data: match } = await supabase
      .from('matches')
      .select('user1_id, user2_id, is_match')
      .eq('id', matchId)
      .eq('is_match', true)
      .single();

    if (!match) return res.status(404).json({ error: 'Match no encontrado' });
    if (match.user1_id !== callerId && match.user2_id !== callerId) {
      return res.status(403).json({ error: 'No tienes acceso' });
    }

    const calleeId = match.user1_id === callerId ? match.user2_id : match.user1_id;
    const roomId   = `call_${matchId.replace(/-/g, '')}`;

    await supabase.channel(`incoming_${calleeId}`).send({
      type: 'broadcast',
      event: 'incoming_call',
      payload: {
        roomId,
        matchId,
        callerId,
        callerName:   caller.full_name,
        callerAvatar: caller.avatar_url,
      },
    });

    res.json({ roomId, calleeId });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/rtc/call/:matchId/reject — callee rejects before LiveKit join
export const rejectCall = async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId requerido' });

    await supabase.channel(`room_events_${roomId}`).send({
      type: 'broadcast',
      event: 'call_rejected',
      payload: { roomId },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
