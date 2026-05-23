import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShield, FiX, FiCheck } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore.js';

export default function AgeVerificationModal({ onVerified, onClose }) {
  const [loading, setLoading] = useState(false);
  const { setProfile, profile } = useAuthStore();

  const handleVerify = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/profiles/verify-age');
      // Actualizar perfil en store para que no vuelva a mostrar el gate
      if (profile) setProfile({ ...profile, age_verified_at: data.age_verified_at });
      toast.success('Edad verificada');
      onVerified?.();
    } catch {
      toast.error('No se pudo verificar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-sm bg-dark-800 border border-white/10 rounded-2xl p-6 text-center shadow-2xl"
        >
          {onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <FiX size={18} />
            </button>
          )}

          <div className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔞</span>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Contenido para adultos</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Este contenido está restringido a mayores de <strong className="text-white">18 años</strong>.
            Al continuar confirmas que tienes la edad requerida y aceptas ver material para adultos.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><FiCheck size={16} /> Tengo 18 o más años — Continuar</>
              }
            </button>
            <button
              onClick={onClose}
              className="w-full btn-secondary py-3 text-gray-400"
            >
              Cancelar
            </button>
          </div>

          <p className="mt-4 text-[11px] text-gray-600 flex items-center justify-center gap-1">
            <FiShield size={10} /> Tu verificación es privada y no se comparte
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
