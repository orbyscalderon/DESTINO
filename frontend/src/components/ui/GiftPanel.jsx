import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const GIFTS = [
  { type: 'rose',    emoji: '🌹', label: 'Rosa',      coins: 10  },
  { type: 'heart',   emoji: '💝', label: 'Corazón',   coins: 50  },
  { type: 'diamond', emoji: '💎', label: 'Diamante',  coins: 200 },
  { type: 'crown',   emoji: '👑', label: 'Corona',    coins: 500 },
];

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
    <>
      {/* Backdrop invisible para cerrar */}
      <div className="absolute inset-0 z-30" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        transition={{ duration: 0.14 }}
        className="absolute bottom-[80px] right-14 z-40 w-64 bg-dark-800 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <div>
            <span className="text-white font-bold text-sm">Regalos</span>
            <span className="text-yellow-400 text-[10px] ml-2">⚡ {coinBalance.toLocaleString()}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><FiX size={14} /></button>
        </div>

        <div className="p-3 grid grid-cols-4 gap-1.5">
          {GIFTS.map(gift => (
            <button
              key={gift.type}
              onClick={() => handleSend(gift)}
              disabled={!!sending || coinBalance < gift.coins}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-all active:scale-90
                ${coinBalance >= gift.coins
                  ? 'bg-dark-700 border-white/10 hover:border-brand-500/40 hover:bg-dark-600'
                  : 'bg-dark-800 border-white/5 opacity-35 cursor-not-allowed'}
                ${sending === gift.type ? 'opacity-60' : ''}
              `}
            >
              <span className="text-xl leading-none">{gift.emoji}</span>
              <span className="text-white text-[9px] font-medium">{gift.label}</span>
              <span className="text-yellow-400 text-[9px] font-bold">
                {sending === gift.type ? '...' : `⚡${gift.coins}`}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
