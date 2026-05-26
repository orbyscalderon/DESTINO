import { createToken } from '../lib/videoProvider.js';

export const getToken = async (req, res) => {
  try {
    const { roomName, canPublish = true } = req.body;
    if (!roomName) return res.status(400).json({ error: 'roomName requerido' });

    const country = req.user?.country || null;
    const { token, wsUrl } = await createToken(req.user.id, roomName, { canPublish, country });
    res.json({ token, wsUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
