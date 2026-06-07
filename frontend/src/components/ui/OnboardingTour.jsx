import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiX, FiArrowRight } from 'react-icons/fi';

const STEPS = [
  {
    emoji: '💕',
    title: '¡Bienvenido a Destino TV!',
    body: 'Conecta con personas reales cerca de ti. Desliza, habla y vive experiencias únicas.',
  },
  {
    emoji: '🔥',
    title: 'Descubre personas',
    body: 'Desliza a la derecha para dar like, a la izquierda para pasar. Si hay match, ¡podrán chatear!',
    action: { label: 'Ir a Descubrir', path: '/home' },
  },
  {
    emoji: '🎥',
    title: 'Video Aleatorio',
    body: 'Conéctate por video con alguien nuevo al instante. Filtra por país, género y más.',
    action: { label: 'Probar Video', path: '/video' },
  },
  {
    emoji: '📺',
    title: 'Shows en vivo',
    body: 'Crea o únete a shows en vivo. Envía propinas, regalos y conecta en tiempo real.',
    action: { label: 'Ver Shows', path: '/shows' },
  },
  {
    emoji: '⚡',
    title: 'Consigue Premium',
    body: 'Likes ilimitados, filtros avanzados, mensajes ilimitados y mucho más.',
    action: { label: 'Ver Premium', path: '/premium' },
  },
];

const STORAGE_KEY = 'Destino TV_onboarding_done';

export default function OnboardingTour() {
  const [step, setStep]     = useState(0);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Solo mostrar si el usuario nunca lo ha visto
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Pequeño delay para no interrumpir la carga
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  };

  const goTo = (path) => {
    finish();
    navigate(path);
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9998] glass-strong flex items-end sm:items-center justify-center p-4"
        onClick={finish}
      >
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="w-full max-w-sm glass-strong rounded-3xl p-6 shadow-2xl shadow-black/60"
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <div className="flex justify-between items-center mb-5">
            {/* Dots */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${i === step ? 'w-5 h-2 bg-brand-500' : 'w-2 h-2 bg-white/20'}`}
                />
              ))}
            </div>
            <button onClick={finish} className="text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
              <FiX size={18} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="text-center mb-7"
            >
              <div className="text-6xl mb-4">{current.emoji}</div>
              <h2 className="text-xl font-black text-white mb-2">{current.title}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">{current.body}</p>
            </motion.div>
          </AnimatePresence>

          {/* Acciones */}
          <div className="flex gap-2">
            {current.action && (
              <button
                onClick={() => goTo(current.action.path)}
                className="flex-1 btn-secondary text-sm py-2.5"
              >
                {current.action.label}
              </button>
            )}
            <button
              onClick={next}
              className={`flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-xl transition-colors ${
                current.action ? 'w-12 bg-brand-500 hover:bg-brand-600 text-white' : 'flex-1 btn-primary'
              }`}
            >
              {step < STEPS.length - 1
                ? current.action ? <FiArrowRight size={16} /> : <><FiArrowRight size={14} /> Siguiente</>
                : '¡Comenzar!'
              }
            </button>
          </div>

          <button onClick={finish} className="w-full text-center text-gray-600 text-xs mt-3 hover:text-gray-400 transition-colors">
            Omitir tutorial
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
