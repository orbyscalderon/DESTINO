// HMAC signature verification para webhooks de Verotel, MobiusPay, SegPay, CCBill.
// Cada provider usa esquemas distintos — encapsulados acá.

import crypto from 'crypto';

// Verotel: usa MD5 signature en query params (legacy pero es lo que tienen).
// docs: https://www.verotel.com/en/developer.html
export function verifyVerotelSignature(query) {
  const secret = process.env.VEROTEL_FLEX_SECRET;
  if (!secret) return false;
  const { signature, ...rest } = query;
  // Sort params alfabéticamente, concatenar, agregar secret al final, MD5
  const sortedKeys = Object.keys(rest).sort();
  const concat = sortedKeys.map(k => rest[k]).join('') + secret;
  const expected = crypto.createHash('md5').update(concat).digest('hex');
  return safeEqual(signature, expected);
}

// MobiusPay: HMAC-SHA256 con header x-mobius-signature.
export function verifyMobiusSignature({ rawBody, headers }) {
  const secret = process.env.MOBIUS_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = headers['x-mobius-signature'] || '';
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(sig, expected);
}

// SegPay: HMAC-SHA256 en header x-segpay-sig.
export function verifySegPaySignature({ rawBody, headers }) {
  const secret = process.env.SEGPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = headers['x-segpay-sig'] || '';
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(sig, expected);
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
