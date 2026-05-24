import { getOrCreateRoom, getRoom, closeRoom } from '../lib/mediasoup.js';
import { supabase } from '../lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID  = (v) => UUID_RE.test(v);

// ── GET /api/rtc/rooms/:roomId/capabilities ───────────────────────────────────
export const getRtpCapabilities = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await getOrCreateRoom(roomId);
    res.json({ rtpCapabilities: room.rtpCapabilities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/rtc/rooms/:roomId/transport ─────────────────────────────────────
export const createTransport = async (req, res) => {
  try {
    const { roomId } = req.params;
    const peerId = req.user.id;
    const room   = await getOrCreateRoom(roomId);
    const peer   = room.getOrCreatePeer(peerId);
    const params = await peer.createTransport();

    // ICE servers for NAT traversal — clients use these to connect back to mediasoup.
    // When Railway blocks UDP ports, TURN relay over TCP is the fallback.
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (process.env.TURN_URL) {
      iceServers.push({
        urls:       process.env.TURN_URL,
        username:   process.env.TURN_USERNAME   || '',
        credential: process.env.TURN_CREDENTIAL || '',
      });
    }

    res.json({ ...params, iceServers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/rtc/rooms/:roomId/transport/:transportId/connect ────────────────
export const connectTransport = async (req, res) => {
  try {
    const { roomId, transportId } = req.params;
    const { dtlsParameters } = req.body;
    const peerId = req.user.id;

    const room = getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const peer = room.peers.get(peerId);
    if (!peer) return res.status(404).json({ error: 'Peer not found' });

    await peer.connectTransport(transportId, dtlsParameters);
    res.json({ connected: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/rtc/rooms/:roomId/transport/:transportId/produce ────────────────
export const produce = async (req, res) => {
  try {
    const { roomId, transportId } = req.params;
    const { kind, rtpParameters } = req.body;
    const peerId = req.user.id;

    const room = getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const peer = room.peers.get(peerId);
    if (!peer) return res.status(404).json({ error: 'Peer not found' });

    const producer = await peer.produce(transportId, kind, rtpParameters);

    // Notify other peers in the room that a new producer is available
    await supabase.channel(`room_events_${roomId}`).send({
      type: 'broadcast',
      event: 'new_producer',
      payload: { producerId: producer.id, peerId, kind },
    });

    res.json({ id: producer.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/rtc/rooms/:roomId/consume ───────────────────────────────────────
export const consume = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { transportId, producerId, rtpCapabilities } = req.body;
    const peerId = req.user.id;

    const room = getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const peer = room.peers.get(peerId);
    if (!peer) return res.status(404).json({ error: 'Peer not found' });

    const consumer = await peer.consume(transportId, producerId, rtpCapabilities);
    res.json({
      id:            consumer.id,
      producerId:    consumer.producerId,
      kind:          consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/rtc/rooms/:roomId/producers ──────────────────────────────────────
export const listProducers = async (req, res) => {
  try {
    const { roomId } = req.params;
    const peerId = req.user.id;
    const room   = getRoom(roomId);
    if (!room) return res.json({ producers: [] });
    res.json({ producers: room.getProducers(peerId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/rtc/call/:matchId/init — caller notifies callee ─────────────────
export const initiateCall = async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!isUUID(matchId)) return res.status(400).json({ error: 'matchId inválido' });

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

    // Broadcast incoming_call to the callee's personal channel
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

// ── POST /api/rtc/call/:matchId/reject — callee rejects ──────────────────────
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

// ── DELETE /api/rtc/rooms/:roomId/leave — peer exits room ────────────────────
export const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const peerId = req.user.id;

    const room = getRoom(roomId);
    if (room) {
      room.removePeer(peerId);
      if (room.isEmpty) closeRoom(roomId);

      await supabase.channel(`room_events_${roomId}`).send({
        type: 'broadcast',
        event: 'peer_left',
        payload: { peerId },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
