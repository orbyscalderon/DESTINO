import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShield, FiX, FiCheck, FiHome } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore.js';

// Flag de sesión para que un rechazo no genere loop: la página que monta este
// modal puede leer sessionStorage.getItem('age_declined') === '1' antes de
// re-mostrarlo en el mismo pageview.
export const AGE_DECLINED_KEY = 'age_declined_at';
export function isAgeDeclinedRecently(maxAgeMs = 1000 * 60 * 30) {
  const ts = parseInt(sessionStorage.getItem(AGE_DECLINED_KEY) || '0', 10);
  return ts > 0 && (Date.now() - ts) < maxAgeMs;
}

export default function AgeVerificationModal({ onVerified, onClose }) {
  const [loading, setLoading] = useState(false);
  const { setProfile, profile } = useAuthStore();
  const navigate = useNavigate();
  const dialogRef = useRef(null);

  // a11y: Esc + body lock + focus restoration
  useEffect(() => {
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => { if (e.key === 'Escape') handleDecline(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      try { prevFocus?.focus?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/profiles/verify-age');
      if (profile) setProfile({ ...profile, age_verified_at: data.age_verified_at });
      sessionStorage.removeItem(AGE_DECLINED_KEY);
      toast.success('Edad verificada');
      onVerified?.();
    } catch {
      toast.error('No se pudo verificar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Cuando se rechaza, marcamos sessionStorage para que la página de origen
  // no re-monte el modal infinitamente. La página debe leer isAgeDeclinedRecently().
  const handleDecline = () => {
    sessionStorage.setItem(AGE_DECLINED_KEY, String(Date.now()));
    onClose?.();
  };

  const handleGoHome = () => {
    sessionStorage.setItem(AGE_DECLINED_KEY, String(Date.now()));
    onClose?.();
    navigate('/home');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-strong"
        onClick={e => { if (e.target === e.currentTarget) handleDecline(); }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="age-modal-title"
          aria-describedby="age-modal-desc"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="relative w-full max-w-sm glass-strong rounded-3xl p-6 text-center shadow-2xl shadow-black/60"
        >
          <button
            onClick={handleDecline}
            aria-label="Cerrar"
            className="absolute top-4 right-4 text-gray-500 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/60 rounded-lg p-1.5"
          >
            <FiX size={18} />
          </button>

          <div className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl" aria-hidden="true">🔞</span>
          </div>

          <h2 id="age-modal-title" className="text-xl font-bold text-white mb-2">
            Contenido para adultos
          </h2>
          <p id="age-modal-desc" className="text-gray-400 text-sm leading-relaxed mb-6">
            Este contenido está restringido a mayores de <strong className="text-white">18 años</strong>.
            Al continuar confirmas que tienes la edad requerida y aceptas ver material para adultos.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleVerify}
              disabled={loading}
              autoFocus
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><FiCheck size={16} /> Tengo 18 o más años — Continuar</>
              }
            </button>
            <button
              onClick={handleGoHome}
              className="w-full btn-secondary py-3 text-gray-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <FiHome size={14} /> Ir al inicio
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
