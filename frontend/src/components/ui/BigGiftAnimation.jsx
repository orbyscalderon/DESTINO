import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Umbrales para mostrar animación grande full-screen.
// Coordinado con el backend en showController.GIFT_TYPES.
const BIG_GIFT_THRESHOLD = 200; // a partir de aquí: animación
const EPIC_THRESHOLD     = 1000; // animación "épica"

// Hook para gestionar una cola de animaciones (varios regalos seguidos no se pisan)
export function useGiftAnimationQueue() {
  const [queue, setQueue] = useState([]);
  const enqueue = (gift) => setQueue(q => [...q, { ...gift, _id: Date.now() + Math.random() }]);
  const dequeue = () => setQueue(q => q.slice(1));
  return { current: queue[0] || null, enqueue, dequeue, pendingCount: queue.length };
}

function getTier(coins) {
  if (coins >= EPIC_THRESHOLD) return 'epic';
  if (coins >= BIG_GIFT_THRESHOLD) return 'big';
  return null;
}

// Componente single-overlay que muestra una animación cuando recibe `gift`.
// Props:
//   gift: { senderName, avatar, emoji, image_url, coins, label }
//   onComplete: () => void
//   duration: ms (default 4000)
export default function BigGiftAnimation({ gift, onComplete, duration = 4000 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!gift) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onComplete?.(), 500); // espera exit anim
    }, duration);
    return () => clearTimeout(t);
  }, [gift, duration, onComplete]);

  if (!gift) return null;
  const tier = getTier(gift.coins);
  if (!tier) return null;

  const isEpic = tier === 'epic';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
        >
          {/* Backdrop con gradiente brillante */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isEpic ? 0.6 : 0.4 }}
            className={`absolute inset-0 ${
              isEpic
                ? 'bg-gradient-radial from-yellow-500/40 via-pink-500/30 to-transparent'
                : 'bg-gradient-radial from-brand-500/30 via-purple-500/20 to-transparent'
            }`}
            style={{
              background: isEpic
                ? 'radial-gradient(circle at center, rgba(250,204,21,.5), rgba(244,63,94,.3), transparent 70%)'
                : 'radial-gradient(circle at center, rgba(244,63,94,.4), rgba(168,85,247,.2), transparent 65%)'
            }}
          />

          {/* Confetti / partículas */}
          {isEpic && (
            <>
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    y: -100, x: (Math.random() - 0.5) * window.innerWidth,
                    opacity: 0, scale: 0,
                  }}
                  animate={{
                    y: window.innerHeight + 100,
                    opacity: [0, 1, 1, 0],
                    scale: [0, 1, 1, 0.8],
                    rotate: Math.random() * 720,
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    delay: Math.random() * 1.5,
                    ease: 'easeIn',
                  }}
                  className="absolute text-3xl pointer-events-none"
                >
                  {['⭐', '✨', '💎', '🌟', '👑'][Math.floor(Math.random() * 5)]}
                </motion.div>
              ))}
            </>
          )}

          {/* El regalo en sí */}
          <motion.div
            initial={{ scale: 0, rotate: -180, y: 60 }}
            animate={{
              scale: [0, 1.4, 1.0, 1.1, 1.0],
              rotate: [-180, 0, -10, 10, 0],
              y: [60, 0, -20, 0],
            }}
            transition={{ duration: 1.2, times: [0, 0.4, 0.6, 0.8, 1], ease: 'easeOut' }}
            className="relative flex flex-col items-center"
          >
            {/* El gift visual */}
            {gift.image_url ? (
              <img src={gift.image_url} alt="" className="w-40 h-40 object-contain drop-shadow-2xl" />
            ) : (
              <div
                className="text-[140px] leading-none drop-shadow-2xl"
                style={{ filter: 'drop-shadow(0 10px 30px rgba(244,63,94,.5))' }}
              >
                {gift.emoji || '🎁'}
              </div>
            )}

            {/* Brillo pulsante */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                boxShadow: [
                  '0 0 30px rgba(244,63,94,.3)',
                  '0 0 80px rgba(244,63,94,.6)',
                  '0 0 30px rgba(244,63,94,.3)',
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />

            {/* Texto */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-4 text-center"
            >
              <p className={`font-black ${isEpic ? 'text-3xl bg-gradient-to-r from-yellow-300 to-pink-300 bg-clip-text text-transparent' : 'text-2xl text-white'}`}>
                {gift.label || 'Regalo'}
              </p>
              <p className="text-yellow-400 font-bold text-lg mt-1">
                ⚡ {gift.coins.toLocaleString('en-US')} coins
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {gift.avatar && (
                  <img src={gift.avatar} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-white/30" />
                )}
                <p className="text-white/80 text-sm">
                  de <strong className="text-white">{gift.senderName || 'Alguien'}</strong>
                </p>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
