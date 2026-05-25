import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiArrowLeft, FiClock, FiStar, FiTag, FiFilter } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import PaymentModal from '../components/ui/PaymentModal.jsx';
import { useAuthStore } from '../store/authStore.js';

const BEST_VALUE_IDX = 2; // índice del paquete con mejor valor (3er paquete)
const POPULAR_IDX    = 1; // índice del más popular (2do paquete)

export default function Coins() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null); // { clientSecret, paymentIntentId, pkg }
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
      toast.success(`¡${paymentModal.pkg.coins} coins añadidos!`);
      setPaymentModal(null);
      const t = await api.get('/api/coins/transactions');
      setTransactions(t.data.transactions || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al confirmar el pago');
    }
  };

  const typeLabel = {
    purchase:       'Compra',
    tip_sent:       'Propina enviada',
    tip_received:   'Propina recibida',
    ppv_spent:      'PPV desbloqueado',
    ppv_received:   'PPV vendido',
    video_purchase: 'Vídeo desbloqueado',
    video_sale:     'Vídeo vendido',
    bonus:          'Bonus',
    refund:         'Reembolso',
    boost:          'Boost de visibilidad',
    show_tip:       'Propina en show',
    video_request:  'Solicitud de vídeo',
  };

  const TX_FILTERS = [
    { key: 'all',      label: 'Todo' },
    { key: 'income',   label: 'Ingresos' },
    { key: 'spend',    label: 'Gastos' },
    { key: 'purchase', label: 'Compras' },
  ];

  const INCOME_TYPES  = new Set(['tip_received', 'ppv_received', 'video_sale', 'bonus', 'refund', 'show_tip']);
  const SPEND_TYPES   = new Set(['tip_sent', 'ppv_spent', 'video_purchase', 'boost', 'video_request']);

  const filteredTx = useMemo(() => {
    if (txFilter === 'all')      return transactions;
    if (txFilter === 'income')   return transactions.filter(t => t.amount > 0 || INCOME_TYPES.has(t.type));
    if (txFilter === 'spend')    return transactions.filter(t => t.amount < 0 || SPEND_TYPES.has(t.type));
    if (txFilter === 'purchase') return transactions.filter(t => t.type === 'purchase');
    return transactions;
  }, [transactions, txFilter]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-20 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black gradient-text">Coins</h1>
      </div>

      {/* Balance */}
      <div className="card p-6 mb-6 text-center bg-gradient-to-br from-yellow-500/10 to-brand-500/10 border-yellow-500/20">
        <FiZap className="text-yellow-400 mx-auto mb-2" size={32} />
        <p className="text-4xl font-black text-white">{balance.toLocaleString()}</p>
        <p className="text-gray-400 text-sm mt-1">≈ ${(balance * 0.05).toFixed(2)} USD</p>
      </div>

      {/* Banner Premium trial si no es premium */}
      {!profile?.is_premium && (
        <Link to="/premium" className="block mb-6">
          <div className="card p-4 border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/5 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
              <FiStar className="text-yellow-400" size={18} />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Prueba Premium gratis 3 días</p>
              <p className="text-gray-400 text-xs">Likes ilimitados · sin anuncios · filtros avanzados</p>
            </div>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 font-bold px-2 py-1 rounded-xl border border-yellow-500/30">GRATIS</span>
          </div>
        </Link>
      )}

      {/* Paquetes */}
      <h2 className="font-semibold text-gray-300 mb-3">Comprar Coins</h2>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {packages.map((pkg, idx) => {
          const isBestValue = idx === BEST_VALUE_IDX;
          const isPopular   = idx === POPULAR_IDX;
          const coinsPerDollar = pkg.price_usd > 0 ? Math.round(pkg.coins / pkg.price_usd) : 0;
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
              <div className="flex items-center gap-2 mb-2">
                <FiZap className="text-yellow-400" size={16} />
                <span className="text-white font-bold">{pkg.coins.toLocaleString()}</span>
                {pkg.bonus && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                    {pkg.bonus}
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-white">${pkg.price_usd}</p>
              <p className="text-gray-600 text-[10px] mt-0.5">{coinsPerDollar} coins/$ </p>
              {buying === pkg.id && (
                <div className="mt-2 w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Historial */}
      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal && (
          <PaymentModal
            clientSecret={paymentModal.clientSecret}
            amount={`$${paymentModal.pkg.price_usd}`}
            description={`${paymentModal.pkg.coins.toLocaleString()} Coins`}
            onSuccess={handlePaymentSuccess}
            onClose={() => setPaymentModal(null)}
          />
        )}
      </AnimatePresence>

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
            ) : filteredTx.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-white text-sm">{typeLabel[t.type] || t.type}</p>
                  <p className="text-gray-600 text-xs">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`font-bold text-sm ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
