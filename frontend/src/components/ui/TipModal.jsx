import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiZap } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';
import PromoCodeInput from './PromoCodeInput.jsx';
import SuccessConfetti from './SuccessConfetti.jsx';
import { playDing } from '../../lib/sounds.js';
import { useFocusTrap } from '../../lib/useFocusTrap.js';

const PRESETS = [10, 25, 50, 100, 200];

export default function TipModal({ userId, userName, onClose, onSent }) {
  const [amount, setAmount] = useState(25);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [promo, setPromo] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const trapRef = useFocusTrap(true, { onEscape: onClose });

  // v70: cálculo de cantidad final aplicando promo (si type='tip' y matchea)
  const finalAmount = (() => {
    if (!promo || promo.type !== 'tip') return amount;
    if (promo.discount_pct) return Math.max(1, Math.round(amount * (1 - promo.discount_pct / 100)));
    if (promo.discount_coins) return Math.max(1, amount - promo.discount_coins);
    return amount;
  })();

  const handleSend = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/api/tips/${userId}`, {
        amount: finalAmount, message,
        ...(promo ? { promo_code: promo.code } : {}),
      });
      toast.success(`¡Propina de ${finalAmount} monedas enviada! 💕`);
      playDing();
      setCelebrate(true);
      onSent?.(data.coins_remaining);
      // Esperar a que termine el burst antes de cerrar
      setTimeout(() => onClose(), 900);
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Monedas insuficientes — recarga en la sección Monedas');
      } else {
        toast.error(err.response?.data?.error || 'Error al enviar la propina');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      <SuccessConfetti show={celebrate} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 glass-strong flex items-end justify-center p-0"
        onClick={onClose}
      >
        <motion.div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tip-modal-title"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="w-full max-w-md glass-strong rounded-t-3xl p-6 space-y-5 shadow-2xl shadow-black/60"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 id="tip-modal-title" className="text-white font-bold text-lg">Enviar propina</h3>
              <p className="text-gray-500 text-sm">a {userName}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors" aria-label="Cerrar">
              <FiX size={15} />
            </button>
          </div>

          {/* Amount presets */}
          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ease-out-expo active:scale-95 ${
                  amount === p
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white scale-105 shadow-glow'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="relative">
            <FiZap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="number"
              min="1"
              max="5000"
              value={amount}
              onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="input-field pl-9 text-sm"
              placeholder="Cantidad personalizada"
            />
          </div>

          {/* Message */}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Mensaje (opcional)"
            className="input-field text-sm resize-none"
          />

          {/* v70: Promo code opcional */}
          <PromoCodeInput type="tip" onRedeem={setPromo} />

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>≈ ${(finalAmount * 0.05).toFixed(2)} USD</span>
            <span>{message.length}/200</span>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || finalAmount < 1}
            className="btn-primary w-full disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <FiZap size={16} /> Enviar {finalAmount} monedas
                {promo && finalAmount !== amount && (
                  <span className="text-xs opacity-70 line-through ml-1">{amount}</span>
                )}
              </>
            )}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
