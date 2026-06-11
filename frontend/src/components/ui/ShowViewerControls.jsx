import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiEye, FiSkipForward, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

// Controles del viewer durante un live show con private session activa:
//   - Spy: paga coins para ver el private show (sin ver chat) — si el host
//     activó spy_mode_enabled.
//   - Skip queue: paga coins para saltarse la fila de private requests.

export default function ShowViewerControls({
  showId, spyEnabled, spyPrice, inPrivate, onSpyStarted, queueAhead = 0,
}) {
  const [busy, setBusy] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [skipBid, setSkipBid] = useState(50);

  const startSpy = async () => {
    if (!confirm(`¿Pagar ${spyPrice} coins para ver el private show? No verás el chat.`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/creator-monetization/shows/${showId}/spy-mode/start`);
      toast.success('Spy mode iniciado');
      onSpyStarted?.(r.data?.session_id);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'No se pudo iniciar spy mode');
    } finally { setBusy(false); }
  };

  const paySkip = async () => {
    if (!skipBid || skipBid < 1) return;
    setBusy(true);
    try {
      await api.post(`/api/creator-monetization/shows/${showId}/skip-queue`, { skip_price: skipBid });
      toast.success(`Pagaste ${skipBid} coins para saltar la fila`);
      setShowSkip(false);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error');
    } finally { setBusy(false); }
  };

  if (!inPrivate && queueAhead === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="flex flex-col gap-2 p-2.5 glass-strong rounded-2xl shadow-glow-sm"
    >
      {/* Spy mode button */}
      {inPrivate && spyEnabled && (
        <button
          onClick={startSpy}
          disabled={busy}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl
                     bg-amber-500/10 border border-amber-500/30 text-amber-200
                     hover:bg-amber-500/20 hover:border-amber-500/50 hover:-translate-y-0.5
                     transition-all duration-200 ease-out-expo
                     active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <FiEye size={14} /> Spy mode
          </span>
          <span className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30">
            {spyPrice} coins
          </span>
        </button>
      )}

      {/* Skip queue */}
      {queueAhead > 0 && (
        <AnimatePresence mode="wait" initial={false}>
          {!showSkip ? (
            <motion.button
              key="closed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSkip(true)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl
                         bg-brand-500/10 border border-brand-500/30 text-brand-200
                         hover:bg-brand-500/20 hover:border-brand-500/50 hover:-translate-y-0.5
                         transition-all duration-200 ease-out-expo"
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <FiSkipForward size={14} /> Saltar fila
              </span>
              <span className="text-xs tabular-nums text-brand-300">
                {queueAhead} delante
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="open"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex gap-2"
            >
              <input
                type="number" min="1" value={skipBid}
                onChange={(e) => setSkipBid(parseInt(e.target.value) || 0)}
                className="input-sm tabular-nums flex-1"
                placeholder="coins"
              />
              <button
                onClick={paySkip} disabled={busy}
                className="btn-primary text-xs py-2 px-3"
              >
                {busy ? '…' : 'Pagar'}
              </button>
              <button
                onClick={() => setShowSkip(false)}
                className="btn-ghost text-xs py-2 px-2"
                aria-label="Cancelar"
              >
                <FiX size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
