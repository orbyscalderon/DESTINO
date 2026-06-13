import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiMessageCircle, FiX } from 'react-icons/fi';
import { playSuccess } from '../../lib/sounds.js';

// Partículas de confetti generadas una sola vez
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,       // % desde la izquierda
  size: Math.random() * 8 + 5,  // px
  color: ['#f43f5e','#ec4899','#a855f7','#3b82f6','#10b981','#f59e0b','#ffffff'][Math.floor(Math.random() * 7)],
  delay: Math.random() * 0.8,
  duration: Math.random() * 1.5 + 1.5,
  rotation: Math.random() * 360,
  shape: Math.random() > 0.5 ? 'circle' : 'rect',
}));

function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', opacity: [1, 1, 0], rotate: p.rotation + 360 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          className="absolute top-0"
          style={{
            width: p.size,
            height: p.shape === 'circle' ? p.size : p.size * 0.6,
            background: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : 2,
            left: `${p.x}%`,
          }}
        />
      ))}
    </div>
  );
}

export default function MatchNotification({ match, onClose }) {
  const navigate = useNavigate();
  const audioRef = useRef(null);

  useEffect(() => {
    // Vibración en móvil + sound opt-in
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    playSuccess();
  }, []);

  if (!match) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gradient-to-b from-black/95 via-brand-950/90 to-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 overflow-hidden"
      >
        <Confetti />

        {/* Botón cerrar */}
        <button onClick={onClose} className="absolute top-6 right-6 text-white/40 hover:text-white hover:bg-white/10 p-2 -m-2 rounded-full transition-colors z-10" aria-label="Cerrar">
          <FiX size={22} />
        </button>

        {/* Emojis flotantes */}
        {['💕','✨','🌟','💖'].map((emoji, i) => (
          <motion.span
            key={i}
            className="absolute text-3xl pointer-events-none"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0], y: [0, -80] }}
            transition={{ delay: 0.4 + i * 0.2, duration: 2, repeat: Infinity, repeatDelay: 1.5 }}
            style={{ left: `${[15, 75, 40, 60][i]}%`, top: `${[60, 55, 70, 45][i]}%` }}
          >
            {emoji}
          </motion.span>
        ))}

        {/* Ícono principal */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: [0, 1.4, 1], rotate: [-30, 10, 0] }}
          transition={{ duration: 0.7, times: [0, 0.6, 1] }}
          className="text-7xl mb-3 z-10"
        >
          💕
        </motion.div>

        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-4xl font-black gradient-text mb-1 z-10 text-center"
        >
          ¡Es un match!
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-gray-300 text-center mb-10 z-10 text-sm"
        >
          Tú y <span className="text-white font-semibold">{match.full_name}</span> se gustaron mutuamente
        </motion.p>

        {/* Fotos solapadas */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="flex items-center justify-center mb-10 z-10"
        >
          {/* Mi foto */}
          <motion.div
            animate={{ x: [0, -4, 0] }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="relative"
            style={{ zIndex: 2 }}
          >
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-brand-500 shadow-2xl shadow-brand-500/40">
              <img
                src={match.myAvatar || `https://ui-avatars.com/api/?name=Yo&size=200&background=1a1a2e&color=f43f5e`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center border-2 border-black text-sm">❤️</div>
          </motion.div>

          {/* Separador */}
          <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center -mx-2 z-10 text-sm">
            ×
          </div>

          {/* Su foto */}
          <motion.div
            animate={{ x: [0, 4, 0] }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="relative"
            style={{ zIndex: 2 }}
          >
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-green-500 shadow-2xl shadow-green-500/40">
              <img
                src={match.avatar_url || `https://ui-avatars.com/api/?name=U&size=200&background=1a1a2e&color=f43f5e`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -left-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center border-2 border-black text-sm">💚</div>
          </motion.div>
        </motion.div>

        {/* Acciones */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="flex flex-col gap-3 w-full max-w-xs z-10"
        >
          <button
            onClick={() => { onClose(); navigate(`/chat/${match.matchId}`); }}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base font-bold shadow-glow hover:shadow-glow-lg"
          >
            <FiMessageCircle size={18} /> Enviar mensaje
          </button>
          <button onClick={onClose} className="btn-secondary w-full py-3 text-sm">
            Seguir explorando
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
