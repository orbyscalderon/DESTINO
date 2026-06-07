import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiZap } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const PRESETS = [10, 25, 50, 100, 200];

export default function TipModal({ userId, userName, onClose, onSent }) {
  const [amount, setAmount] = useState(25);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/api/tips/${userId}`, { amount, message });
      toast.success(`¡Propina de ${amount} monedas enviada!`);
      onSent?.(data.coins_remaining);
      onClose();
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 glass-strong flex items-end justify-center p-0"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="w-full max-w-md glass-strong rounded-t-3xl p-6 space-y-5 shadow-2xl shadow-black/60"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-lg">Enviar propina</h3>
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

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>≈ ${(amount * 0.05).toFixed(2)} USD</span>
            <span>{message.length}/200</span>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || amount < 1}
            className="btn-primary w-full disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><FiZap size={16} /> Enviar {amount} monedas</>
            )}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
