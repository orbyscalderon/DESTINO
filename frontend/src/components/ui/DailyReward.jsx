import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiZap } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const DAY_REWARDS = [5, 10, 15, 20, 30, 50, 100];

export default function DailyReward() {
  const [visible, setVisible] = useState(false);
  const [streak, setStreak]   = useState(1);
  const [coins, setCoins]     = useState(5);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    api.get('/api/coins/daily-reward/status')
      .then(({ data }) => {
        if (data.alreadyClaimed) return;
        const nextStreak = Math.min((data.streak || 0) + 1, 7);
        setStreak(nextStreak);
        setCoins(DAY_REWARDS[nextStreak - 1] || 5);
        setTimeout(() => setVisible(true), 2000);
      })
      .catch(() => {});
  }, []);

  const handleClaim = async () => {
    if (claiming || claimed) return;
    setClaiming(true);
    try {
      const { data } = await api.post('/api/coins/daily-reward');
      setStreak(data.streak);
      setCoins(data.coins);
      setClaimed(true);
      toast.success(`+${data.coins} coins recibidos 🎉`);
      setTimeout(() => setVisible(false), 1800);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al reclamar');
    } finally {
      setClaiming(false);
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9997] glass-strong flex items-center justify-center p-4"
        onClick={() => setVisible(false)}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="w-full max-w-xs glass-strong rounded-3xl p-6 shadow-2xl shadow-black/60 text-center relative"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => setVisible(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
            <FiX size={18} />
          </button>

          <motion.div
            animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-6xl mb-3"
          >
            🎁
          </motion.div>

          <h2 className="text-xl font-black text-white mb-1">¡Recompensa diaria!</h2>
          <p className="text-gray-400 text-sm mb-5">Vuelve cada día para ganar más coins</p>

          {/* Racha */}
          <div className="flex justify-center gap-1.5 mb-5">
            {DAY_REWARDS.map((r, i) => (
              <div
                key={i}
                className={`flex flex-col items-center gap-0.5 w-9 rounded-xl py-1.5 transition-all ${
                  i < streak
                    ? 'bg-yellow-500/25 border border-yellow-500/50'
                    : i === streak - 1
                    ? 'bg-brand-500/30 border border-brand-500/60 scale-110'
                    : 'bg-dark-700 border border-white/5'
                }`}
              >
                <span className="text-[10px] font-black text-yellow-400">{r}</span>
                <FiZap size={9} className={i < streak ? 'text-yellow-400' : 'text-gray-600'} />
                <span className="text-[8px] text-gray-600">D{i + 1}</span>
              </div>
            ))}
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl py-3 mb-5">
            <p className="text-yellow-300 text-3xl font-black">+{coins}</p>
            <p className="text-gray-400 text-xs mt-0.5">coins · Día {streak} de racha</p>
          </div>

          <button
            onClick={handleClaim}
            disabled={claiming || claimed}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 shadow-glow hover:shadow-glow-lg"
          >
            {claimed
              ? '✓ Reclamado'
              : claiming
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><FiZap size={14} /> Reclamar {coins} coins</>
            }
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
