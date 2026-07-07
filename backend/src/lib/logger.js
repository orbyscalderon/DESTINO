// Structured logger. Sin agregar pino como dep (que se acumula con
// transitive vulnerabilities) — implementamos un wrapper minimal sobre
// console que produce JSON parseable por Railway/Sentry/Datadog.
//
// Si en el futuro se quiere migrar a pino, basta cambiar este archivo —
// los call sites (req.log.info, logger.error, etc.) no cambian.

import crypto from 'crypto';

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')] || 30;

function fmt(level, payload, msg) {
  if (LEVELS[level] < MIN_LEVEL) return null;
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...payload,
    ...(msg ? { msg } : {}),
  };
  return JSON.stringify(entry);
}

function emit(level, payload, msg) {
  const line = fmt(level, payload, msg);
  if (!line) return;
  if (level === 'error' || level === 'fatal') console.error(line);
  else console.log(line);
}

export const logger = {
  trace: (m, p = {}) => emit('trace', p, m),
  debug: (m, p = {}) => emit('debug', p, m),
  info:  (m, p = {}) => emit('info',  p, m),
  warn:  (m, p = {}) => emit('warn',  p, m),
  error: (m, p = {}) => emit('error', p, m),
  fatal: (m, p = {}) => emit('fatal', p, m),
  child: (bindings) => ({
    trace: (m, p = {}) => emit('trace', { ...bindings, ...p }, m),
    debug: (m, p = {}) => emit('debug', { ...bindings, ...p }, m),
    info:  (m, p = {}) => emit('info',  { ...bindings, ...p }, m),
    warn:  (m, p = {}) => emit('warn',  { ...bindings, ...p }, m),
    error: (m, p = {}) => emit('error', { ...bindings, ...p }, m),
    fatal: (m, p = {}) => emit('fatal', { ...bindings, ...p }, m),
  }),
};

// Logga un error Y lo reporta a Sentry si está disponible.
// Uso estándar en catch blocks:
//
//   try { ... } catch (err) {
//     logError('handler-name', err, { extra: context });
//     return res.status(500).json({ error: 'Error interno' });
//   }
//
// Antes había 182 catches silenciosos que solo hacían res.status(500) sin log.
// Esta helper centraliza logging + Sentry en una sola llamada.
export async function logError(source, err, context = {}) {
  const payload = {
    source,
    err: err?.message || String(err),
    stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    ...context,
  };
  emit('error', payload, `[${source}] ${err?.message || err}`);

  // Sentry es opcional — si está instalado, capturamos ahí también.
  // Dynamic import para no romper si @sentry/node no está en el bundle.
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/node').catch(() => null);
      if (Sentry?.captureException) {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { source },
          extra: context,
        });
      }
    } catch {
      // Sentry no disponible — el log estructurado en JSON queda igual
    }
  }
}

// Express middleware — atacha req.id (de X-Request-Id si vino, sino genera)
// + req.log (logger con req.id, method, path bound).
export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (incoming && /^[\w-]{1,128}$/.test(incoming))
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  req.id = id;
  res.setHeader('X-Request-Id', id);
  req.log = logger.child({
    reqId: id,
    method: req.method,
    path: req.path,
  });
  next();
}
