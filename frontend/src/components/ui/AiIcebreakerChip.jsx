import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiRefreshCw, FiX } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Chip que aparece arriba del input cuando el chat está vacío y es nuevo match.
// Click → llama a /api/ai/icebreaker y muestra 3 sugerencias. Click en una
// las pone en el input para que el user pueda editar y enviar.
//
// Props:
//   matchId — para el endpoint
//   onPick(text) — callback con la sugerencia elegida
//   onDismiss() — cerrar el chip
export default function AiIcebreakerChip({ matchId, onPick, onDismiss }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/ai/icebreaker', { match_id: matchId });
      setSuggestions(data.suggestions || []);
      setOpen(true);
    } catch (err) {
      if (err.response?.status === 503) toast.error('AI no configurado. Pídele al admin que añada OPENAI_API_KEY.');
      else if (err.response?.status === 429) toast.error('Límite por hora alcanzado');
      else toast.error('No se pudo generar');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between gap-2 bg-gradient-to-r from-brand-500/5 to-accent-500/5">
        <p className="text-xs text-gray-300 flex items-center gap-1.5">
          <span aria-hidden="true">💡</span>
          <span>¿No sabes qué decir? Genera ideas con AI.</span>
        </p>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1 bg-gradient-to-r from-brand-500 to-accent-500 hover:from-brand-400 hover:to-accent-400 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-out-expo disabled:opacity-50"
          >
            {loading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiZap size={11} />}
            Sugerir
          </button>
          <button onClick={onDismiss} className="text-gray-500 hover:text-white hover:bg-white/5 p-1 rounded-md transition-colors" aria-label="Cerrar">
            <FiX size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-white/5 space-y-2 bg-gradient-to-r from-brand-500/5 to-accent-500/5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-brand-400 font-bold flex items-center gap-1">
          <FiZap size={10} /> Sugerencias AI
        </span>
        <div className="flex gap-1">
          <button onClick={generate} disabled={loading} className="text-gray-400 hover:text-brand-400 hover:bg-white/5 p-1 rounded-md transition-colors" title="Regenerar">
            <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onDismiss} className="text-gray-500 hover:text-white hover:bg-white/5 p-1 rounded-md transition-colors" aria-label="Cerrar">
            <FiX size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence mode="popLayout">
        {suggestions.map((s, i) => (
          <motion.button
            key={s + i}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => { onPick(s); onDismiss(); }}
            className="w-full text-left text-sm text-gray-200 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-brand-500/40 px-3 py-2 rounded-xl transition-all duration-200 ease-out-expo active:scale-[0.98]"
          >
            {s}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
