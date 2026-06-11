// Utilities para que la copy se sienta humana, no de máquina.
//
//   - timeAwareGreeting() → "Buenos días" / "Buenas tardes" / "Buenas noches"
//   - smartTime(date)     → "ahora" / "hace 5 min" / "ayer" / "lun 14" / "mar 2024"
//   - loadingMessage()    → rota entre "Cargando…", "Un momento…", "Ya casi…"
//   - humanizeError(err)  → mensajes con personalidad
//   - randomCheer()       → toast.success(randomCheer()) cuando algo sale bien

// ── 1. Greeting según hora local ────────────────────────────────────────────
export function timeAwareGreeting(name = '') {
  const hour = new Date().getHours();
  let g;
  if (hour < 6)       g = 'Madrugando';
  else if (hour < 12) g = 'Buenos días';
  else if (hour < 19) g = 'Buenas tardes';
  else                g = 'Buenas noches';
  return name ? `${g}, ${name}` : g;
}

// ── 2. Smart timestamps relativos ──────────────────────────────────────────
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function smartTime(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60)   return 'ahora';
  if (diffMin < 60)   return `hace ${diffMin} min`;
  if (diffHr < 24)    return `hace ${diffHr}h`;
  if (diffDay === 1)  return 'ayer';
  if (diffDay < 7)    return `${DAYS[d.getDay()]}`;
  if (diffDay < 365)  return `${DAYS[d.getDay()]} ${d.getDate()}`;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── 3. Loading messages variados ───────────────────────────────────────────
const LOADING_MESSAGES = [
  'Cargando…',
  'Un momento…',
  'Ya casi…',
  'Casi listo…',
  'Procesando…',
];
export function loadingMessage() {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

// ── 4. Humanize errors ─────────────────────────────────────────────────────
const ERROR_MESSAGES = {
  network:     'No hay conexión 📡 — revisá tu internet',
  timeout:     'Se demoró más de la cuenta — intentemos otra vez',
  unauthorized:'Tu sesión expiró — entrá de nuevo',
  forbidden:   'No tenés permiso para hacer esto',
  notfound:    'No encontramos eso 🔍',
  ratelimit:   'Despacio — esperá un momento antes de intentar de nuevo',
  validation:  'Algo no cuadra — revisá los datos',
  server:      'Algo se rompió de nuestro lado 😅 — probamos otra vez?',
  insufficient_coins: 'Coins insuficientes — recarga abajo ⚡',
  geo_blocked: 'Este contenido no está disponible en tu región',
  unknown:     'Algo salió mal — intentemos otra vez',
};

export function humanizeError(err) {
  const code = err?.response?.data?.code?.toLowerCase()
            || err?.code?.toLowerCase()
            || '';
  const status = err?.response?.status;
  const msg    = err?.response?.data?.error || err?.message;

  if (code === 'insufficient_coins')          return ERROR_MESSAGES.insufficient_coins;
  if (code === 'geo_blocked' || status === 451) return ERROR_MESSAGES.geo_blocked;
  if (status === 401)         return ERROR_MESSAGES.unauthorized;
  if (status === 403)         return ERROR_MESSAGES.forbidden;
  if (status === 404)         return ERROR_MESSAGES.notfound;
  if (status === 408 || code === 'timeout') return ERROR_MESSAGES.timeout;
  if (status === 422)         return ERROR_MESSAGES.validation;
  if (status === 429)         return ERROR_MESSAGES.ratelimit;
  if (status >= 500)          return ERROR_MESSAGES.server;
  if (err?.message?.includes('network') || err?.message?.includes('Network')) {
    return ERROR_MESSAGES.network;
  }
  return msg && msg.length < 80 ? msg : ERROR_MESSAGES.unknown;
}

// ── 5. Random cheers para toast.success ────────────────────────────────────
const CHEERS = [
  '¡Listo!',
  '¡Perfecto!',
  '¡Dale!',
  '¡Bien!',
  '✨ Listo',
];
export function randomCheer() {
  return CHEERS[Math.floor(Math.random() * CHEERS.length)];
}
