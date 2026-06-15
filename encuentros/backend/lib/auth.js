// Auth de publishers — magic link sin password.
// El frontend pide magic link, backend envía email con token.
// Click en el link → backend valida → crea session → devuelve session token (cookie httpOnly o body).
//
// Tokens: sha256 hash en DB. El plain solo viaja en el email + en la respuesta del callback.
// Sesión: 30 días, rotación opcional, revocable desde dashboard.

import crypto from 'crypto';
import { supabase } from './supabase.js';
import { sendMail } from './email.js';
import { logAudit } from './audit.js';

const MAGIC_LINK_TTL_MIN = 15;
const SESSION_TTL_DAYS = 30;

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Genera magic link y lo envía al email. Si el publisher no existe, lo crea
// (pendiente de verificación de identidad).
export async function requestMagicLink({ email, ip, ua }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    throw new Error('Email inválido');
  }

  // Check blocklist
  const { data: blocked } = await supabase
    .from('encuentros_blocklist')
    .select('id')
    .eq('type', 'email')
    .eq('value', cleanEmail)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (blocked) {
    // No reveles "bloqueado" — falla silencioso (devuelve éxito pero no envía).
    return { sent: false, blocked: true };
  }

  // Find or create publisher
  let { data: publisher } = await supabase
    .from('encuentros_publishers')
    .select('id, email, status')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (!publisher) {
    const { data: created, error } = await supabase
      .from('encuentros_publishers')
      .insert({
        email: cleanEmail,
        status: 'pending_verification',
        ip_at_signup: ip,
        ua_at_signup: ua,
      })
      .select('id, email, status')
      .single();
    if (error) throw error;
    publisher = created;
  }

  if (publisher.status === 'banned' || publisher.status === 'deleted') {
    return { sent: false, blocked: true };
  }

  // Generate magic link token
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

  await supabase.from('encuentros_magic_links').insert({
    token_hash: tokenHash,
    publisher_id: publisher.id,
    email: cleanEmail,
    expires_at: expiresAt.toISOString(),
    ip,
    ua,
  });

  // Send email — el frontend public URL lo configura via FRONTEND_PUBLIC_URL
  const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5180';
  const magicUrl = `${frontendUrl}/#/auth/callback?token=${token}`;

  await sendMail({
    to: cleanEmail,
    template: 'magic_link',
    subject: 'Tu link de acceso a encuentros',
    html: `
      <h2>Tu acceso a encuentros</h2>
      <p>Click este link para acceder. Expira en ${MAGIC_LINK_TTL_MIN} minutos:</p>
      <p><a href="${magicUrl}" style="background:#f59e0b;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Acceder</a></p>
      <p style="font-size:12px;color:#999">Si no pediste este link, ignorá este email. Tu cuenta no será afectada.</p>
      <p style="font-size:12px;color:#999">IP: ${ip || 'unknown'}</p>
    `,
    metadata: { publisher_id: publisher.id, kind: 'magic_link' },
  });

  return { sent: true };
}

// Valida magic link token y crea session.
export async function consumeMagicLink({ token, ip, ua }) {
  if (!token || typeof token !== 'string') throw new Error('Token inválido');
  const tokenHash = sha256(token);

  const { data: link } = await supabase
    .from('encuentros_magic_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!link) throw new Error('Link inválido o expirado');
  if (link.used_at) throw new Error('Link ya usado');
  if (new Date(link.expires_at) < new Date()) throw new Error('Link expirado');

  // Mark as used (single-use)
  await supabase.from('encuentros_magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  // Mark email_verified en el publisher
  await supabase.from('encuentros_publishers')
    .update({
      email_verified_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      last_login_ip: ip,
    })
    .eq('id', link.publisher_id);

  // Crear session
  const sessionToken = randomToken(48);
  const sessionHash = sha256(sessionToken);
  const sessionExp = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000);

  await supabase.from('encuentros_sessions').insert({
    token_hash: sessionHash,
    publisher_id: link.publisher_id,
    expires_at: sessionExp.toISOString(),
    ip,
    ua,
  });

  await logAudit({
    actor_type: 'publisher',
    actor_id: link.publisher_id,
    action: 'auth.login',
    target_type: 'publisher',
    target_id: link.publisher_id,
    ip, ua,
  });

  return {
    session_token: sessionToken,
    expires_at: sessionExp.toISOString(),
    publisher_id: link.publisher_id,
  };
}

// Middleware: lee session token de Authorization Bearer o cookie y resuelve publisher.
export async function authPublisher(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const token = bearer || req.cookies?.enc_session;
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const tokenHash = sha256(token);
    const { data: session } = await supabase
      .from('encuentros_sessions')
      .select('*, publisher:encuentros_publishers(*)')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!session) return res.status(401).json({ error: 'Sesión inválida' });
    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Sesión expirada' });
    }
    if (!session.publisher || session.publisher.status !== 'active' && session.publisher.status !== 'pending_verification') {
      return res.status(403).json({ error: 'Cuenta no activa' });
    }

    // Touch last_used_at (best-effort)
    supabase.from('encuentros_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .then(() => {}, () => {});

    req.publisher = session.publisher;
    req.session = session;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

export async function logout({ token }) {
  if (!token) return;
  const tokenHash = sha256(token);
  await supabase.from('encuentros_sessions').delete().eq('token_hash', tokenHash);
}

export { sha256, randomToken };
