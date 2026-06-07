import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiShoppingBag, FiSmile } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';

// Panel deslizable que muestra los packs de stickers que posee el user.
// Click en un sticker → onSend({ sticker_id }). El padre llama al endpoint.
// Si no tiene packs, muestra CTA "Comprar packs" → /stickers.
export default function StickerPanel({ onClose, onSend }) {
  const [packs, setPacks] = useState([]);
  const [activePackId, setActivePackId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    api.get('/api/stickers/my')
      .then(({ data }) => {
        if (cancel) return;
        setPacks(data.packs || []);
        setActivePackId(data.packs?.[0]?.id || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const active = packs.find(p => p.id === activePackId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="absolute inset-x-0 bottom-0 z-40 glass-strong p-3 rounded-t-3xl shadow-2xl shadow-black/40 max-h-[60vh] flex flex-col"
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-white font-bold text-sm flex items-center gap-1.5">
          <FiSmile size={14} className="text-brand-400" /> Stickers
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors" aria-label="Cerrar">
          <FiX size={16} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-2 p-2">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="text-4xl mb-3 animate-float inline-block">🎟️</div>
          <p className="text-white font-bold mb-1">Sin packs todavía</p>
          <p className="text-gray-500 text-xs mb-4">Compra tu primer pack para enviar stickers.</p>
          <Link
            to="/stickers"
            onClick={onClose}
            className="btn-primary text-sm px-5 py-2 inline-flex items-center gap-2 shadow-glow"
          >
            <FiShoppingBag size={13} /> Tienda de stickers
          </Link>
        </div>
      ) : (
        <>
          {/* Tabs de packs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 mb-1 shrink-0">
            {packs.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePackId(p.id)}
                className={`shrink-0 w-10 h-10 rounded-xl overflow-hidden border-2 transition-all duration-150 ease-out-back active:scale-90 ${
                  p.id === activePackId ? 'border-brand-500 shadow-glow-sm' : 'border-white/10 hover:border-white/30'
                }`}
                title={p.name}
              >
                {p.cover_url ? (
                  <img src={p.cover_url} alt={p.name} className="w-full h-full object-cover" />
                ) : p.items?.[0]?.image_url ? (
                  <img src={p.items[0].image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center text-[10px] text-gray-500">{p.name?.[0]}</div>
                )}
              </button>
            ))}
            <Link
              to="/stickers"
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-xl border-2 border-dashed border-white/15 hover:border-brand-500 flex items-center justify-center text-gray-500 hover:text-brand-400 transition-colors"
              title="Tienda"
            >
              <FiShoppingBag size={14} />
            </Link>
          </div>

          {/* Grid de items del pack activo */}
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-4 gap-2 p-1">
              {(active?.items || []).map(item => (
                <button
                  key={item.id}
                  onClick={() => onSend({ sticker_id: item.id })}
                  className="aspect-square rounded-xl bg-white/5 border border-white/10 hover:border-brand-500/40 hover:bg-white/10 p-1 transition-all duration-150 ease-out-back active:scale-90 hover:scale-105"
                  title={item.label || ''}
                >
                  <img src={item.image_url} alt={item.label || ''} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
