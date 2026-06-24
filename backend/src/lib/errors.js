// Standard error shape para responses HTTP.
//   { error: 'mensaje user-facing', code: 'SCREAMING_SNAKE_CASE', details?: {...} }
//
// Frontend siempre lee `err.response.data.error` (string) y opcionalmente
// `err.response.data.code` para branches específicas (insufficient_coins, etc).
//
// Por qué un shape consistente:
//   1) PostHog/Sentry agrupan errores por `code` → 1 issue por tipo, no 50
//   2) Frontend no tiene que probar 3 shapes distintos (.error / .message / .errors[])
//   3) Logs structured con reqId + code → search "code:INSUFFICIENT_COINS" en Railway

/**
 * Lanza un error estándar que el middleware errorHandler convierte en HTTP response.
 *
 * @param {number} status     HTTP status code (400, 403, 404, 422, 500, etc)
 * @param {string} message    Mensaje user-facing (en español)
 * @param {string} code       Código SCREAMING_SNAKE_CASE para branches frontend / agrupado Sentry
 * @param {object} details    Datos extra (no expuestos en prod salvo whitelist)
 */
export class ApiError extends Error {
  constructor(status, message, code, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Shortcuts comunes
export const badRequest   = (msg, code = 'BAD_REQUEST',   details) => new ApiError(400, msg, code, details);
export const unauthorized = (msg = 'No autenticado',          code = 'UNAUTHORIZED', details) => new ApiError(401, msg, code, details);
export const forbidden    = (msg = 'Acceso denegado',         code = 'FORBIDDEN',    details) => new ApiError(403, msg, code, details);
export const notFound     = (msg = 'No encontrado',           code = 'NOT_FOUND',    details) => new ApiError(404, msg, code, details);
export const conflict     = (msg = 'Conflicto',               code = 'CONFLICT',     details) => new ApiError(409, msg, code, details);
export const tooMany      = (msg = 'Demasiadas peticiones',   code = 'RATE_LIMIT',   details) => new ApiError(429, msg, code, details);
export const serverError  = (msg = 'Error interno',           code = 'INTERNAL',     details) => new ApiError(500, msg, code, details);

/**
 * Express error handler centralizado. Se monta AL FINAL del router stack:
 *   app.use(errorHandler);
 *
 * - Logea con structured logger (reqId, code, status)
 * - Sentry capture si configurado
 * - Sanitiza details en prod (no leakea stack traces a users)
 */
export function errorHandler(err, req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production';
  const log = req.log || console;

  // ApiError → response estandarizada
  if (err instanceof ApiError) {
    log.warn?.(`api error ${err.code}`, { status: err.status, code: err.code, msg: err.message });
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details && !isProd ? { details: err.details } : {}),
    });
  }

  // Error con .status (legacy patrón pre-ApiError)
  if (err && typeof err.status === 'number' && err.status < 500) {
    return res.status(err.status).json({
      error: err.message || 'Error',
      code: err.code || 'UNKNOWN',
    });
  }

  // Default: 500 internal — NO leakear stack en prod
  log.error?.('unhandled error', {
    err: err.message,
    stack: isProd ? undefined : err.stack,
  });

  // Sentry captura si está configurado
  if (process.env.SENTRY_DSN) {
    import('@sentry/node').then(Sentry => Sentry.captureException(err)).catch(() => {});
  }

  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL',
    ...(isProd ? {} : { details: { message: err.message, stack: err.stack?.split('\n').slice(0, 5) } }),
  });
}
