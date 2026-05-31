import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiArrowLeft, FiClock, FiStar, FiTag, FiArrowDown, FiArrowUp } from 'react-icons/fi';
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
};

// Categorizar para los filtros de pestañas
const INCOME_TYPES = new Set([
  'tip_received', 'gift_received', 'private_show_earning',
  'ppv_received', 'post_sale', 'video_sale', 'video_request_sale',
  'bonus', 'completion_reward', 'video_request_refund',
]);
const SPEND_TYPES = new Set([
  'tip_sent', 'gift_sent', 'private_show',
  'ppv_spent', 'post_purchase', 'video_purchase', 'video_request_escrow',
  'boost',
]);

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

  useEffect(() => {
    Promise.all([
      api.get('/api/coins/balance'),
      api.get('/api/coins/packages'),
      api.get('/api/coins/transactions'),
    ]).then(([b, p, t]) => {
      setBalance(b.data.coins || 0);
      setPackages(p.data.packages || []);
      setTransactions(t.data.transactions || []);
    }).finally(() => setLoading(false));
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

  // Formato consistente: separador de miles US (10,515 no 10.515)
  const fmtCoins = (n) => Number(n || 0).toLocaleString('en-US');
  const fmtUsd   = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black gradient-text">Coins</h1>
      </div>

      {/* Balance */}
      <div className="card p-6 mb-6 text-center bg-gradient-to-br from-yellow-500/10 to-brand-500/10 border-yellow-500/20">
        <FiZap className="text-yellow-400 mx-auto mb-2" size={32} />
        <p className="text-4xl font-black text-white">{fmtCoins(balance)}</p>
        <p className="text-gray-400 text-sm mt-1">≈ ${fmtUsd(balance * COIN_VALUE_USD)} USD</p>
      </div>

      {/* Banner Premium */}
      {!profile?.is_premium && (
        <Link to="/premium" className="block mb-6">
          <div className="card p-4 border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/5 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
              <FiStar className="text-yellow-400" size={18} />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Hazte Premium</p>
              <p className="text-gray-400 text-xs">Likes ilimitados · sin anuncios · filtros avanzados</p>
            </div>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 font-bold px-2 py-1 rounded-xl border border-yellow-500/30">VER</span>
          </div>
        </Link>
      )}

      {/* Paquetes */}
      <h2 className="font-semibold text-gray-300 mb-3">Comprar Coins</h2>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {packages.map((pkg, idx) => {
          const isBestValue = idx === BEST_VALUE_IDX;
          const isPopular   = idx === POPULAR_IDX;
          const bonus       = pkg.bonus_coins || 0;
          const totalCoins  = pkg.coins + bonus;
          const coinsPerDollar = pkg.price_usd > 0 ? Math.round(totalCoins / pkg.price_usd) : 0;
          const baseRate = 20; // 20 coins/$ = $0.05/coin (sin descuento)
          const discount = coinsPerDollar > baseRate ? Math.round(((coinsPerDollar - baseRate) / baseRate) * 100) : 0;

          return (
            <motion.button
              key={pkg.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleBuy(pkg)}
              disabled={!!buying}
              className={`card p-4 text-left transition-colors disabled:opacity-60 relative overflow-hidden ${
                isBestValue ? 'border-brand-500/50 bg-brand-500/5' :
                isPopular ? 'border-yellow-500/40 bg-yellow-500/5' :
                'hover:border-yellow-500/30'
              }`}
            >
              {isBestValue && (
                <div className="absolute top-0 right-0 bg-brand-500 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-xl flex items-center gap-0.5">
                  <FiTag size={8} /> MEJOR VALOR
                </div>
              )}
              {isPopular && (
                <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-bl-xl">
                  ⭐ POPULAR
                </div>
              )}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <FiZap className="text-yellow-400" size={16} />
                <span className="text-white font-bold">{fmtCoins(totalCoins)}</span>
                {bonus > 0 && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                    +{fmtCoins(bonus)} bonus
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-white">${pkg.price_usd}</p>
              <p className="text-gray-600 text-[10px] mt-0.5">
                {discount > 0
                  ? <span className="text-green-400">Ahorras {discount}%</span>
                  : <>${(pkg.price_usd / totalCoins).toFixed(3)} por coin</>
                }
              </p>
              {buying === pkg.id && (
                <div className="mt-2 w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              )}
            </motion.button>
          );
        })}
      </div>

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
      {transactions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-300 flex items-center gap-2">
              <FiClock size={14} /> Historial
            </h2>
            <div className="flex gap-1">
              {TX_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setTxFilter(f.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                    txFilter === f.key
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="card divide-y divide-white/5">
            {filteredTx.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-6">Sin transacciones en esta categoría</p>
            ) : filteredTx.map(t => {
              const meta = TX_LABELS[t.type] || { label: t.type, icon: '⚡' };
              const isPositive = t.amount > 0;
              return (
                <div key={t.id} className="flex items-center gap-3 p-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <span>{meta.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{meta.label}</p>
                    <p className="text-gray-600 text-xs">{new Date(t.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`font-bold text-sm flex items-center gap-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
                    {isPositive ? '+' : ''}{fmtCoins(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
