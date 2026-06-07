import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiCheck } from 'react-icons/fi';
import { VIDEO_EFFECTS } from '../../lib/videoEffects.js';

const STORAGE_KEY = 'video_effect_v1';

export function loadSavedEffect() {
  try { return localStorage.getItem(STORAGE_KEY) || 'none'; } catch { return 'none'; }
}

export function saveEffect(effect) {
  try { localStorage.setItem(STORAGE_KEY, effect); } catch {}
}

// Botón compacto + popover con los 3 efectos.
// Props:
//   value:    current effect ('none' | 'blur' | 'beauty')
//   onChange: (effect) => void
//   className: extra clases del botón
export default function VideoEffectsButton({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = VIDEO_EFFECTS.find(e => e.id === value) || VIDEO_EFFECTS[0];
  const active = value !== 'none';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={`Efecto: ${current.label}`}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all relative ${
          active ? 'bg-purple-500/30 border border-purple-500/40 text-purple-300' : 'bg-white/15 text-white hover:bg-white/25'
        } ${className}`}
      >
        <FiZap size={16} />
        {active && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 ring-2 ring-black" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.19, 1, 0.22, 1] }}
            className="absolute bottom-full mb-2 right-0 z-50 glass-strong rounded-2xl p-1.5 shadow-2xl shadow-black/60 min-w-[200px]"
          >
            <p className="text-[9px] text-gray-500 uppercase font-bold px-2 py-1">Efecto de cámara</p>
            {VIDEO_EFFECTS.map(e => (
              <button
                key={e.id}
                onClick={() => { onChange?.(e.id); setOpen(false); }}
                className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  value === e.id ? 'bg-purple-500/15' : 'hover:bg-white/5'
                }`}
              >
                <span className="text-lg shrink-0 mt-0.5">{e.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-white">{e.label}</p>
                    {value === e.id && <FiCheck size={11} className="text-purple-400" />}
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{e.description}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
