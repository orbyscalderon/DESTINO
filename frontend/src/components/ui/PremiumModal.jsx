import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiZap, FiMessageCircle, FiVideo, FiHeart, FiStar } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const features = [
  { icon: FiMessageCircle, text: 'Mensajes ilimitados sin restricciones' },
  { icon: FiVideo, text: 'Filtro de género en videollamadas' },
  { icon: FiHeart, text: 'Ver quién te dio like' },
  { icon: FiStar, text: 'Perfil destacado — apareces primero' },
  { icon: FiZap, text: 'Badge de verificado en tu perfil' },
];

export default function PremiumModal({ onClose }) {
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className="card w-full max-w-sm p-6 relative"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
            <FiX size={20} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FiZap size={28} className="text-black" />
            </div>
            <h2 className="text-2xl font-bold gradient-text">Hazte Premium</h2>
            <p className="text-gray-400 text-sm mt-1">Desbloquea todo sin límites</p>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-6">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} className="text-brand-400" />
                </div>
                {text}
              </li>
            ))}
          </ul>

          {/* Price */}
          <div className="bg-gradient-to-r from-brand-500/10 to-yellow-500/10 border border-brand-500/20 rounded-xl p-4 mb-4 text-center">
            <span className="text-3xl font-bold text-white">$20</span>
            <span className="text-gray-400 text-sm"> / mes</span>
            <p className="text-gray-500 text-xs mt-1">Cancela cuando quieras</p>
          </div>

          <button
            onClick={() => { onClose(); navigate('/premium'); }}
            className="btn-primary w-full text-center"
          >
            Comenzar ahora
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
