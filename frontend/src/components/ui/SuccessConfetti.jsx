import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Confetti de celebración liviano (sin librería extra) — usa partículas
// con framer-motion. Llamar con show=true al momento celebratorio
// (tip enviado, sub comprada, badge desbloqueado).
//
// Props:
//   show:   bool — activa el burst
//   colors: array de hex (default brand+accent)
//   onDone: callback al terminar
//   count:  partículas (default 36)

const DEFAULT_COLORS = ['#f43f5e', '#d946ef', '#fb7185', '#e879f9', '#fff'];

export default function SuccessConfetti({
  show, colors = DEFAULT_COLORS, onDone, count = 36,
}) {
  const [active, setActive] = useState(false);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!show) return;
    setActive(true);
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        x: (Math.random() - 0.5) * 600,
        y: -(Math.random() * 280 + 120),
        rotate: (Math.random() - 0.5) * 540,
        delay: Math.random() * 0.12,
        size: Math.random() * 6 + 4,
      }))
    );
    const t = setTimeout(() => {
      setActive(false);
      onDone?.();
    }, 1600);
    return () => clearTimeout(t);
  }, [show, count]);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 pointer-events-none z-[200] flex items-center justify-center">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.x, y: p.y, rotate: p.rotate, opacity: 0, scale: 0.4 }}
              transition={{ duration: 1.4, delay: p.delay, ease: [0.19, 1, 0.22, 1] }}
              className="absolute rounded-sm"
              style={{
                width: p.size,
                height: p.size * 0.55,
                background: p.color,
                boxShadow: `0 0 8px ${p.color}80`,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
