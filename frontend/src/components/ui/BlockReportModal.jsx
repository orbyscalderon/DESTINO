import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiSlash, FiFlag } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'inappropriate', label: 'Contenido inapropiado' },
  { value: 'harassment', label: 'Acoso o intimidación' },
  { value: 'fake', label: 'Perfil falso' },
  { value: 'other', label: 'Otro motivo' },
];

export default function BlockReportModal({ userId, userName, onClose, onBlocked }) {
  const [view, setView] = useState('menu'); // 'menu' | 'report'
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBlock = async () => {
    setLoading(true);
    try {
      await api.post('/api/blocks', { blockedId: userId });
      toast.success(`${userName} bloqueado`);
      onBlocked?.();
      onClose();
    } catch {
      toast.error('Error al bloquear');
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async () => {
    if (!reason) return toast.error('Selecciona un motivo');
    setLoading(true);
    try {
      await api.post('/api/blocks/report', { reportedId: userId, reason });
      toast.success('Reporte enviado. Lo revisaremos pronto.');
      onClose();
    } catch {
      toast.error('Error al reportar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 glass-strong" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="w-full max-w-sm glass-strong rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        {view === 'menu' ? (
          <>
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <p className="font-semibold text-white">{userName}</p>
              <button onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors" aria-label="Cerrar"><FiX /></button>
            </div>
            <div className="p-2">
              <button
                onClick={() => setView('report')}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 transition-colors text-left active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                  <FiFlag className="text-yellow-400" size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Reportar</p>
                  <p className="text-xs text-gray-500">Notificar comportamiento inapropiado</p>
                </div>
              </button>
              <button
                onClick={handleBlock}
                disabled={loading}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 transition-colors text-left active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                  <FiSlash className="text-brand-500" size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-400">Bloquear</p>
                  <p className="text-xs text-gray-500">No verás más a esta persona</p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-4 border-b border-white/5">
              <button onClick={() => setView('menu')} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"><FiX size={16} /></button>
              <p className="font-semibold text-white">Reportar a {userName}</p>
            </div>
            <div className="p-4 space-y-2">
              {REPORT_REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 ease-out-expo border active:scale-[0.98] ${
                    reason === r.value
                      ? 'border-brand-500/60 bg-brand-500/15 text-white shadow-glow-sm'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={handleReport}
                disabled={!reason || loading}
                className="btn-primary w-full mt-2 shadow-glow"
              >
                Enviar reporte
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
