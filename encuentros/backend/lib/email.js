// Email notifier multi-provider.
// Soporta Resend (default), SendGrid, Postmark via env RESEND_API_KEY o SENDGRID_API_KEY.
// Si no hay key seteada, loguea a stdout (modo dev/demo).
// TODOS los envíos se loguean en encuentros_mail_log para audit.

import { supabase } from './supabase.js';

const PROVIDER = process.env.MAIL_PROVIDER || 'resend';
const FROM = process.env.MAIL_FROM || 'no-reply@encuentros.local';

async function sendViaResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY no seteado');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return { provider_msg_id: data.id };
}

async function sendViaSendgrid({ to, subject, html }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error('SENDGRID_API_KEY no seteado');
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (!r.ok) throw new Error(`SendGrid ${r.status}: ${await r.text()}`);
  return { provider_msg_id: r.headers.get('x-message-id') || null };
}

// Devuelve { sent_at, provider_msg_id, status }
export async function sendMail({ to, template, subject, html, metadata = {} }) {
  let status = 'queued';
  let providerMsgId = null;
  let error = null;
  try {
    if (PROVIDER === 'resend' && process.env.RESEND_API_KEY) {
      const r = await sendViaResend({ to, subject, html });
      providerMsgId = r.provider_msg_id;
      status = 'sent';
    } else if (PROVIDER === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      const r = await sendViaSendgrid({ to, subject, html });
      providerMsgId = r.provider_msg_id;
      status = 'sent';
    } else {
      // Modo dev/demo — solo log
      console.log(`[mail:${template}] → ${to}: ${subject}`);
      console.log(`HTML:\n${html.substring(0, 500)}...`);
      status = 'sent';
    }
  } catch (err) {
    error = err.message;
    status = 'failed';
  }

  // Log siempre (audit)
  supabase.from('encuentros_mail_log').insert({
    to_email: to,
    template,
    subject,
    provider: PROVIDER,
    provider_msg_id: providerMsgId,
    status,
    error,
    metadata,
  }).then(() => {}, () => {});

  if (error) throw new Error(error);
  return { provider_msg_id: providerMsgId, status };
}

// ──────────────────────────────────────────────────────────────────
// Templates inline (HTML simple, sin layout complejo — el branding
// completo va cuando se monte el dominio prod).
// ──────────────────────────────────────────────────────────────────
export const templates = {
  listing_pending_review: ({ display_name }) => ({
    subject: 'Tu anuncio está en revisión',
    html: `<h2>Hola ${display_name}</h2>
      <p>Tu anuncio fue creado y está en revisión. Te avisaremos cuando esté aprobado (normalmente en 24h).</p>
      <p>Mientras tanto, completá la verificación de identidad si todavía no lo hiciste.</p>`,
  }),
  listing_approved: ({ display_name, listing_url }) => ({
    subject: '✅ Tu anuncio fue aprobado',
    html: `<h2>¡Aprobado!</h2>
      <p>${display_name}, tu anuncio ya está visible.</p>
      <p><a href="${listing_url}">Verlo en el directorio</a></p>`,
  }),
  listing_rejected: ({ display_name, reason }) => ({
    subject: 'Tu anuncio fue rechazado',
    html: `<h2>Anuncio no aprobado</h2>
      <p>Motivo: ${reason}</p>
      <p>Podés editarlo y volver a enviarlo para revisión.</p>`,
  }),
  listing_expiring_soon: ({ display_name, expires_at, renew_url }) => ({
    subject: 'Tu anuncio expira pronto',
    html: `<h2>Renovación</h2>
      <p>Tu anuncio expira el ${new Date(expires_at).toLocaleDateString()}.</p>
      <p><a href="${renew_url}">Renovar ahora</a></p>`,
  }),
  listing_expired: ({ display_name }) => ({
    subject: 'Tu anuncio expiró',
    html: `<h2>Anuncio expirado</h2>
      <p>${display_name}, tu anuncio ya no está visible. Podés renovarlo desde el dashboard.</p>`,
  }),
  payment_received: ({ tier, amount }) => ({
    subject: 'Pago recibido',
    html: `<h2>Pago confirmado</h2>
      <p>Recibimos tu pago de USD $${amount} por el tier <strong>${tier}</strong>.</p>`,
  }),
  payment_failed: ({ tier, retry_url }) => ({
    subject: 'Tu pago falló',
    html: `<h2>Pago no completado</h2>
      <p>No pudimos cobrar tu tier <strong>${tier}</strong>. <a href="${retry_url}">Reintentar</a></p>`,
  }),
  report_received: ({ report_id }) => ({
    subject: 'Reporte recibido — gracias',
    html: `<h2>Reporte ${report_id}</h2>
      <p>Lo revisaremos en máximo 24h. Si es urgente (menores/trafficking) escalamos en minutos.</p>`,
  }),
};
