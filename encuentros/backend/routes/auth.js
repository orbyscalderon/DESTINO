// Auth routes — magic link flow.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requestMagicLink, consumeMagicLink, authPublisher, logout } from '../lib/auth.js';

const router = Router();

// Más estricto que el general: 5 magic links / hora / IP — evita spam.
const linkLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

router.post('/magic-link', linkLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await requestMagicLink({
      email,
      ip: req.ip,
      ua: req.headers['user-agent']?.slice(0, 500),
    });
    // No revelamos si el email existe o no — siempre "sent: true" desde el cliente.
    res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Email inválido') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Error enviando link' });
  }
});

router.post('/callback', async (req, res) => {
  try {
    const { token } = req.body || {};
    const session = await consumeMagicLink({
      token,
      ip: req.ip,
      ua: req.headers['user-agent']?.slice(0, 500),
    });
    res.json(session);
  } catch (err) {
    res.status(401).json({ error: err.message || 'Token inválido' });
  }
});

router.get('/me', authPublisher, async (req, res) => {
  // Sanitize antes de enviar
  const p = req.publisher;
  res.json({
    publisher: {
      id: p.id,
      email: p.email,
      email_verified_at: p.email_verified_at,
      identity_verified: p.identity_verified,
      status: p.status,
      created_at: p.created_at,
    },
  });
});

router.post('/logout', authPublisher, async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) await logout({ token });
  res.json({ ok: true });
});

export default router;
