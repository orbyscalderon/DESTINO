import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiZap, FiCheck } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Display público del tip menu de un creador. Click en un item → modal de confirmación + pago en coins.
// Props:
//   creatorId
//   creatorName
//   compact: si true, muestra solo top 4
export default function TipMenuPublic({ creatorId, creatorName, compact = false, onRedeem }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);

  useEffect(() => {
    if (!creatorId) return;
    api.get(`/api/creator/${creatorId}/tip-menu`)
      .then(r => setItems(r.data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [creatorId]);

  const redeem = async (item) => {
    setRedeeming(item.id);
    try {
      const { data } = await api.post(`/api/creator/tip-menu/${item.id}/redeem`);
      toast.success(`${item.emoji || '💌'} ${item.label} enviado a ${creatorName}`);
      onRedeem?.(item, data);
      setConfirmItem(null);
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Coins insuficientes');
      } else {
        toast.error(err.response?.data?.error || 'Error');
      }
    } finally {
      setRedeeming(null);
    }
  };

  if (loading) return null;
  if (items.length === 0) return null;

  const list = compact ? items.slice(0, 4) : items;

  return (
    <>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            💌 Menú de propinas
          </h3>
          <span className="text-[10px] text-gray-500">{items.length} {items.length === 1 ? 'opción' : 'opciones'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {list.map(item => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => setConfirmItem(item)}
              disabled={redeeming === item.id}
              className="bg-dark-800 hover:bg-dark-700 active:bg-dark-700 rounded-xl p-3 text-left transition-colors disabled:opacity-50 border border-white/5 hover:border-brand-500/30"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">{item.emoji || '💌'}</span>
                <span className="bg-yellow-500/15 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  ⚡ {item.price_coins}
                </span>
              </div>
              <p className="text-sm font-semibold text-white line-clamp-1">{item.label}</p>
              {item.description && (
                <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{item.description}</p>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Modal de confirmación */}
      {confirmItem && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmItem(null); }}
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-dark-800 border border-white/10 rounded-2xl p-5 max-w-sm w-full text-center"
          >
            <div className="text-5xl mb-3">{confirmItem.emoji || '💌'}</div>
            <h3 className="text-white font-bold text-lg mb-1">{confirmItem.label}</h3>
            {confirmItem.description && (
              <p className="text-xs text-gray-400 mb-3">{confirmItem.description}</p>
            )}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2 mb-4 inline-flex items-center gap-2">
              <FiZap className="text-yellow-400" size={14} />
              <span className="text-yellow-400 font-bold">{confirmItem.price_coins} coins</span>
            </div>
            <p className="text-[11px] text-gray-500 mb-4">
              Enviar a <strong className="text-white">{creatorName}</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmItem(null)} className="btn-secondary flex-1 text-sm">
                Cancelar
              </button>
              <button onClick={() => redeem(confirmItem)} disabled={redeeming === confirmItem.id}
                className="btn-primary flex-1 text-sm flex items-center justify-center gap-1 disabled:opacity-50">
                {redeeming === confirmItem.id
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><FiCheck size={13} /> Enviar</>
                }
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
