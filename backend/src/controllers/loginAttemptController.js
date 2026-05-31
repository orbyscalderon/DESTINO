import { supabase } from '../lib/supabase.js';

const MAX_FAILED_ATTEMPTS    = 5;
const LOCKOUT_DURATION_MIN   = 15;
const ATTEMPT_WINDOW_MIN     = 15;

// POST /api/auth/log-attempt — el frontend reporta cada intento de login
// Body: { email, success: boolean }
// Devuelve { locked, locked_until?, attempts_remaining }
export const logLoginAttempt = async (req, res) => {
  try {
    const { email, success } = req.body;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const normalizedEmail = email.trim().toLowerCase();
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    // Verificar si ya está bloqueado
    const { data: lockout } = await supabase
      .from('account_lockouts')
      .select('locked_until, attempt_count')
      .eq('email', normalizedEmail)
      .single();

    if (lockout && new Date(lockout.locked_until) > new Date()) {
      const lockedMinutes = Math.ceil((new Date(lockout.locked_until) - new Date()) / 60000);
      return res.json({
        locked: true,
        locked_until: lockout.locked_until,
        message: `Cuenta bloqueada por ${lockedMinutes} minutos por demasiados intentos fallidos.`,
      });
    }

    // Registrar el intento
    await supabase.from('login_attempts').insert({
      email: normalizedEmail,
      ip_address: ip,
      user_agent: req.headers['user-agent'] || null,
      success: !!success,
    });

    if (success) {
      // Login exitoso: limpiar bloqueo
      await supabase.from('account_lockouts').delete().eq('email', normalizedEmail);
      return res.json({ locked: false, attempts_remaining: MAX_FAILED_ATTEMPTS });
    }

    // Login fallido: contar intentos en la ventana
    const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .eq('success', false)
      .gte('created_at', windowStart);

    const failedCount = count || 0;
    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - failedCount);

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000).toISOString();
      await supabase.from('account_lockouts').upsert({
        email: normalizedEmail,
        locked_until: lockedUntil,
        attempt_count: failedCount,
        reason: 'too_many_failed_attempts',
      }, { onConflict: 'email' });

      return res.json({
        locked: true,
        locked_until: lockedUntil,
        message: `Cuenta bloqueada por ${LOCKOUT_DURATION_MIN} minutos. Demasiados intentos fallidos.`,
      });
    }

    res.json({
      locked: false,
      attempts_remaining: remaining,
      warning: remaining <= 2 ? `${remaining} intentos restantes antes del bloqueo.` : null,
    });
  } catch (err) {
    console.error('logLoginAttempt error:', err.message);
    // En caso de error, NO bloquear — better safe than sorry
    res.json({ locked: false, attempts_remaining: MAX_FAILED_ATTEMPTS });
  }
};

// GET /api/auth/check-lockout?email=...
export const checkLockout = async (req, res) => {
  try {
    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email) return res.json({ locked: false });

    const { data: lockout } = await supabase
      .from('account_lockouts')
      .select('locked_until')
      .eq('email', email)
      .single();

    if (lockout && new Date(lockout.locked_until) > new Date()) {
      return res.json({ locked: true, locked_until: lockout.locked_until });
    }
    res.json({ locked: false });
  } catch {
    res.json({ locked: false });
  }
};
