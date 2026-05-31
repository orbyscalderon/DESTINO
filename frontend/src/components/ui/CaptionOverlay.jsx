import { motion, AnimatePresence } from 'framer-motion';

// Overlay de subtítulos en vivo. Estilo Netflix-ish.
// Props:
//   captions: [{ id, text, isFinal }] del hook useCaptionsViewer
//   bottom: distancia desde el fondo en px (default 80)
export default function CaptionOverlay({ captions, bottom = 80 }) {
  if (!captions || captions.length === 0) return null;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 max-w-[90%] sm:max-w-[70%] pointer-events-none"
      style={{ bottom }}
    >
      <AnimatePresence mode="popLayout">
        {captions.map(c => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: c.isFinal ? 1 : 0.85, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-1 text-center"
          >
            <span
              className={`inline-block px-3 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-white text-sm sm:text-base leading-snug ${
                c.isFinal ? 'font-semibold' : 'italic'
              }`}
              style={{ textShadow: '0 1px 2px rgba(0,0,0,.8)' }}
            >
              {c.text}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
