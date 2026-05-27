import { Router } from 'express';
import { sendWelcomeEmail } from '../lib/emailService.js';

const router = Router();

// Verifica token de Cloudflare Turnstile antes del registro/login
router.post('/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return res.json({ success: true }); // bypass si no está configurado

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: req.ip }),
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: 'Verificación de seguridad fallida. Intenta de nuevo.' });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Error al verificar seguridad' });
  }
});

// Envía email de bienvenida tras el registro (llamado desde el frontend)
router.post('/welcome-email', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Datos requeridos' });
  // Fire-and-forget — no bloqueamos al usuario si falla el email
  sendWelcomeEmail(email, name).catch(() => {});
  res.json({ ok: true });
});

export default router;
