import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTag, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

// Promo code input reusable. Llama /api/creator-monetization/promo-codes/redeem
// y notifica al parent con onRedeem({ discount_pct, discount_coins, ... }).
// Type opcional para filtrar localmente: 'subscription' | 'collection' | 'tip'.
export default function PromoCodeInput({ type, onRedeem }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(null);

  const redeem = async (e) => {
    e?.preventDefault?.();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const r = await api.post('/api/creator-monetization/promo-codes/redeem', { code: code.trim() });
      if (type && r.data?.type && r.data.type !== type) {
        toast.error(`Este código es solo para ${r.data.type}`);
        return;
      }
      setApplied({ code: code.trim(), ...r.data });
      onRedeem?.({ code: code.trim(), ...r.data });
      toast.success(
        r.data.discount_pct
          ? `${r.data.discount_pct}% de descuento aplicado`
          : `${r.data.discount_coins} coins de descuento`
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código inválido');
    } finally {
      setSubmitting(false);
    }
  };

  const clear = () => {
    setApplied(null);
    setCode('');
    onRedeem?.(null);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {applied ? (
        <motion.div
          key="applied"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 shadow-glow-sm"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <FiCheck className="text-emerald-300" size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-300 leading-tight">
              Código aplicado: <code className="font-bold tracking-wider">{applied.code}</code>
            </p>
            <p className="text-[10px] text-emerald-200/70 mt-0.5">
              {applied.discount_pct ? `${applied.discount_pct}% descuento` : `${applied.discount_coins} coins menos`}
            </p>
          </div>
          <button
            onClick={clear}
            className="p-1.5 rounded-lg text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            aria-label="Quitar código"
          >
            <FiX size={14} />
          </button>
        </motion.div>
      ) : (
        <motion.form
          key="input"
          onSubmit={redeem}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 relative">
            <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Código promo"
              className="input-sm pl-9 font-mono uppercase tracking-wider"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="btn-secondary text-xs py-2 px-3 whitespace-nowrap"
          >
            {submitting ? '…' : 'Aplicar'}
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
