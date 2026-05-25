import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiZap, FiMessageCircle, FiVideo, FiHeart, FiStar, FiShield, FiEyeOff } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  {
    key: 'premium',
    emoji: '⚡',
    name: 'Premium',
    price: '$9.99',
    color: 'brand',
    features: [
      { icon: FiHeart,        text: 'Ver quién te dio like' },
      { icon: FiVideo,        text: 'Iniciar videollamadas' },
      { icon: FiEyeOff,       text: 'Modo incógnito' },
      { icon: FiMessageCircle,text: 'Traducción de mensajes' },
      { icon: FiShield,       text: 'Sin anuncios' },
    ],
  },
  {
    key: 'vip',
    emoji: '👑',
    name: 'VIP',
    price: '$24.99',
    color: 'yellow',
    features: [
      { icon: FiStar, text: 'Todo lo de Premium' },
      { icon: FiStar, text: 'Creadores adultos' },
      { icon: FiStar, text: 'Shows adultos' },
      { icon: FiStar, text: 'Badge VIP en perfil' },
    ],
  },
];

export default function PremiumModal({ onClose, requiredTier = 'premium' }) {
  const navigate = useNavigate();
  const plan = requiredTier === 'vip' ? PLANS[1] : PLANS[0];
  const isVip = requiredTier === 'vip';

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

          <div className="text-center mb-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl ${isVip ? 'bg-yellow-500/20' : 'bg-brand-500/20'}`}>
              {plan.emoji}
            </div>
            <h2 className="text-xl font-black text-white">
              {isVip ? 'Función exclusiva VIP' : 'Función exclusiva Premium'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {isVip ? 'Desbloquea el plan VIP para acceder' : 'Desbloquea Premium o VIP para acceder'}
            </p>
          </div>

          <ul className="space-y-2.5 mb-5">
            {plan.features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-gray-300">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isVip ? 'bg-yellow-500/20' : 'bg-brand-500/20'}`}>
                  <Icon size={13} className={isVip ? 'text-yellow-400' : 'text-brand-400'} />
                </div>
                {text}
              </li>
            ))}
          </ul>

          <div className={`rounded-xl p-3 mb-4 text-center border ${isVip ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-brand-500/10 border-brand-500/20'}`}>
            <span className="text-2xl font-black text-white">{plan.price}</span>
            <span className="text-gray-400 text-sm"> / mes</span>
            <p className="text-gray-600 text-xs mt-0.5">Cancela cuando quieras</p>
          </div>

          <button
            onClick={() => { onClose(); navigate('/premium'); }}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${isVip ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'btn-primary'}`}
          >
            Ver planes {plan.emoji}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
