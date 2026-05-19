import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiHeart, FiMessageCircle } from 'react-icons/fi';

export default function MatchNotification({ match, onClose }) {
  const navigate = useNavigate();

  if (!match) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6"
      >
        {/* Animación de corazones */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.3, 1] }}
          transition={{ duration: 0.6, times: [0, 0.6, 1] }}
          className="text-6xl mb-4"
        >
          💕
        </motion.div>

        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-black gradient-text mb-2"
        >
          ¡Es un match!
        </motion.h1>

        <motion.p
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="text-gray-400 text-center mb-8"
        >
          Tú y {match.full_name} se gustaron mutuamente
        </motion.p>

        {/* Fotos */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex gap-4 mb-10"
        >
          {[match.myAvatar, match.avatar_url].map((src, i) => (
            <div key={i} className={`w-28 h-28 rounded-full overflow-hidden border-4 ${i === 0 ? 'border-brand-500' : 'border-green-500'}`}>
              <img
                src={src || `https://ui-avatars.com/api/?name=U&size=200&background=1a1a2e&color=f43f5e`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </motion.div>

        {/* Acciones */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3 w-full max-w-xs"
        >
          <button
            onClick={() => { onClose(); navigate(`/chat/${match.matchId}`); }}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <FiMessageCircle /> Enviar mensaje
          </button>
          <button onClick={onClose} className="btn-secondary w-full">
            Seguir explorando
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
