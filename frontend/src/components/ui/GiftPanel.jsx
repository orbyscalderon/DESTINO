import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';
import SuccessConfetti from './SuccessConfetti.jsx';
import { playDing } from '../../lib/sounds.js';

const DEFAULT_GIFTS = [
  { type: 'rose',    emoji: '🌹', label: 'Rosa',     coins: 10  },
  { type: 'heart',   emoji: '💝', label: 'Corazón',  coins: 50  },
  { type: 'diamond', emoji: '💎', label: 'Diamante', coins: 200 },
  { type: 'crown',   emoji: '👑', label: 'Corona',   coins: 500 },
];

export default function GiftPanel({ showId, hostId, coinBalance, onClose, onGiftSent }) {
  const [sending, setSending] = useState(null);
  const [customGifts, setCustomGifts] = useState([]);
  const [celebrate, setCelebrate] = useState(false);
  const balance = Number(coinBalance) || 0;

  useEffect(() => {
    if (!hostId) return;
    api.get(`/api/shows/host/${hostId}/gifts/catalog`)
      .then(({ data }) => setCustomGifts(data.custom_gifts || []))
      .catch(() => {});
  }, [hostId]);

  // Unifico todos los regalos: custom primero si hay, luego default
  const allGifts = [
    ...customGifts.map(g => ({
      type:      `custom:${g.id}`,
      emoji:     g.emoji,
      image_url: g.image_url,
      label:     g.label,
      coins:     g.coins,
    })),
    ...DEFAULT_GIFTS,
  ];

  const handleSend = async (gift) => {
    if (sending) return;
    if (balance < gift.coins) {
      toast.error(`Necesitas ${gift.coins} coins. Tienes ${balance}.`);
      return;
    }
    setSending(gift.type);
    try {
      const { data } = await api.post(`/api/shows/${showId}/gift`, { gift_type: gift.type });
      onGiftSent?.(gift.type, gift.emoji || '🎁', data?.new_balance);
      toast.success(`${gift.emoji || '🎁'} ${gift.label} enviado`);
      playDing();
      setCelebrate(true);
      setTimeout(() => onClose(), 900);
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Coins insuficientes — recarga en la sección Coins');
      } else {
        toast.error(err.response?.data?.error || 'Error al enviar regalo');
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <SuccessConfetti show={celebrate} onDone={() => setCelebrate(false)} />
      <div className="absolute inset-0 z-30" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        transition={{ duration: 0.14 }}
        className="absolute bottom-[80px] right-14 z-40 w-72 max-h-[60vh] glass-strong rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 shrink-0 bg-dark-900/40">
          <div>
            <span className="text-white font-bold text-sm">Regalos</span>
            <span className="text-yellow-400 text-[10px] ml-2 font-bold">⚡ {balance.toLocaleString()}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white hover:bg-white/5 p-1 -m-1 rounded-lg transition-colors" aria-label="Cerrar"><FiX size={14} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {customGifts.length > 0 && (
            <p className="text-[9px] text-brand-400 uppercase tracking-wide font-bold">Del creador</p>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {customGifts.map(g => {
              const gift = { type: `custom:${g.id}`, emoji: g.emoji, image_url: g.image_url, label: g.label, coins: g.coins };
              return <GiftButton key={g.id} gift={gift} sending={sending} balance={balance} onSend={handleSend} />;
            })}
          </div>

          {customGifts.length > 0 && (
            <p className="text-[9px] text-gray-500 uppercase tracking-wide font-bold pt-2">Clásicos</p>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {DEFAULT_GIFTS.map(g => (
              <GiftButton key={g.type} gift={g} sending={sending} balance={balance} onSend={handleSend} />
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function GiftButton({ gift, sending, balance, onSend }) {
  const enabled = balance >= gift.coins;
  return (
    <button
      onClick={() => onSend(gift)}
      disabled={!!sending || !enabled}
      className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-all active:scale-90
        ${enabled
          ? 'bg-dark-700 border-white/10 hover:border-brand-500/40 hover:bg-dark-600'
          : 'bg-dark-800 border-white/5 opacity-35 cursor-not-allowed'}
        ${sending === gift.type ? 'opacity-60' : ''}
      `}
    >
      {gift.image_url ? (
        <img src={gift.image_url} alt={gift.label} className="w-6 h-6 object-contain" />
      ) : (
        <span className="text-xl leading-none">{gift.emoji}</span>
      )}
      <span className="text-white text-[9px] font-medium truncate w-full text-center">{gift.label}</span>
      <span className="text-yellow-400 text-[9px] font-bold">
        {sending === gift.type ? '...' : `⚡${gift.coins}`}
      </span>
    </button>
  );
}
