import { Resend } from 'resend';
import { escapeHtml } from './helpers.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Destino TV <no-reply@destino.app>';
const APP_URL = process.env.FRONTEND_URL || 'https://destino-sigma.vercel.app';

// Helper local para usar en templates (más conciso). Aplicar a TODA
// interpolación de strings provenientes de usuarios (nombres, mensajes).
const _e = escapeHtml;

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
    <h2>¡Bienvenido a Destino TV, ${_e(name)}! 🎉</h2>
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
    <p>Hola ${_e(userName)}, <strong style="color:#e040fb">${_e(matchName)}</strong> también te gustó.</p>
    <p>Ahora pueden chatear y conocerse mejor. ¡No dejes pasar esta oportunidad!</p>
    <a href="${APP_URL}/#/matches" class="btn">Ver mis matches</a>
  `);
  await send(email, `¡${_e(matchName)} hizo match contigo! 💕`, html);
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
    <p>Hola ${_e(userName)}, <strong style="color:#e040fb">${_e(senderName)}</strong> te escribió.</p>
    <a href="${APP_URL}/#/matches" class="btn">Leer mensaje</a>
    <p style="margin-top:16px;font-size:13px;color:#555">Puedes desactivar estas notificaciones desde Configuración.</p>
  `);
  await send(email, `${senderName} te escribió en Destino TV 💬`, html);
}

// ── Fuck Now Spotlight emails ────────────────────────────────────────

async function getUserEmail(userId) {
  try {
    const { supabase } = await import('./supabase.js');
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email_prefs')
      .eq('id', userId)
      .single();
    // El email no está en profiles — viene de auth.users via getUserById
    const { data: user } = await supabase.auth.admin.getUserById(userId);
    return { email: user?.user?.email, name: data?.full_name || 'Creator' };
  } catch {
    return null;
  }
}

