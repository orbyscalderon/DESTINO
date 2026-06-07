import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiFilm, FiImage, FiClock, FiVideo } from 'react-icons/fi';

// Sheet estilo Instagram: aparece al tocar el "+" del navbar.
// Opciones: Reel, Post (momento), Story, Show en vivo.
export default function CreateMenuSheet({ open, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const go = (path) => {
    onClose?.();
    navigate(path);
  };

  const items = [
    {
      label: 'Reel',
      sub: 'Video vertical corto (max 90s)',
      icon: FiFilm,
      color: 'from-pink-500 to-brand-500',
      to: '/reels/new',
    },
    {
      label: 'Post',
      sub: 'Foto o video para tu feed',
      icon: FiImage,
      color: 'from-blue-500 to-cyan-400',
      to: '/moments',  // El user puede crear post desde Moments
    },
    {
      label: 'Story',
      sub: '24 horas en tu perfil',
      icon: FiClock,
      color: 'from-yellow-400 to-orange-500',
      to: '/home',  // las stories se crean desde el StoriesBar de Home
    },
    {
      label: 'Show en vivo',
      sub: 'Transmitir ahora',
      icon: FiVideo,
      color: 'from-red-500 to-pink-500',
      to: '/show/new',
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 glass z-[70] flex items-end sm:items-center justify-center"
          onClick={onClose}
          role="dialog" aria-modal="true" aria-label="Crear contenido"
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md glass-strong rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl shadow-black/60"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            <div className="px-4 pb-3 pt-2 flex items-center justify-between border-b border-white/5">
              <h3 className="text-white font-bold">Crear</h3>
              <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
                <FiX size={20} />
              </button>
            </div>

            <ul className="py-2">
              {items.map(({ label, sub, icon: Icon, color, to }) => (
                <li key={label}>
                  <button
                    onClick={() => go(to)}
                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 transition-all duration-200 ease-out-expo text-left group active:scale-[0.99]"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-transform duration-200`}
                    >
                      <Icon className="text-white" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm group-hover:text-brand-300 transition-colors">{label}</p>
                      <p className="text-gray-500 text-xs">{sub}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* Safe area */}
            <div className="h-2 sm:h-0" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
