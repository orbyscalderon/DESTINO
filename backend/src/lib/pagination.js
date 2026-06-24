// Pagination helper estandar. Devuelve shape:
//   { items: [...], page, limit, has_more, total_count? }
//
// Mantiene backward-compat: si un endpoint legacy devolvía { items: [...] }
// sin metadata, el frontend sigue funcionando. Lo nuevo es OPT-IN.
//
// Uso:
//
//   import { parsePagination, buildResponse } from '../lib/pagination.js';
//
//   export const listFoo = async (req, res) => {
//     const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 24 });
//     const { data, count } = await supabase
//       .from('foo')
//       .select('*', { count: 'exact' })
//       .range(offset, offset + limit - 1);
//     res.json(buildResponse({ items: data, page, limit, totalCount: count }));
//   };

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

/**
 * Parsea ?page=N&limit=M de req.query con bounds.
 * @returns { page, limit, offset } — offset listo para .range(offset, offset+limit-1)
 */
export function parsePagination(query, opts = {}) {
  const defaultLimit = opts.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = opts.maxLimit || MAX_LIMIT;

  const page = Math.max(0, parseInt(query.page) || 0);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = page * limit;

  return { page, limit, offset };
}

/**
 * Construye el shape estándar de response paginada.
 *
 * @param {object} args
 * @param {Array}  args.items       lista de items
 * @param {number} args.page        índice de página (0-based)
 * @param {number} args.limit       items por página
 * @param {number} args.totalCount  total absoluto si es conocido (opcional)
 * @param {string} args.itemsKey    nombre custom del array (default 'items')
 */
export function buildResponse({ items = [], page, limit, totalCount = null, itemsKey = 'items' }) {
  const result = {
    [itemsKey]: items,
    page,
    limit,
    has_more: typeof totalCount === 'number'
      ? (page + 1) * limit < totalCount
      : items.length >= limit,
  };
  if (typeof totalCount === 'number') result.total_count = totalCount;
  return result;
}

/**
 * Wrapper helper para queries de Supabase. Aplica .range automáticamente
 * y devuelve el response shape estándar.
 *
 * @param {object} req           Express req
 * @param {Function} buildQuery  (offset, limit) => supabase query builder
 * @param {object} opts          { defaultLimit, itemsKey, withCount }
 */
export async function paginateQuery(req, buildQuery, opts = {}) {
  const { page, limit, offset } = parsePagination(req.query, opts);

  let q = buildQuery(offset, limit);
  if (opts.withCount) {
    // Note: el caller debe haber usado .select('*', { count: 'exact' })
    // para que count esté en la response. Acá solo ejecutamos.
  }

  const { data, count, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;

  return buildResponse({
    items: data || [],
    page,
    limit,
    totalCount: typeof count === 'number' ? count : null,
    itemsKey: opts.itemsKey,
  });
}
