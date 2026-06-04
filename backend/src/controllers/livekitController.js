import { createToken } from '../lib/videoProvider.js';
import { supabase } from '../lib/supabase.js';

// Patrón de sala de show: show_ + 32 hex chars (UUID sin guiones)
const SHOW_ROOM_REGEX = /^show_([0-9a-f]{32})$/i;
// Patrón de sala privada/exclusive de show: show_<id>_priv_<viewerId>
const SHOW_PRIVATE_ROOM_REGEX = /^show_([0-9a-f]{32})_priv_([0-9a-f]{32})$/i;
// Patrón de sala de videollamada aleatoria: Destino TV_<16 hex>
const VIDEO_ROOM_REGEX = /^Destino TV_[a-f0-9]{1,64}$/i;

function hexToUuid(hex) {
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function assertRoomAccess(userId, roomName, requestedCanPublish) {
  // Sala privada de show: solo el host del show o el viewer aceptado de la
  // private_session pueden entrar. canPublish del viewer depende del type:
  // 'exclusive' (cam2cam) → publica · 'private' → solo subscribe.
  const privMatch = roomName.match(SHOW_PRIVATE_ROOM_REGEX);
  if (privMatch) {
    const showId = hexToUuid(privMatch[1]);
    const sessionViewerId = hexToUuid(privMatch[2]);

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, status, private_session')
      .eq('id', showId).single();
    if (!show) throw { status: 404, message: 'Show no encontrado' };
    if (show.status !== 'live') throw { status: 400, message: 'Show no está en vivo' };

    const sess = show.private_session;
    if (!sess || sess.viewer_id !== sessionViewerId) {
      throw { status: 403, message: 'No hay sesión privada activa para este room', code: 'PRIVATE_NOT_ACTIVE' };
    }

    if (userId === show.host_id) {
      // Host: siempre puede publicar
      return { allowedCanPublish: true };
    }
    if (userId === sessionViewerId) {
      // Viewer aceptado: publica solo si es cam2cam exclusive
      const allowedCanPublish = sess.type === 'exclusive';
      return { allowedCanPublish };
    }
    throw { status: 403, message: 'Sala privada — acceso denegado', code: 'PRIVATE_FORBIDDEN' };
  }

  // Sala de show — verificar ticket o ser host
  const showMatch = roomName.match(SHOW_ROOM_REGEX);
  if (showMatch) {
    const raw = showMatch[1];
    const showId = `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;

    const { data: show } = await supabase
      .from('live_shows')
      .select('host_id, ticket_price, status, category, private_session')
      .eq('id', showId)
      .single();

    if (!show) throw { status: 404, message: 'Show no encontrado' };

    // Host siempre tiene acceso
    if (show.host_id === userId) return;

    // Privado normal activo: solo allowed_viewers pueden entrar.
    // El countdown 'countdown' aún deja pasar (los viewers existentes ven
    // el overlay para comprar). El 'active' bloquea a los que no compraron.
    const ps = show.private_session;
    if (ps && ps.type === 'private' && ps.state === 'active') {
      const allowed = Array.isArray(ps.allowed_viewers) ? ps.allowed_viewers : [];
      if (!allowed.includes(userId)) {
        throw {
          status: 403,
          message: 'Show en modo privado · necesitas comprar ticket',
          code: 'PRIVATE_TICKET_REQUIRED',
        };
      }
    }

    // Co-host aceptado tiene acceso como publisher
    const { data: coHost } = await supabase
      .from('show_co_hosts')
      .select('status')
      .eq('show_id', showId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (coHost) return;

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

    const guard = await assertRoomAccess(req.user.id, roomName, canPublish);

    // Si la sala impone un canPublish (caso de sala privada), gana ese valor —
    // así un viewer no puede pedir token con canPublish=true para subir a
    // publisher en un room donde no lo permite.
    const effectiveCanPublish = guard && 'allowedCanPublish' in guard
      ? guard.allowedCanPublish
      : !!canPublish;

    const country = req.user?.country || null;
    const { token, wsUrl } = await createToken(req.user.id, roomName, {
      canPublish: effectiveCanPublish,
      country,
    });
    res.json({ token, wsUrl, canPublish: effectiveCanPublish });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('[livekit getToken] error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
