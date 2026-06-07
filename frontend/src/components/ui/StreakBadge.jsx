import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';

// Badge compacto que muestra la racha de daily check-in del user.
// Aparece en el header de Home. Click → /coins (donde está el panel completo).
//
// Estados:
// · streak === 0    → no se muestra
// · streak > 0 y alreadyClaimed → 🔥 N (color dorado, calm)
// · streak > 0 y NOT claimed    → 🔥 N + pulso brand (CTA visual)
//
// Fetches /api/coins/daily-reward/status — mismo endpoint que usa DailyReward.
export default function StreakBadge() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancel = false;
    api.get('/api/coins/daily-reward/status')
      .then(({ data }) => {
        if (cancel) return;
        const streak = data?.streak || 0;
        setState({ streak, claimed: !!data?.alreadyClaimed });
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  if (!state || state.streak === 0) return null;

  const claimable = !state.claimed;

  return (
    <AnimatePresence>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.2 }}
        onClick={() => navigate('/coins')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200 ease-out-expo active:scale-95 ${
          claimable
            ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-[0_0_18px_rgba(251,146,60,0.5)] hover:shadow-[0_0_28px_rgba(251,146,60,0.7)] animate-pulse'
            : 'bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25'
        }`}
        aria-label={claimable ? `Racha de ${state.streak} días — reclama hoy` : `Racha de ${state.streak} días`}
        title={claimable ? 'Reclama tu recompensa de hoy' : 'Tu racha de check-in diario'}
      >
        <span aria-hidden="true">🔥</span>
        <span className="tabular-nums">{state.streak}d</span>
      </motion.button>
    </AnimatePresence>
  );
}