export async function sendSpotlightActivatedEmail(userId, expiresAt) {
  const u = await getUserEmail(userId);
  if (!u?.email) return;
  const expDate = new Date(expiresAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = base(`
    <h2>⚡ Tu Spotlight está activo</h2>
    <p>Hola ${_e(u.name)},</p>
    <p>Acabás de activar tu perfil en el directorio <strong style="color:#ff8800">Fuck Now Spotlight</strong>. A partir de ahora vas a aparecer en el directorio para todos los usuarios verificados.</p>
    <p><strong>Tu Spotlight expira el ${expDate}</strong>. Te avisaremos 3 días antes para que puedas renovarlo.</p>
    <p style="background:#2a1a08;padding:12px;border-left:3px solid #ff8800;font-size:13px">
      Recordá: no podés publicar tarifas por servicios físicos, contacto externo, ni dirección. El contenido se modera automáticamente.
    </p>
    <a href="${APP_URL}/#/adult?tab=ahora" class="btn">Ver el directorio</a>
  `);
  await send(u.email, '⚡ Spotlight activado en Destino TV', html);
}

export async function sendSpotlightRenewedEmail(userId, expiresAt) {
  const u = await getUserEmail(userId);
  if (!u?.email) return;
  const expDate = new Date(expiresAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = base(`
    <h2>✨ Spotlight renovado</h2>
    <p>Hola ${_e(u.name)}, renovamos tu Spotlight por 30 días más.</p>
    <p><strong>Nueva expiración: ${expDate}</strong>.</p>
    <a href="${APP_URL}/#/adult/spotlight" class="btn">Editar mi perfil</a>
  `);
  await send(u.email, '✨ Spotlight renovado por 30 días', html);
}

export async function sendSpotlightExpiringEmail(userId, expiresAt, daysLeft) {
  const u = await getUserEmail(userId);
  if (!u?.email) return;
  const expDate = new Date(expiresAt).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const html = base(`
    <h2>⏰ Tu Spotlight expira en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}</h2>
    <p>Hola ${_e(u.name)},</p>
    <p>Tu publicación en el directorio Fuck Now expira el <strong>${expDate}</strong>. Después de esa fecha, tu perfil dejará de aparecer hasta que renueves.</p>
    <p>Si tenés activada la renovación automática vía CCBill, no necesitás hacer nada — se renueva sola.</p>
    <a href="${APP_URL}/#/adult/spotlight" class="btn">Renovar ahora</a>
  `);
  await send(u.email, `⏰ Spotlight expira en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`, html);
}

export async function sendSpotlightExpiredEmail(userId) {
  const u = await getUserEmail(userId);
  if (!u?.email) return;
  const html = base(`
    <h2>💤 Tu Spotlight expiró</h2>
    <p>Hola ${_e(u.name)},</p>
    <p>Tu publicación en el directorio Fuck Now expiró y ya no aparece. Tu perfil de creator sigue activo en el resto de la plataforma.</p>
    <p>Si querés volver a aparecer en el directorio, podés reactivar tu Spotlight cuando quieras.</p>
    <a href="${APP_URL}/#/adult/spotlight" class="btn">Reactivar Spotlight</a>
  `);
  await send(u.email, '💤 Tu Spotlight expiró — reactivá cuando quieras', html);
}

export async function sendSpotlightModeratedEmail(userId, ruleLabel) {
  const u = await getUserEmail(userId);
  if (!u?.email) return;
  const html = base(`
    <h2>⚠ Tu Spotlight fue quitado del directorio</h2>
    <p>Hola ${_e(u.name)},</p>
    <p>Detectamos contenido no permitido en tu publicación: <strong style="color:#ff4444">${_e(ruleLabel)}</strong>.</p>
    <p>Las reglas del directorio prohíben:</p>
    <ul style="color:#aaa;font-size:14px">
      <li>Tarifas por servicios físicos</li>
      <li>Contacto externo (WhatsApp, teléfono, redes)</li>
      <li>Servicios sexuales explícitos por dinero</li>
      <li>Dirección física</li>
    </ul>
    <p>Podés editar tu perfil y volver a publicar respetando las reglas.</p>
    <a href="${APP_URL}/#/adult/spotlight" class="btn">Editar perfil</a>
  `);
  await send(u.email, '⚠ Spotlight quitado del directorio', html);
}

// ── Helper: respetar prefs del usuario (no enviar si desactivó la categoría)
async function emailEnabled(userId, category) {
  if (!userId) return true;
  try {
    const { supabase } = await import('./supabase.js');
    const { data } = await supabase.from('profiles')
      .select('email_prefs').eq('id', userId).single();
    const prefs = data?.email_prefs || {};
    return prefs[category] !== false;
  } catch { return true; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREADOR — gana plata
// ─────────────────────────────────────────────────────────────────────────────

// Tip recibido en show
export async function sendTipReceivedEmail(email, creatorName, fromName, amountUsd, coinsAmount) {
  const html = base(`
    <h2>💸 ¡Recibiste una propina!</h2>
    <p>Hola ${_e(creatorName)},</p>
    <p><strong style="color:#e040fb">${_e(fromName)}</strong> te envió una propina de
      <strong style="color:#22c55e">$${amountUsd.toFixed(2)} USD</strong>
      (${coinsAmount.toLocaleString('en-US')} coins).</p>
    <a href="${APP_URL}/#/creator/dashboard" class="btn">Ver mis ingresos</a>
  `);
  await send(email, `💸 Propina de $${amountUsd.toFixed(2)} de ${_e(fromName)}`, html);
}

// Regalo recibido
export async function sendGiftReceivedEmail(email, creatorName, fromName, giftName, amountUsd) {
  const html = base(`
    <h2>🎁 ¡Te enviaron un regalo!</h2>
    <p>Hola ${_e(creatorName)},</p>
    <p><strong style="color:#e040fb">${_e(fromName)}</strong> te envió ${_e(giftName)}
      (vale <strong style="color:#22c55e">$${amountUsd.toFixed(2)} USD</strong>).</p>
    <a href="${APP_URL}/#/creator/dashboard" class="btn">Ver mis ingresos</a>
  `);
  await send(email, `🎁 ${_e(fromName)} te envió ${_e(giftName)}`, html);
}

// Nuevo suscriptor
export async function sendNewSubscriberEmail(email, creatorName, subscriberName, priceUsd) {
  const html = base(`
    <h2>⭐ ¡Nuevo suscriptor!</h2>
    <p>Hola ${_e(creatorName)},</p>
    <p><strong style="color:#e040fb">${_e(subscriberName)}</strong> se acaba de suscribir a tu contenido
      por <strong style="color:#22c55e">$${priceUsd.toFixed(2)} USD/mes</strong>.</p>
    <p style="color:#aaa">Te recomendamos enviarle un mensaje de bienvenida para fidelizar el lazo.</p>
    <a href="${APP_URL}/#/messages" class="btn">Enviar bienvenida</a>
  `);
  await send(email, `⭐ ${_e(subscriberName)} se suscribió a tu contenido`, html);
}

// Suscripción renovada (cobro automático exitoso)
export async function sendSubscriptionRenewedEmail(email, subscriberName, creatorName, priceUsd) {
  const html = base(`
    <h2>✅ Suscripción renovada</h2>
    <p>Hola ${_e(subscriberName)},</p>
    <p>Renovamos tu suscripción a <strong style="color:#e040fb">${_e(creatorName)}</strong>
      por <strong>$${priceUsd.toFixed(2)} USD</strong>. Tu acceso continúa por 30 días más.</p>
    <a href="${APP_URL}/#/settings" class="btn">Gestionar suscripciones</a>
  `);
  await send(email, `Suscripción a ${_e(creatorName)} renovada · $${priceUsd.toFixed(2)}`, html);
}

// Suscripción cancelada
export async function sendSubscriptionCanceledEmail(email, subscriberName, creatorName, accessUntil) {
  const html = base(`
    <h2>👋 Suscripción cancelada</h2>
    <p>Hola ${_e(subscriberName)},</p>
    <p>Cancelaste la renovación de tu suscripción a <strong style="color:#e040fb">${_e(creatorName)}</strong>.</p>
    <p>Mantendrás acceso hasta el <strong>${new Date(accessUntil).toLocaleDateString('es')}</strong>.</p>
    <a href="${APP_URL}/#/settings" class="btn">Reactivar</a>
  `);
  await send(email, `Cancelaste tu suscripción a ${_e(creatorName)}`, html);
}

// Payout enviado (cuando se procesa el auto-payout)
export async function sendPayoutSentEmail(email, creatorName, amountUsd) {
  const html = base(`
    <h2>💸 Payout enviado</h2>
    <p>Hola ${_e(creatorName)},</p>
    <p>Transferimos <strong style="color:#22c55e">$${amountUsd.toFixed(2)} USD</strong>
      a tu cuenta de Stripe Connect. Llegará a tu banco en 2-7 días hábiles.</p>
    <a href="${APP_URL}/#/creator/dashboard" class="btn">Ver historial</a>
  `);
  await send(email, `💸 Payout de $${amountUsd.toFixed(2)} enviado`, html);
}

// Show empieza ahora (a quienes marcaron interés)
export async function sendShowStartingEmail(email, userName, creatorName, showTitle, showId) {
  const html = base(`
    <h2>🔴 ${creatorName} está en vivo ahora</h2>
    <p>Hola ${userName},</p>
    <p>Marcaste interés en "<strong>${showTitle}</strong>" y acaba de empezar.</p>
    <a href="${APP_URL}/#/shows/${showId}" class="btn">Entrar al show</a>
    <p style="margin-top:16px;font-size:13px;color:#555">Llegas tarde si no entras ahora.</p>
  `);
  await send(email, `🔴 ${creatorName} EN VIVO: ${showTitle}`, html);
}

// ─────────────────────────────────────────────────────────────────────────────
// USUARIO — confirmaciones
// ─────────────────────────────────────────────────────────────────────────────

// Compra de paquete de coins
export async function sendCoinPurchaseEmail(email, userName, coinsBase, coinsBonus, priceUsd) {
  const total = coinsBase + coinsBonus;
  const bonusStr = coinsBonus > 0 ? ` (+${coinsBonus.toLocaleString('en-US')} bonus)` : '';
  const html = base(`
    <h2>⚡ Compra confirmada</h2>
    <p>Hola ${userName},</p>
    <p>Recibimos tu pago de <strong>$${priceUsd.toFixed(2)} USD</strong>. Acreditamos
      <strong style="color:#facc15">${total.toLocaleString('en-US')} coins</strong>${bonusStr}
      en tu cuenta.</p>
    <a href="${APP_URL}/#/coins" class="btn">Ver mi balance</a>
    <p style="margin-top:16px;font-size:13px;color:#aaa">
      Conserva este email como recibo de tu compra. ID: ${Date.now()}
    </p>
  `);
  await send(email, `⚡ ${total.toLocaleString('en-US')} coins acreditados · $${priceUsd.toFixed(2)}`, html);
}

// Boost activado
export async function sendBoostActivatedEmail(email, userName, durationMin) {
  const html = base(`
    <h2>⚡ Boost activado</h2>
    <p>Hola ${userName},</p>
    <p>Tu perfil está destacado en el feed durante los próximos
      <strong>${durationMin} minutos</strong>. Vas a recibir hasta 10× más likes.</p>
    <a href="${APP_URL}/#/discover" class="btn">Ver mi alcance</a>
  `);
  await send(email, `⚡ Tu boost está activo`, html);
}

// Identidad verificada
export async function sendIdentityVerifiedEmail(email, userName) {
  const html = base(`
    <h2>✅ Identidad verificada</h2>
    <p>Hola ${userName},</p>
    <p>Verificamos tu identidad. Ahora tienes el badge de verificado
      <strong style="color:#3b82f6">azul</strong> en tu perfil.</p>
    <a href="${APP_URL}/#/profile" class="btn">Ver mi perfil</a>
  `);
  await send(email, `✅ Tu identidad fue verificada`, html);
}

// Verificación rechazada
export async function sendIdentityRejectedEmail(email, userName, reason) {
  const html = base(`
    <h2>❌ Verificación no aprobada</h2>
    <p>Hola ${userName},</p>
    <p>No pudimos verificar tu identidad${reason ? `: <em>${reason}</em>` : ''}.</p>
    <p>Puedes intentarlo de nuevo asegurándote de:</p>
    <ul style="color:#aaa;line-height:1.8">
      <li>Documento sin reflejos ni recortes</li>
      <li>Selfie con buena iluminación</li>
      <li>Cara visible y centrada</li>
    </ul>
    <a href="${APP_URL}/#/settings" class="btn">Reintentar</a>
  `);
  await send(email, `Tu verificación no fue aprobada`, html);
}

// Apelación resuelta
export async function sendAppealResolvedEmail(email, userName, status, adminMessage) {
  const isAccepted = status === 'accepted';
  const html = base(`
    <h2>${isAccepted ? '✅ Apelación aceptada' : '❌ Apelación rechazada'}</h2>
    <p>Hola ${userName},</p>
    <p>Revisamos tu apelación.
      ${isAccepted
        ? 'La aceptamos. Tu restricción fue removida.'
        : 'Mantenemos nuestra decisión original.'}
    </p>
    ${adminMessage ? `<p style="background:#2a2a2a;padding:12px;border-radius:8px;color:#ccc;font-size:13px">${adminMessage}</p>` : ''}
    <a href="${APP_URL}/#/profile" class="btn">Ir a la app</a>
  `);
  await send(email, isAccepted ? '✅ Tu apelación fue aceptada' : 'Tu apelación fue revisada', html);
}

// DMCA aceptado contra ti
export async function sendDMCAAgainstYouEmail(email, userName, strikeCount, banned) {
  const html = base(`
    <h2>⚠️ Notificación DMCA aceptada</h2>
    <p>Hola ${userName},</p>
    <p>Recibimos una notificación DMCA por contenido que publicaste y la <strong>aceptamos</strong>.
      Eliminamos el contenido afectado.</p>
    <p style="background:#7f1d1d33;border-left:4px solid #ef4444;padding:12px;border-radius:4px;color:#fff;font-size:14px">
      ${banned
        ? '🚫 Esto cuenta como tu <strong>3er strike DMCA</strong>. Tu cuenta fue bloqueada permanentemente.'
        : `Esto cuenta como strike <strong>${strikeCount}/3</strong>. Al 3er strike, tu cuenta será bloqueada permanentemente.`}
    </p>
    <p>Si crees que es un error, puedes presentar una <strong>contra-notificación DMCA</strong>:</p>
    <a href="${APP_URL}/#/dmca" class="btn">Presentar contra-notificación</a>
  `);
  await send(email, banned ? '🚫 Cuenta bloqueada (3 strikes DMCA)' : `⚠️ Strike DMCA ${strikeCount}/3`, html);
}

// Soporte: confirmación al usuario que abrió un ticket
export async function sendSupportTicketEmail(email, userName, ticketId, subject) {
  const html = base(`
    <h2>📩 Recibimos tu solicitud</h2>
    <p>Hola ${userName},</p>
    <p>Recibimos tu ticket de soporte. Te responderemos en máximo 48 horas hábiles.</p>
    <p style="background:#2a2a2a;padding:12px;border-radius:8px;color:#ccc;font-size:13px">
      <strong>Ticket #${ticketId}</strong><br>
      <strong>Asunto:</strong> ${subject}
    </p>
  `);
  await send(email, `Recibimos tu solicitud · Ticket #${ticketId}`, html);
}

// Newsletter blast: el creador envía email masivo a sus suscriptores
// 🎁 Recibiste una suscripción de regalo
export async function sendSubscriptionGiftEmail(email, recipientName, gifterName, creatorName, tierName, message) {
  const html = base(`
    <h2>🎁 ¡Te regalaron una suscripción!</h2>
    <p>Hola ${_e(recipientName)},</p>
    <p><strong style="color:#e040fb">${_e(gifterName)}</strong> te regaló una suscripción
      <strong>${_e(tierName)}</strong> a <strong style="color:#22c55e">${_e(creatorName)}</strong> por 1 mes.</p>
    ${message ? `<div style="background:#1a1a2e;border-left:3px solid #e040fb;padding:12px 16px;margin:16px 0;color:#ccc;font-style:italic">"${_e(message)}"</div>` : ''}
    <p style="color:#aaa">El acceso ya está activo. ¡Disfrútalo!</p>
    <a href="${APP_URL}/#/messages" class="btn">Abrir Destino TV</a>
  `);
  await send(email, `🎁 ${_e(gifterName)} te regaló una suscripción a ${_e(creatorName)}`, html);
}

export async function sendCreatorBlastEmail(email, subscriberName, creatorName, subject, bodyHtml) {
  // bodyHtml ya fue sanitizado en sendBlastEmail (script/style/onX/javascript:
  // removidos). El subject y creatorName aún pueden contener HTML del usuario.
  const html = base(`
    <h2>${_e(subject)}</h2>
    <p style="color:#888;font-size:13px;margin-bottom:16px">De: <strong style="color:#e040fb">${_e(creatorName)}</strong></p>
    <div style="color:#ccc">${bodyHtml}</div>
    <a href="${APP_URL}/#/messages" class="btn">Responder en chat</a>
    <p style="margin-top:24px;font-size:11px;color:#555">
      Recibes este email porque te suscribiste a ${_e(creatorName)}.
      <a href="${APP_URL}/#/settings" style="color:#777">Gestionar suscripciones</a>
    </p>
  `);
  await send(email, `${_e(creatorName)}: ${_e(subject)}`, html);
}

export { emailEnabled };
