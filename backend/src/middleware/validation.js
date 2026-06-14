// Middleware de validación de parámetros.
// Sec audit #16: previene errores 500 cuando un user pasa un :id que no
// es UUID válido (Supabase tira PostgresError 22P02 → 500). Mejor 400
// con mensaje explícito.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida que ciertos params sean UUIDs válidos.
 * Uso: router.get('/:id', validateUuidParams('id'), handler)
 */
export function validateUuidParams(...names) {
  return (req, res, next) => {
    for (const name of names) {
      const v = req.params[name];
      if (v != null && !UUID_RE.test(v)) {
        return res.status(400).json({
          error: `Parámetro "${name}" debe ser un UUID válido`,
          code: 'INVALID_UUID',
        });
      }
    }
    next();
  };
}

/**
 * Valida UUIDs en req.body. Usa array de nombres a validar.
 * Uso: router.post('/', validateUuidBody('user_id', 'show_id'), handler)
 */
export function validateUuidBody(...names) {
  return (req, res, next) => {
    for (const name of names) {
      const v = req.body?.[name];
      if (v != null && !UUID_RE.test(v)) {
        return res.status(400).json({
          error: `Campo "${name}" debe ser un UUID válido`,
          code: 'INVALID_UUID',
        });
      }
    }
    next();
  };
}

/**
 * Helper para usar dentro de un controller (no middleware).
 * Returns true si es UUID válido, false si no.
 */
export function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
