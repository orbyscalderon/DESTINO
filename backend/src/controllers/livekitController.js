import { AccessToken } from 'livekit-server-sdk';

export const getToken = async (req, res) => {
  try {
    const { roomName, canPublish = true } = req.body;
    if (!roomName) return res.status(400).json({ error: 'roomName requerido' });

    const apiKey    = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'LiveKit no configurado' });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.user.id,
      ttl:      '2h',
    });

    at.addGrant({
      room:         roomName,
      roomJoin:     true,
      canPublish:   !!canPublish,
      canSubscribe: true,
    });

    const token  = await at.toJwt();
    const wsUrl  = process.env.LIVEKIT_URL;
    res.json({ token, wsUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
