import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheck, FiZap, FiShoppingBag } from 'react-icons/fi';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import toast from 'react-hot-toast';

export default function Stickers() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/stickers/packs');
      setPacks(data.packs || []);
    } catch { toast.error('Error cargando packs'); }
    finally { setLoading(false); }
  };

  const handleBuy = async (pack) => {
    if (pack.owned) return;
    const ok = await confirm({
      title: `¿Comprar ${pack.name}?`,
      message: `Costo: ${pack.price_coins.toLocaleString()} coins. Una vez comprado, los stickers están disponibles en todos tus chats.`,
      confirmLabel: `Comprar ${pack.price_coins} coins`,
    });
    if (!ok) return;
    setPurchasing(pack.id);
    try {
      await api.post(`/api/stickers/packs/${pack.id}/purchase`);
      toast.success('¡Pack desbloqueado!');
      setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, owned: true } : p));
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Coins insuficientes — recarga en Coins');
      } else {
        toast.error(err.response?.data?.error || 'Error al comprar');
      }
    } finally { setPurchasing(null); }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-5xl mx-auto relative">
      <div className="absolute top-12 right-0 w-64 h-64 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float -z-10" />

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-2xl lg:text-3xl font-black gradient-text flex items-center gap-2">
          <FiShoppingBag size={24} /> Stickers
        </h1>
      </div>

      <p className="text-gray-400 text-sm mb-6 max-w-xl">
        Packs comprables con coins. Una vez desbloqueados, los stickers están disponibles en todos tus chats.
      </p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}
        </div>
      ) : packs.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4 animate-float inline-block">🎟️</div>
          <p className="text-white font-bold mb-1">Sin packs disponibles aún</p>
          <p className="text-gray-500 text-sm">Vuelve pronto.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {packs.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`card overflow-hidden flex flex-col transition-all duration-200 ease-out-expo ${
                p.owned ? 'border-green-500/30 shadow-[0_0_16px_rgba(34,197,94,0.15)]' : 'hover:border-brand-500/30 hover:-translate-y-0.5 hover:shadow-glow-sm'
              }`}
            >
              <div className="aspect-square bg-gradient-to-br from-dark-700 to-dark-800 relative overflow-hidden">
                {p.cover_url ? (
                  <img src={p.cover_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">🎟️</div>
                )}
                {p.is_featured && (
                  <span className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                    Destacado
                  </span>
                )}
                {p.owned && (
                  <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-green-500 border-2 border-dark-900 flex items-center justify-center shadow-lg">
                    <FiCheck size={13} className="text-white" />
                  </span>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-white text-sm font-bold truncate">{p.name}</p>
                {p.creator && (
                  <Link to={`/profile/${p.creator.id}`} className="text-[10px] text-gray-500 hover:text-brand-400 truncate flex items-center gap-1 transition-colors">
                    por {p.creator.full_name}
                    {p.creator.is_verified && <VerifiedBadge size={10} />}
                  </Link>
                )}
                {p.description && (
                  <p className="text-[11px] text-gray-500 line-clamp-2 mt-1">{p.description}</p>
                )}

                <div className="mt-auto pt-3 flex items-center justify-between">
                  <span className="text-yellow-400 text-xs font-bold flex items-center gap-1">
                    {p.price_coins === 0 ? 'Gratis' : <><FiZap size={10} /> {p.price_coins.toLocaleString()}</>}
                  </span>
                  <button
                    onClick={() => handleBuy(p)}
                    disabled={purchasing === p.id || p.owned}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 ease-out-expo active:scale-95 disabled:opacity-60 ${
                      p.owned
                        ? 'bg-green-500/15 border border-green-500/30 text-green-400 cursor-default'
                        : 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5'
                    }`}
                  >
                    {purchasing === p.id ? '…' : p.owned ? '✓ Tuyo' : 'Comprar'}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
