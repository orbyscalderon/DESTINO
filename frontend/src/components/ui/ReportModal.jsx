import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiFlag, FiChevronRight } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { id: 'fake_profile',    label: 'Perfil falso o impersonación',  emoji: '🎭' },
  { id: 'inappropriate',   label: 'Fotos o contenido inapropiado', emoji: '🔞' },
  { id: 'spam',            label: 'Spam o estafa',                 emoji: '⚠️' },
  { id: 'harassment',      label: 'Acoso o amenazas',              emoji: '😡' },
  { id: 'underage',        label: 'Posible menor de edad',         emoji: '🚸' },
  { id: 'hate_speech',     label: 'Discurso de odio',              emoji: '🚫' },
  { id: 'other',           label: 'Otro motivo',                   emoji: '💬' },
];

export default function ReportModal({ targetId, targetName, onClose }) {
  const [step, setStep]       = useState('category'); // 'category' | 'detail' | 'done'
  const [category, setCategory] = useState(null);
  const [detail, setDetail]   = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!category) return;
    setSending(true);
    try {
      await api.post('/api/blocks/report', {
        reportedId: targetId,
        reason: category.id,
        detail: detail.trim() || undefined,
      }).catch(() => {});
      setStep('done');
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
        className="fixed inset-0 z-[9995] glass-strong flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 60, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="w-full max-w-sm glass-strong rounded-3xl overflow-hidden shadow-2xl shadow-black/60"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="flex items-center gap-2">
              <FiFlag size={16} className="text-brand-400" />
              <h2 className="font-black text-white">
                {step === 'done' ? 'Reporte enviado' : `Reportar a ${targetName || 'usuario'}`}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors" aria-label="Cerrar">
              <FiX size={18} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {step === 'category' && (
              <motion.div key="cat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="px-5 text-gray-400 text-sm mb-3">¿Por qué estás reportando este perfil?</p>
                <div className="divide-y divide-white/5">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setCategory(cat); setStep('detail'); }}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="text-lg">{cat.emoji}</span>
                      <span className="text-sm text-gray-200 flex-1">{cat.label}</span>
                      <FiChevronRight size={14} className="text-gray-600" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'detail' && (
              <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-5 space-y-4">
                <div className="bg-dark-700/60 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">{category?.emoji}</span>
                  <p className="text-sm text-gray-300">{category?.label}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Detalles adicionales <span className="text-gray-600">(opcional)</span></label>
                  <textarea
                    className="input-field resize-none text-sm"
                    rows={3}
                    maxLength={500}
                    placeholder="Cuéntanos más sobre lo que pasó..."
                    value={detail}
                    onChange={e => setDetail(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep('category')} className="flex-1 btn-secondary text-sm py-2.5">
                    Atrás
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={sending}
                    className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {sending
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : 'Enviar reporte'
                    }
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-8 text-center">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-white font-semibold mb-1">Reporte recibido</p>
                <p className="text-gray-500 text-sm mb-5">Nuestro equipo revisará tu reporte en 24 horas. Gracias por mantener la comunidad segura.</p>
                <button onClick={onClose} className="btn-primary w-full">Cerrar</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
