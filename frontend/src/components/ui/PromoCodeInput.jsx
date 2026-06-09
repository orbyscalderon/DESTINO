import { useState } from 'react';
import { FiTag, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

// Reusable promo code input. Llama /api/creator-monetization/promo-codes/redeem
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
      setApplied(r.data);
      onRedeem?.(r.data);
      toast.success(
        r.data.discount_pct
          ? `${r.data.discount_pct}% de descuento aplicado`
          : `${r.data.discount_coins} coins de descuento aplicados`
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

  if (applied) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
        <FiCheck className="text-emerald-400 shrink-0" size={16} />
        <span className="text-sm text-emerald-300 flex-1">
          Código <code className="font-bold">{code}</code> aplicado
        </span>
        <button onClick={clear} className="p-1 text-emerald-400/70 hover:text-emerald-300">
          <FiX size={14} />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={redeem} className="flex items-center gap-2">
      <div className="flex-1 relative">
        <FiTag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código promo"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-mono uppercase placeholder-gray-600"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !code.trim()}
        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 text-sm font-bold disabled:opacity-50"
      >
        {submitting ? '…' : 'Aplicar'}
      </button>
    </form>
  );
}
