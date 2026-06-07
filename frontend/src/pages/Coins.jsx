import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiArrowLeft, FiClock, FiStar, FiTag, FiArrowDown, FiArrowUp, FiGift, FiTrendingUp, FiTrendingDown, FiAward } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import PaymentModal from '../components/ui/PaymentModal.jsx';
import { useAuthStore } from '../store/authStore.js';

// 1 coin = $0.05 USD (consistente con backend coinController)
const COIN_VALUE_USD = 0.05;

const BEST_VALUE_IDX = 2; // 3er paquete
const POPULAR_IDX    = 1; // 2do paquete

// Etiquetas en español de los tipos de transacción que vienen del backend.
// Mantener sincronizado con coinController/showController/etc.
const TX_LABELS = {
  purchase:              { label: 'Compra de coins',    icon: '💳' },
  bonus:                 { label: 'Bonus',              icon: '🎁' },
  completion_reward:     { label: 'Perfil completado',  icon: '✅' },
  boost:                 { label: 'Boost de perfil',    icon: '⚡' },
  tip_sent:              { label: 'Propina enviada',    icon: '💸' },
  tip_received:          { label: 'Propina recibida',   icon: '💰' },
  gift_sent:             { label: 'Regalo enviado',     icon: '🎁' },
  gift_received:         { label: 'Regalo recibido',    icon: '🎁' },
  private_show:          { label: 'Show privado',       icon: '🔒' },
  private_show_earning:  { label: 'Ganancia privado',   icon: '🔒' },
  ppv_spent:             { label: 'PPV desbloqueado',   icon: '🔓' },
  ppv_received:          { label: 'PPV vendido',        icon: '💵' },
  post_purchase:         { label: 'Post desbloqueado',  icon: '🖼' },
  post_sale:             { label: 'Post vendido',       icon: '🖼' },
  video_purchase:        { label: 'Video desbloqueado', icon: '🎥' },
  video_sale:            { label: 'Video vendido',      icon: '🎥' },
  video_request_escrow:  { label: 'Encargo de video',   icon: '🎬' },
  video_request_refund:  { label: 'Reembolso encargo',  icon: '↩️' },
  video_request_sale:    { label: 'Encargo entregado',  icon: '🎬' },
  daily_reward:          { label: 'Recompensa diaria',  icon: '🎁' },
  referral_reward:       { label: 'Bonus por referido', icon: '🤝' },
};

// Categorizar para los filtros de pestañas
const INCOME_TYPES = new Set([
  'tip_received', 'gift_received', 'private_show_earning',
  'ppv_received', 'post_sale', 'video_sale', 'video_request_sale',
  'bonus', 'completion_reward', 'video_request_refund',
  'daily_reward', 'referral_reward',
]);
const SPEND_TYPES = new Set([
  'tip_sent', 'gift_sent', 'private_show',
  'ppv_spent', 'post_purchase', 'video_purchase', 'video_request_escrow',
  'boost',
]);

