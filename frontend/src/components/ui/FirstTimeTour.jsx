import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiArrowRight, FiHeart, FiMessageCircle, FiVideo, FiZap, FiGift } from 'react-icons/fi';

// Tour interactivo que aparece la PRIMERA vez que un user con perfil
// completo entra a Home. 4 pasos: swipe, like/match, mensajes, shows live.
//
// Diseño:
// · Modal flotante, no pinpoints encima de elementos reales — los DOM
//   targets cambian con cada actualización y es frágil.
// · El "qué hacer" se explica con texto + íconos representativos.
// · Skip total con la X (se marca como visto igual).
// · localStorage flag de versión: si añadimos pasos en el futuro y bumpamos
//   la versión, los users existentes lo vuelven a ver.

const STORAGE_KEY = 'destino-first-tour-v1';

const STEPS = [
  {
    icon: FiHeart,
    color: 'from-red-500 to-pink-500',
    title: 'Descubre y desliza',
    body: 'En Descubrir verás perfiles uno a uno. Desliza a la derecha (o tap ❤️) si te gusta, a la izquierda (o tap ✕) si no. Es así de simple.',
  },
  {
    icon: FiMessageCircle,
    color: 'from-purple-500 to-brand-500',
    title: 'Cuando hacen match',
    body: 'Si la otra persona también te dio like, ¡es match! Se desbloquea el chat. Mándale un mensaje, no esperes a que te escriban primero.',
  },
  {
    icon: FiVideo,
    color: 'from-blue-500 to-cyan-500',
    title: 'Shows en vivo',
    body: 'En la pestaña Shows ves creadores transmitiendo ahora. Entras gratis, mandas chat, das propinas o regalos. Algunos hacen privados 1-a-1.',
  },
  {
    icon: FiZap,
    color: 'from-yellow-500 to-orange-500',
    title: 'Gana coins gratis',
    body: 'Invita a tus amigos con tu código de referido y ganas 50 coins por cada uno que se una. También entran 100 coins al verificar tu identidad.',
    cta: { label: 'Ir a mi código', to: '/referrals' },
  },
];

export default function FirstTimeTour({ skipFor }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (skipFor) return; // ej. user nuevo sin perfil → no mostrar todavía
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [skipFor]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setOpen(false);
  };

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current?.icon;

  if (!open || !current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] glass-strong flex items-end sm:items-center justify-center p-4"
        onClick={finish}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="glass-strong rounded-3xl p-6 w-full max-w-sm relative shadow-2xl shadow-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={finish}
            className="absolute top-3 right-3 text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"
            aria-label="Cerrar tutorial"
          >
            <FiX size={18} />
          </button>

          {/* Progreso */}
          <div className="flex gap-1 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-brand-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Ícono grande */}
          <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${current.color} flex items-center justify-center shadow-lg`}>
            <Icon size={28} className="text-white drop-shadow-md" />
          </div>

          {/* Texto */}
          <h3 className="text-xl font-bold text-white text-center mb-2">{current.title}</h3>
          <p className="text-gray-400 text-sm text-center leading-relaxed mb-6">{current.body}</p>

          {/* Botones */}
          <div className="flex flex-col gap-2">
            {current.cta && isLast && (
              <a
                href={`#${current.cta.to}`}
                onClick={finish}
                className="btn-primary w-full text-center flex items-center justify-center gap-2"
              >
                <FiGift size={16} /> {current.cta.label}
              </a>
            )}
            <button
              onClick={() => isLast ? finish() : setStep(s => s + 1)}
              className={isLast && !current.cta
                ? 'btn-primary w-full flex items-center justify-center gap-2'
                : 'btn-secondary w-full flex items-center justify-center gap-2'}
            >
              {isLast ? 'Empezar' : 'Siguiente'} <FiArrowRight size={14} />
            </button>
            {!isLast && (
              <button
                onClick={finish}
                className="text-xs text-gray-500 hover:text-gray-300 py-1"
              >
                Saltar tutorial
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
