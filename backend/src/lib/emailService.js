import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Destino TV <no-reply@destino.app>';
const APP_URL = process.env.FRONTEND_URL || 'https://destino-sigma.vercel.app';

async function send(to, subject, html) {
  if (!resend) return; // sin API key: silencioso
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[emailService] error sending to', to, err?.message);
  }
}

// ── Plantillas ────────────────────────────────────────────────

function base(content) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5}
    .wrap{max-width:560px;margin:32px auto;background:#1a1a1a;border-radius:16px;overflow:hidden}
    .header{background:linear-gradient(135deg,#e040fb,#ff4081);padding:32px 24px;text-align:center}
    .header h1{margin:0;font-size:28px;font-weight:900;color:#fff}
    .header p{margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px}
    .body{padding:32px 24px}
    .btn{display:inline-block;margin:24px 0 0;padding:14px 32px;background:linear-gradient(135deg,#e040fb,#ff4081);color:#fff;font-weight:700;font-size:16px;text-decoration:none;border-radius:50px}
    .footer{padding:16px 24px;text-align:center;font-size:12px;color:#555;border-top:1px solid #2a2a2a}
    h2{color:#fff;font-size:22px;margin:0 0 12px}
    p{line-height:1.6;color:#aaa;margin:0 0 12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>💕 Destino TV</h1>
      <p>Encuentra tu Destino TV</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      © 2025 Destino TV · <a href="${APP_URL}" style="color:#e040fb;text-decoration:none">destino.app</a>
      · <a href="${APP_URL}/#/settings" style="color:#555">Gestionar notificaciones</a>
    </div>
  </div>
</body>
</html>`;
}

// Email de bienvenida al registrarse
export async function sendWelcomeEmail(email, name) {
  const html = base(`
    <h2>¡Bienvenido a Destino TV, ${name}! 🎉</h2>
    <p>Nos alegra que estés aquí. Tu cuenta ha sido creada con éxito.</p>
    <p>Completa tu perfil para empezar a conocer personas increíbles cerca de ti.</p>
    <a href="${APP_URL}/#/onboarding" class="btn">Completar mi perfil</a>
    <p style="margin-top:24px;font-size:13px">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
  `);
  await send(email, '¡Bienvenido a Destino TV! 💕', html);
}

// Notificación de nuevo match
export async function sendMatchEmail(email, userName, matchName) {
  const html = base(`
    <h2>¡Tienes un nuevo match! 💕</h2>
    <p>Hola ${userName}, <strong style="color:#e040fb">${matchName}</strong> también te gustó.</p>
    <p>Ahora pueden chatear y conocerse mejor. ¡No dejes pasar esta oportunidad!</p>
    <a href="${APP_URL}/#/matches" class="btn">Ver mis matches</a>
  `);
  await send(email, `¡${matchName} hizo match contigo! 💕`, html);
}

// Estado de retiro (procesado o rechazado)
export async function sendWithdrawalStatusEmail(email, name, amountUsd, status) {
  const isApproved = status === 'approved' || status === 'completed';
  const emoji = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'aprobado y en camino' : 'rechazado';
  const html = base(`
    <h2>${emoji} Tu retiro de $${amountUsd.toFixed(2)} fue ${statusText}</h2>
    <p>Hola ${name},</p>
    ${isApproved
      ? `<p>Tu retiro de <strong style="color:#e040fb">$${amountUsd.toFixed(2)} USD</strong> ha sido aprobado. El dinero llegará en 1–5 días hábiles dependiendo del método elegido.</p>`
      : `<p>Tu solicitud de retiro de <strong>$${amountUsd.toFixed(2)} USD</strong> fue rechazada. Si crees que es un error, contáctanos a <a href="mailto:${process.env.SUPPORT_EMAIL || 'soporte@destino.app'}" style="color:#e040fb">${process.env.SUPPORT_EMAIL || 'soporte@destino.app'}</a>.</p>`
    }
    <a href="${APP_URL}/#/creator/earnings" class="btn">Ver mis ganancias</a>
  `);
  await send(email, `${emoji} Retiro ${isApproved ? 'aprobado' : 'rechazado'} — $${amountUsd.toFixed(2)}`, html);
}

// Notificación de nuevo mensaje (opcional, no spam)
export async function sendNewMessageEmail(email, userName, senderName) {
  const html = base(`
    <h2>💬 Tienes un mensaje nuevo</h2>
    <p>Hola ${userName}, <strong style="color:#e040fb">${senderName}</strong> te escribió.</p>
    <a href="${APP_URL}/#/matches" class="btn">Leer mensaje</a>
    <p style="margin-top:16px;font-size:13px;color:#555">Puedes desactivar estas notificaciones desde Configuración.</p>
  `);
  await send(email, `${senderName} te escribió en Destino TV 💬`, html);
}
