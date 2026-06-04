import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowRight, FiX } from 'react-icons/fi';

const STEPS = [
  {
    emoji: '👆',
    title: '¡Bienvenido a Destino TV!',
    desc: 'Desliza las cartas hacia la derecha si alguien te gusta, o hacia la izquierda para pasar. También puedes usar los botones.',
    highlight: null,
  },
  {
    emoji: '💬',
    title: 'Cuando hay match…',
    desc: 'Si la otra persona también te da like, ¡es un match! Podrán chatear libremente desde la sección de Matches.',
    highlight: null,
  },
  {
    emoji: '🎥',
    title: 'Video y Shows en vivo',
    desc: 'Conecta por videollamada aleatoria o únete a shows en vivo de creadores. Disponible en el menú inferior.',
    highlight: null,
  },
  {
    emoji: '⭐',
    title: 'Premium desbloquea todo',
    desc: 'Likes ilimitados, Super Like, ver quién te gustó, deshacer swipes y mucho más con Destino TV Premium.',
    highlight: null,
  },
];

export default function TutorialOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-sm bg-dark-800 rounded-3xl border border-white/10 p-7 shadow-2xl relative"
      >
        <button
          onClick={onDone}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
         aria-label="Cerrar">
          <FiX size={15} />
        </button>

        <div className="text-6xl mb-5 text-center">{current.emoji}</div>
        <h2 className="text-xl font-black text-white mb-2 text-center">{current.title}</h2>
        <p className="text-gray-400 text-sm text-center leading-relaxed mb-7">{current.desc}</p>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-dark-600'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => isLast ? onDone() : setStep(s => s + 1)}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {isLast ? '¡Empezar!' : (
            <>Siguiente <FiArrowRight size={15} /></>
          )}
        </button>
      </motion.div>
    </div>
  );
}
