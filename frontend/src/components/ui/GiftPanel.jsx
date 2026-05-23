import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const GIFTS = [
  { type: 'rose',    emoji: '🌹', label: 'Rosa',      coins: 10  },
  { type: 'heart',   emoji: '💝', label: 'Corazón',   coins: 50  },
  { type: 'diamond', emoji: '💎', label: 'Diamante',  coins: 200 },
  { type: 'crown',   emoji: '👑', label: 'Corona',    coins: 500 },
];

/**
 * Panel deslizable para enviar regalos animados.
 * Props:
 *  - showId (string)
 *  - coinBalance (number)
 *  - onClose ()
 *  - onGiftSent (giftType, emoji) — callback para animar en pantalla
 */
export default function GiftPanel({ showId, coinBalance, onClose, onGiftSent }) {
  const [sending, setSending] = useState(null);

  const handleSend = async (gift) => {
    if (sending) return;
    if (coinBalance < gift.coins) {
      toast.error(`Necesitas ${gift.coins} coins. Tienes ${coinBalance}.`);
      return;
    }
    setSending(gift.type);
    try {
      await api.post(`/api/shows/${showId}/gift`, { gift_type: gift.type });
      onGiftSent?.(gift.type, gift.emoji);
      toast.success(`${gift.emoji} ${gift.label} enviado`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar regalo');
    } finally {
      setSending(null);
    }
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      className="fixed bottom-0 inset-x-0 z-50 bg-dark-800 border-t border-white/10 rounded-t-2xl p-5 pb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-sm">Enviar regalo</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <FiX size={18} />
        </button>
      </div>

      <p className="text-gray-500 text-xs mb-4">Tu saldo: <span className="text-yellow-400 font-bold">{coinBalance.toLocaleString()} coins</span></p>

      <div className="grid grid-cols-4 gap-3">
        {GIFTS.map(gift => (
          <button
            key={gift.type}
            onClick={() => handleSend(gift)}
            disabled={!!sending || coinBalance < gift.coins}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all
              ${coinBalance >= gift.coins
                ? 'bg-dark-700 border-white/10 hover:border-brand-500/40 hover:bg-dark-600 active:scale-95'
                : 'bg-dark-800 border-white/5 opacity-40 cursor-not-allowed'}
              ${sending === gift.type ? 'opacity-60' : ''}
            `}
          >
            <span className="text-2xl leading-none">{gift.emoji}</span>
            <span className="text-white text-[10px] font-medium">{gift.label}</span>
            <span className="text-yellow-400 text-[10px] font-bold">
              {sending === gift.type ? '...' : `⚡ ${gift.coins}`}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
