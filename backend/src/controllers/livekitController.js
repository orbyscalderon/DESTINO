import { createToken } from '../lib/videoProvider.js';
import { supabase } from '../lib/supabase.js';

// Patrón de sala de show: show_ + 32 hex chars (UUID sin guiones)
const SHOW_ROOM_REGEX = /^show_([0-9a-f]{32})$/i;
// Patrón de sala de videollamada aleatoria: Destino TV_<16 hex>
const VIDEO_ROOM_REGEX = /^Destino TV_[a-f0-9]{1,64}$/i;

async function assertRoomAccess(userId, roomName) {
  // Sala de show — verificar ticket o ser host
  const showMatch = roomName.match(SHOW_ROOM_REGEX);
  if (showMatch) {
    const raw = showMatch[1];
    const showId = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, ticket_price, status, category')
      .eq('id', showId)
      .single();

    if (!show) throw { status: 404, message: 'Show no encontrado' };

    // Host siempre tiene acceso
    if (show.host_id === userId) return;

    // Shows de pago: verificar ticket activo
    if (show.ticket_price > 0) {
      const { data: ticket } = await supabase
        .from('show_tickets')
        .select('id')
        .eq('show_id', showId)
        .eq('buyer_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!ticket) throw { status: 403, message: 'Ticket requerido para este show', code: 'TICKET_REQUIRED' };
    }

    // Shows adultos: verificar verificación de edad
    if (show.category === 'adult') {
      const { data: vp } = await supabase
        .from('profiles')
        .select('is_adult_creator, age_verified_at, premium_tier')
        .eq('id', userId)
        .single();
      const canSeeAdult = vp?.is_adult_creator || vp?.age_verified_at || vp?.premium_tier === 'vip';
      if (!canSeeAdult) throw { status: 403, message: 'Verificación de edad requerida', code: 'AGE_VERIFICATION_REQUIRED' };
    }

    return;
  }

  // Sala de videollamada — verificar que el usuario es participante activo
  if (VIDEO_ROOM_REGEX.test(roomName)) {
    const { data: session } = await supabase
      .from('video_sessions')
      .select('id')
      .eq('channel_name', roomName)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .in('status', ['waiting', 'active'])
      .maybeSingle();

    if (!session) throw { status: 403, message: 'No tienes acceso a esta sala', code: 'ACCESS_DENIED' };
    return;
  }

  // Sala desconocida — denegar por defecto
  throw { status: 403, message: 'roomName no válido', code: 'INVALID_ROOM' };
}

export const getToken = async (req, res) => {
  try {
    const { roomName, canPublish = true } = req.body;
    if (!roomName) return res.status(400).json({ error: 'roomName requerido' });

    await assertRoomAccess(req.user.id, roomName);

    const country = req.user?.country || null;
    const { token, wsUrl } = await createToken(req.user.id, roomName, { canPublish, country });
    res.json({ token, wsUrl });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
