// Constantes de negocio centralizadas.
// IMPORTANTE: NO duplicar estos valores en otros archivos. Si cambian aquí,
// cambian en todo el sistema. Antes estaban duplicados en coinController.js,
// paymentController.js, creatorController.js → inconsistencia silenciosa.

export const PLATFORM_FEE_RATE = 0.30;          // 30% para la plataforma
export const CREATOR_CUT       = 1 - PLATFORM_FEE_RATE; // 70% para el creador
export const COIN_VALUE_USD    = 0.05;          // 1 coin = $0.05 USD
export const MIN_PAYOUT_USD    = 10;            // mínimo $10 para retirar
export const COINS_PER_USD     = 1 / COIN_VALUE_USD; // 20 coins por USD

// Conversores
export const coinsToUSD   = (coins) => coins * COIN_VALUE_USD;
export const usdToCoins   = (usd)   => Math.ceil(usd * COINS_PER_USD);
export const coinsToCreatorUSD = (coins) => coinsToUSD(coins) * CREATOR_CUT;

// Límites de tier
export const MAX_TIERS_PER_CREATOR = 3;
export const TIER_PRICE_MIN_USD = 1;
export const TIER_PRICE_MAX_USD = 500;

// Subscription
export const SUBSCRIPTION_PERIOD_DAYS = 30;

// ── Admin & operaciones ──────────────────────────────────────────────────────
// Super admin hardcoded. Fuente única de verdad — NO duplicar en otros archivos.
// Defensa en profundidad ante manipulación de is_admin flag en DB (breach,
// SQL injection, error de operación). Este email siempre pasa isAdmin() aunque
// no exista la fila en profiles.
export const SUPER_ADMIN_EMAIL = 'orbys85@gmail.com';

// ── Feature flags (kill switches runtime) ───────────────────────────────────
// Se leen en cada request → cambiar env var + restart apaga la feature en <1min
// sin redeploy de código. Útil ante fallo agudo (adult moderation caída,
// LiveKit degradado, procesador de pago con outage).
//
// Valores: '0' o 'false' → desactivado. Cualquier otro (incluido undefined) → activo.
export const isFeatureEnabled = (name) => {
  const v = process.env[`FEATURE_${name}_ENABLED`];
  return v !== '0' && v !== 'false';
};

// Middleware helper — retorna 503 si la feature está OFF
export const requireFeature = (name) => (req, res, next) => {
  if (isFeatureEnabled(name)) return next();
  return res.status(503).json({
    error: `Esta funcionalidad está temporalmente deshabilitada`,
    code: 'FEATURE_DISABLED',
    feature: name,
  });
};
