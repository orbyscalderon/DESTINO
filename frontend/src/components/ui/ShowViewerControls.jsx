import { useState } from 'react';
import { FiEye, FiSkipForward } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

// Controles del viewer durante un live show con private session activa:
//   - Spy: paga coins para ver el private show (sin ver el chat) — si el host
//     activó spy_mode_enabled.
//   - Skip queue: paga coins para saltarse la fila de private requests
//     pendientes.
//
// Props:
//   showId
//   spyEnabled, spyPrice    — del show.spy_mode_enabled / spy_mode_price_coins
//   inPrivate               — boolean: si hay private session activa en este show
//   onSpyStarted?           — callback al confirmar spy session
//   queueAhead              — cuántos viewers están delante en la queue (si aplica)
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

  // Si no hay nada por mostrar, no renderizar
  if (!inPrivate && queueAhead === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 backdrop-blur rounded-2xl border border-white/10">
      {inPrivate && spyEnabled && (
        <button
          onClick={startSpy}
          disabled={busy}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <FiEye size={14} /> Spy mode
          </span>
          <span className="text-xs font-mono">
            {spyPrice} coins
          </span>
        </button>
      )}

      {queueAhead > 0 && (
        <>
          {!showSkip ? (
            <button
              onClick={() => setShowSkip(true)}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:bg-brand-500/25 transition"
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <FiSkipForward size={14} /> Saltar fila
              </span>
              <span className="text-xs text-brand-400">
                {queueAhead} delante
              </span>
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="number" min="1" value={skipBid}
                onChange={(e) => setSkipBid(parseInt(e.target.value) || 0)}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-mono"
                placeholder="coins"
              />
              <button
                onClick={paySkip} disabled={busy}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? '…' : 'Pagar'}
              </button>
              <button
                onClick={() => setShowSkip(false)}
                className="px-3 py-2 rounded-lg bg-white/5 text-gray-400 text-sm"
              >
                X
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
