import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiArrowRight, FiArrowLeft } from 'react-icons/fi';

// Tutorial paso-a-paso que aparece la PRIMERA vez que un creator entra
// a /studio. Se guarda completion en localStorage. El user puede cerrarlo
// con la X o navegar con flechas.

const STORAGE_KEY = 'destino-studio-onboarded-v1';

const STEPS = [
  {
    emoji: '🎬',
    title: 'Bienvenido al Estudio',
    body: 'Aquí lanzas tu show en vivo. Te pasamos por lo básico en 4 pasos rápidos.',
  },
  {
    emoji: '⚙️',
    title: 'Configura tu show',
    body: 'En el panel derecho (Config) pon título, categoría, precio del ticket y tarifas de show privado/exclusivo. El show privado deja que un viewer te pague para verte 1-a-1.',
  },
  {
    emoji: '📹',
    title: 'Arranca cámara y micrófono',
    body: 'Antes de ir en vivo dale al botón de preview para probar cámara/audio. Cuando todo se vea bien, presiona "Ir en vivo".',
  },
  {
    emoji: '⚔️',
    title: 'Battles · Co-hosts · Propinas',
    body: 'Una vez en vivo puedes lanzar Battles 1v1 contra otro creator (botón ⚔️), invitar Co-hosts, aceptar shows privados y ver tu meta de propinas. Los viewers te dan tips y regalos que se convierten en coins.',
  },
  {
    emoji: '💰',
    title: 'Cobra tus ganancias',
    body: 'Recibes 70% de cada propina, ticket y suscripción. Pide retiro desde el Dashboard → tab Ingresos cuando llegues al mínimo.',
  },
];

export default function StudioOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Esperamos 1.5s tras montar para no aparecer encima del countdown
        // de cargar el Studio inicial.
        const t = setTimeout(() => setOpen(true), 1500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setOpen(false);
  };

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] glass-strong flex items-center justify-center p-4"
          onClick={finish}
        >
          <motion.div
            initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 16 }}
            transition={{ type: 'spring', damping: 22 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="studio-tour-title"
            className="w-full max-w-md bg-gradient-to-br from-brand-600 via-pink-600 to-purple-700 rounded-3xl p-6 shadow-2xl shadow-brand-500/40"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-white/70 font-bold">
                Paso {step + 1} de {STEPS.length}
              </span>
              <button onClick={finish} aria-label="Cerrar tutorial" className="text-white/70 hover:text-white p-1 -m-1">
                <FiX size={18} />
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-5xl mb-3" aria-hidden="true">{current.emoji}</div>
              <h2 id="studio-tour-title" className="text-white font-black text-xl mb-2">{current.title}</h2>
              <p className="text-white/90 text-sm leading-relaxed">{current.body}</p>
            </div>

            {/* Progreso visual */}
            <div className="flex items-center justify-center gap-1.5 my-4">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Ir al paso ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex-1 bg-white/15 hover:bg-white/25 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1 transition-all duration-200 ease-out-expo active:scale-95"
                >
                  <FiArrowLeft size={14} /> Atrás
                </button>
              )}
              <button
                onClick={() => isLast ? finish() : setStep(s => s + 1)}
                className="flex-1 bg-white text-brand-700 font-black py-2.5 rounded-xl flex items-center justify-center gap-1 hover:bg-white/95 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-out-expo shadow-lg shadow-black/40"
                autoFocus
              >
                {isLast ? '¡Listo!' : <>Siguiente <FiArrowRight size={14} /></>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
