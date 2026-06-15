// safeRedirect — hardening de redirects externos.
//
// Aunque las URLs que recibimos vienen del backend (Stripe Connect, Stripe
// Checkout, CCBill, Stripe Identity), validamos antes de hacer
// window.location.href = data.url para evitar:
//   - URLs con scheme peligroso (javascript:, data:, vbscript:)
//   - URLs vacías que causan reload silencioso
//   - URLs malformadas que terminan en error de browser
//
// Allowlist por defecto:
//   - dashboard.stripe.com / *.stripe.com
//   - checkout.stripe.com
//   - billing.stripe.com
//   - identity.stripe.com
//   - api.ccbill.com / *.ccbill.com
//   - Cualquier https:// del propio dominio (window.location.origin)
//
// Para añadir más hosts, settear VITE_SAFE_REDIRECT_HOSTS como CSV.

const FALLBACK_HOSTS = new Set([
  'stripe.com',
  'dashboard.stripe.com',
  'checkout.stripe.com',
  'billing.stripe.com',
  'identity.stripe.com',
  'connect.stripe.com',
  'api.ccbill.com',
  'bill.ccbill.com',
  'api2.ccbill.com',
]);

function getAllowedHosts() {
  const set = new Set(FALLBACK_HOSTS);
  // Origin actual
  try {
    if (typeof window !== 'undefined' && window.location?.host) {
      set.add(window.location.host);
    }
  } catch {}
  // Custom hosts via env
  const envHosts = import.meta.env?.VITE_SAFE_REDIRECT_HOSTS || '';
  for (const h of envHosts.split(',').map(s => s.trim()).filter(Boolean)) {
    set.add(h);
  }
  return set;
}

function isAllowedRedirectTarget(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 4096) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;

  const allowed = getAllowedHosts();
  // Match exacto O subdominio del host permitido (Stripe puede usar
  // pay-link-12345.stripe.com etc.)
  for (const host of allowed) {
    if (parsed.hostname === host) return true;
    if (parsed.hostname.endsWith('.' + host)) return true;
  }
  return false;
}

/**
 * Redirige a una URL externa solo si pasa la whitelist. Si no, loguea error
 * y opcionalmente invoca onReject (útil para mostrar toast).
 *
 * @param {string} url
 * @param {object} opts
 * @param {(url:string)=>void} opts.onReject
 */
export function safeRedirect(url, { onReject } = {}) {
  if (isAllowedRedirectTarget(url)) {
    window.location.href = url;
    return true;
  }
  console.warn('[safeRedirect] blocked:', url);
  onReject?.(url);
  return false;
}

export { isAllowedRedirectTarget };
