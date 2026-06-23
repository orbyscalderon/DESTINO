import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { sendWelcomeEmail } from '../lib/emailService.js';
import { logLoginAttempt, checkLockout } from '../controllers/loginAttemptController.js';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// Envía email de bienvenida tras el registro — requiere autenticación para evitar spam
router.post('/welcome-email', authMiddleware, async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Datos requeridos' });
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Email inválido' });
  // Solo permite enviar al propio email del usuario autenticado
  if (req.user.email && req.user.email.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  sendWelcomeEmail(email, name).catch(() => {});
  res.json({ ok: true });
});

// Registro de aceptación de Terms/Privacy con versión + timestamp + IP.
// Cumple GDPR Art. 7 (consent auditable) + DSA Art. 14 (clarity).
// Auth opcional: el user pudo haber recién hecho signup y aún no estar logged.
const tosLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
router.post('/record-tos-acceptance', tosLimiter, async (req, res) => {
  try {
    const { tos_version, email } = req.body;
    if (!tos_version || typeof tos_version !== 'number') {
      return res.status(400).json({ error: 'tos_version requerido (number)' });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Buscar el user por email (puede no existir aún si signup async)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, accepted_tos_version')
      .ilike('email', email)
      .maybeSingle();

    if (!profile) {
      // No bloqueamos — el signup pudo crear el row después. Lo registramos
      // en audit_log como pending para reconciliar luego.
      logger.warn('tos acceptance recorded for non-existent profile', {
        email: email.toLowerCase(), tos_version,
      });
      return res.json({ ok: true, deferred: true });
    }

    await supabase.from('profiles').update({
      accepted_tos_version: tos_version,
      accepted_tos_at: new Date().toISOString(),
      accepted_tos_ip: req.ip,
    }).eq('id', profile.id);

    res.json({ ok: true });
  } catch (err) {
    logger.error('record-tos-acceptance failed', { err: err.message });
    res.status(500).json({ error: 'Error registrando aceptación' });
  }
});

// Account lockout: el frontend reporta cada intento de login
// (no requiere auth porque ocurre antes/durante login)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});
router.post('/log-attempt',   loginLimiter, logLoginAttempt);
router.get ('/check-lockout', loginLimiter, checkLockout);

export default router;