// Counter animado — interpolación de easeOut en 800ms.
// Útil para que el balance no se sienta "salir de la nada" al cargar.
function useAnimatedCounter(target, duration = 800) {
  const [value, setValue] = useState(0);
  const startRef = useRef(null);
  const startValueRef = useRef(0);

  useEffect(() => {
    startRef.current = null;
    startValueRef.current = value;
    let raf;
    const tick = (now) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic: rápido al inicio, suave al final
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(startValueRef.current + (target - startValueRef.current) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

export default function Coins() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null);
  const [txFilter, setTxFilter] = useState('all');
  const [packagesLoading, setPackagesLoading] = useState(true);

  const animatedBalance = useAnimatedCounter(balance);

  useEffect(() => {
    Promise.all([
      api.get('/api/coins/balance').then(r => setBalance(r.data.coins || 0)),
      api.get('/api/coins/packages').then(r => {
        setPackages(r.data.packages || []);
        setPackagesLoading(false);
      }),
      api.get('/api/coins/transactions').then(r => setTransactions(r.data.transactions || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const handleBuy = async (pkg) => {
    setBuying(pkg.id);
    try {
      const { data } = await api.post('/api/coins/purchase', { packageId: pkg.id });
      setPaymentModal({ clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId, pkg });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar el pago');
    } finally {
      setBuying(null);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    try {
      const confirm = await api.post('/api/coins/purchase/confirm', { paymentIntentId });
      setBalance(prev => confirm.data.coins ?? prev);
      const total = paymentModal.pkg.coins + (paymentModal.pkg.bonus_coins || 0);
      toast.success(`¡${fmtCoins(total)} coins añadidos!`);
      setPaymentModal(null);
      const t = await api.get('/api/coins/transactions');
      setTransactions(t.data.transactions || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al confirmar el pago');
    }
  };

  const TX_FILTERS = [
    { key: 'all',      label: 'Todo' },
    { key: 'income',   label: 'Ingresos' },
    { key: 'spend',    label: 'Gastos' },
    { key: 'purchase', label: 'Compras' },
  ];

  const filteredTx = useMemo(() => {
    if (txFilter === 'all')      return transactions;
    if (txFilter === 'income')   return transactions.filter(t => t.amount > 0 || INCOME_TYPES.has(t.type));
    if (txFilter === 'spend')    return transactions.filter(t => t.amount < 0 || SPEND_TYPES.has(t.type));
    if (txFilter === 'purchase') return transactions.filter(t => t.type === 'purchase');
    return transactions;
  }, [transactions, txFilter]);

  // Resumen del mes actual: cuánto ganó vs cuánto gastó.
  // Da contexto inmediato al user sin tener que scrollear el historial.
  const monthSummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let income = 0, spend = 0;
    for (const t of transactions) {
      const ts = new Date(t.created_at);
      if (ts < monthStart) continue;
      if (t.amount > 0) income += t.amount;
      else if (t.amount < 0) spend += Math.abs(t.amount);
    }
    return {
      income,
      spend,
      net: income - spend,
      monthLabel: now.toLocaleDateString('es', { month: 'long' }),
    };
  }, [transactions]);

  // Formato consistente: separador de miles US (10,515 no 10.515)
  const fmtCoins = (n) => Number(n || 0).toLocaleString('en-US');
  const fmtUsd   = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto relative">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-yellow-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      {/* Skeleton del header + balance para evitar layout shift */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-5 h-5 skeleton rounded" />
        <div className="w-20 h-7 skeleton rounded" />
      </div>
      <div className="card p-6 mb-6 h-32 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto relative">
      {/* Glow orbs decorativos — refuerzan el tema "coins/valor" sin distraer */}
      <div className="absolute top-12 right-4 w-72 h-72 bg-yellow-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute top-1/3 left-0 w-60 h-60 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="relative flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white transition-colors duration-200 ease-out-expo"
          aria-label="Volver"
        >
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black gradient-text">Coins</h1>
      </div>

      {/* Balance — hero con counter animado y resumen del mes */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="card p-6 mb-4 text-center bg-gradient-to-br from-yellow-500/15 via-yellow-500/5 to-brand-500/10 border-yellow-500/30 relative overflow-hidden"
      >
        {/* Glow decorativo */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

        <FiZap className="text-yellow-400 mx-auto mb-2" size={32} />
        <p className="text-5xl font-black text-white tabular-nums">
          {fmtCoins(animatedBalance)}
        </p>
        <p className="text-gray-400 text-sm mt-1">≈ ${fmtUsd(balance * COIN_VALUE_USD)} USD</p>

        {/* Resumen mensual mini */}
        {transactions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-left">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
                <FiTrendingUp size={14} className="text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Ingresos {monthSummary.monthLabel}</p>
                <p className="text-sm font-bold text-green-400 truncate">+{fmtCoins(monthSummary.income)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                <FiTrendingDown size={14} className="text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Gastos {monthSummary.monthLabel}</p>
                <p className="text-sm font-bold text-red-400 truncate">−{fmtCoins(monthSummary.spend)}</p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Banners: Referidos + Premium (lado a lado en móvil para ahorrar scroll) */}
      <div className="grid grid-cols-1 gap-2 mb-6">
        <Link to="/referrals" className="block">
          <motion.div whileTap={{ scale: 0.98 }} className="card p-3 border-brand-500/30 bg-gradient-to-r from-brand-500/10 to-purple-500/5 flex items-center gap-3 hover:border-brand-500/50 transition-colors">
            <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center shrink-0">
              <FiGift className="text-brand-400" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Invita y gana</p>
              <p className="text-gray-400 text-xs truncate">+50 coins por cada amigo que se una y compre</p>
            </div>
            <span className="text-[10px] bg-brand-500/20 text-brand-400 font-bold px-2 py-1 rounded-xl border border-brand-500/30 shrink-0">INVITAR</span>
          </motion.div>
        </Link>

        {!profile?.is_premium && (
          <Link to="/premium" className="block">
            <motion.div whileTap={{ scale: 0.98 }} className="card p-3 border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/5 flex items-center gap-3 hover:border-yellow-500/50 transition-colors">
              <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                <FiStar className="text-yellow-400" size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">Hazte Premium</p>
                <p className="text-gray-400 text-xs truncate">Likes ilimitados · sin anuncios</p>
              </div>
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 font-bold px-2 py-1 rounded-xl border border-yellow-500/30 shrink-0">VER</span>
            </motion.div>
          </Link>
        )}
      </div>

      {/* Paquetes — mejor valor full-width, resto en grid */}
      <h2 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
        <FiZap size={14} className="text-yellow-400" /> Comprar Coins
      </h2>

      {packagesLoading ? (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="card p-6 text-center mb-8">
          <p className="text-gray-500 text-sm">Sin paquetes disponibles ahora mismo</p>
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {/* Best value en grande arriba */}
          {packages[BEST_VALUE_IDX] && (
            <BestValueCard
              pkg={packages[BEST_VALUE_IDX]}
              buying={buying}
              onBuy={handleBuy}
              fmtCoins={fmtCoins}
            />
          )}

          {/* Resto en grid 2x */}
          <div className="grid grid-cols-2 gap-3">
            {packages.map((pkg, idx) => {
              if (idx === BEST_VALUE_IDX) return null;
              return (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  isPopular={idx === POPULAR_IDX}
                  buying={buying}
                  onBuy={handleBuy}
                  fmtCoins={fmtCoins}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal && (
          <PaymentModal
            clientSecret={paymentModal.clientSecret}
            amount={`$${paymentModal.pkg.price_usd}`}
            description={`${fmtCoins(paymentModal.pkg.coins + (paymentModal.pkg.bonus_coins || 0))} Coins`}
            onSuccess={handlePaymentSuccess}
            onClose={() => setPaymentModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Historial */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-300 flex items-center gap-2">
          <FiClock size={14} /> Historial
        </h2>
        {transactions.length > 0 && (
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mr-1 pr-1">
            {TX_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setTxFilter(f.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors shrink-0 ${
                  txFilter === f.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-2">🪙</div>
          <p className="text-white font-medium text-sm mb-1">Tu historial está vacío</p>
          <p className="text-gray-500 text-xs">Compra tu primer paquete o gana coins invitando amigos</p>
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {filteredTx.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Sin transacciones en esta categoría</p>
          ) : filteredTx.map(t => {
            const meta = TX_LABELS[t.type] || { label: t.type, icon: '⚡' };
            const isPositive = t.amount > 0;
            return (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <span>{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{meta.label}</p>
                  <p className="text-gray-600 text-xs">
                    {new Date(t.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className={`font-bold text-sm flex items-center gap-0.5 tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
                  {isPositive ? '+' : ''}{fmtCoins(t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Paquete destacado — full-width, layout horizontal con CTA grande.
// Es el primer punto de contacto visual con la decisión de compra.
function BestValueCard({ pkg, buying, onBuy, fmtCoins }) {
  const bonus = pkg.bonus_coins || 0;
  const totalCoins = pkg.coins + bonus;
  const coinsPerDollar = pkg.price_usd > 0 ? Math.round(totalCoins / pkg.price_usd) : 0;
  const discount = coinsPerDollar > 20 ? Math.round(((coinsPerDollar - 20) / 20) * 100) : 0;
  const isBusy = buying === pkg.id;

  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      onClick={() => onBuy(pkg)}
      disabled={!!buying}
      className="card p-4 w-full text-left transition-colors disabled:opacity-60 relative overflow-hidden border-brand-500/50 bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-purple-500/5 hover:border-brand-500/70"
    >
      {/* Badge ribbon top-right */}
      <div className="absolute top-0 right-0 bg-brand-500 text-white text-[9px] font-black px-2.5 py-1 rounded-bl-xl flex items-center gap-1 shadow-lg">
        <FiAward size={9} /> MEJOR VALOR
      </div>

      <div className="flex items-center gap-4">
        {/* Big coin visual */}
        <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 flex items-center justify-center shrink-0 border border-yellow-500/30">
          <FiZap className="text-yellow-400" size={26} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-white font-black text-2xl tabular-nums">{fmtCoins(totalCoins)}</span>
            <span className="text-gray-400 text-xs">coins</span>
            {bonus > 0 && (
              <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">
                +{fmtCoins(bonus)} bonus
              </span>
            )}
          </div>
          {discount > 0 && (
            <p className="text-green-400 text-xs font-semibold mt-0.5">Ahorras {discount}% vs base</p>
          )}
        </div>

        {/* Price + spinner */}
        <div className="text-right shrink-0">
          <p className="text-3xl font-black text-white tabular-nums">${pkg.price_usd}</p>
          <p className="text-gray-600 text-[10px]">${(pkg.price_usd / totalCoins).toFixed(3)}/coin</p>
          {isBusy && (
            <div className="mt-1 w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin ml-auto" />
          )}
        </div>
      </div>
    </motion.button>
  );
}

function PackageCard({ pkg, isPopular, buying, onBuy, fmtCoins }) {
  const bonus = pkg.bonus_coins || 0;
  const totalCoins = pkg.coins + bonus;
  const coinsPerDollar = pkg.price_usd > 0 ? Math.round(totalCoins / pkg.price_usd) : 0;
  const discount = coinsPerDollar > 20 ? Math.round(((coinsPerDollar - 20) / 20) * 100) : 0;
  const isBusy = buying === pkg.id;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onBuy(pkg)}
      disabled={!!buying}
      className={`card p-4 text-left transition-colors disabled:opacity-60 relative overflow-hidden ${
        isPopular ? 'border-yellow-500/40 bg-yellow-500/5' : 'hover:border-yellow-500/30'
      }`}
    >
      {isPopular && (
        <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-bl-xl">
          ⭐ POPULAR
        </div>
      )}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <FiZap className="text-yellow-400" size={16} />
        <span className="text-white font-bold tabular-nums">{fmtCoins(totalCoins)}</span>
        {bonus > 0 && (
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
            +{fmtCoins(bonus)}
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-white tabular-nums">${pkg.price_usd}</p>
      <p className="text-gray-600 text-[10px] mt-0.5">
        {discount > 0
          ? <span className="text-green-400">Ahorras {discount}%</span>
          : <>${(pkg.price_usd / totalCoins).toFixed(3)} por coin</>
        }
      </p>
      {isBusy && (
        <div className="mt-2 w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      )}
    </motion.button>
  );
}
