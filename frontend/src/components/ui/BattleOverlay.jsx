import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiZap, FiClock, FiAward } from 'react-icons/fi';
import { supabase } from '../../lib/supabase.js';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Overlay que se muestra ENCIMA del show cuando hay un battle live.
// Renderiza barra de score (Team 1 vs Team 2), timer countdown, botones
// "Apoyar a X" que disparan tip rápido.
//
// Props:
//   battleId: string
//   viewerSide?: 'host1' | 'host2' | 'viewer'  — para botones contextuales
//   onEnded?: (winnerId, scores) => void
export default function BattleOverlay({ battleId, viewerSide = 'viewer', onEnded }) {
  const [battle, setBattle] = useState(null);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [recentTips, setRecentTips] = useState([]); // [{ team, coins, id }]
  const [showWinner, setShowWinner] = useState(null); // { winner_id, score1, score2 }
  const channelRef = useRef(null);
  const recentIdRef = useRef(0);

  // Cargar battle inicial
  useEffect(() => {
    if (!battleId) return;
    let cancel = false;
    api.get(`/api/battles/${battleId}`).then(({ data }) => {
      if (cancel) return;
      setBattle(data.battle);
      setScore1(data.battle.score1_coins || 0);
      setScore2(data.battle.score2_coins || 0);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [battleId]);

  // Subscribirse al channel realtime
  useEffect(() => {
    if (!battleId) return;
    const ch = supabase.channel(`battle:${battleId}`);
    ch.on('broadcast', { event: 'score_changed' }, ({ payload }) => {
      setScore1(payload.score1);
      setScore2(payload.score2);
      // Animación de tip
      recentIdRef.current++;
      const id = recentIdRef.current;
      setRecentTips(prev => [...prev, { id, team: payload.team, coins: payload.coins }]);
      setTimeout(() => setRecentTips(prev => prev.filter(t => t.id !== id)), 2000);
    });
    ch.on('broadcast', { event: 'battle_ended' }, ({ payload }) => {
      setShowWinner(payload);
      onEnded?.(payload.winner_id, payload);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [battleId, onEnded]);

  // Timer countdown
  useEffect(() => {
    if (!battle || battle.status !== 'live' || !battle.started_at) return;
    const calc = () => {
      const elapsed = Math.floor((Date.now() - new Date(battle.started_at).getTime()) / 1000);
      const total = (battle.duration_minutes || 5) * 60;
      const left = Math.max(0, total - elapsed);
      setSecondsLeft(left);
      // Auto-end cuando llega a 0 — solo los hosts disparan
      if (left === 0 && !showWinner && (viewerSide === 'host1' || viewerSide === 'host2')) {
        api.post(`/api/battles/${battleId}/end`).catch(() => {});
      }
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [battle, battleId, showWinner, viewerSide]);

  const totalScore = score1 + score2;
  const pct1 = totalScore > 0 ? (score1 / totalScore) * 100 : 50;
  const pct2 = 100 - pct1;

  const handleTip = async (team, coins) => {
    try {
      await api.post(`/api/battles/${battleId}/tip`, { team, coins });
      // El score llega vía broadcast (no necesitamos optimistic)
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Coins insuficientes');
      } else {
        toast.error(err.response?.data?.error || 'Error al apoyar');
      }
    }
  };

  if (!battle || battle.status === 'rejected' || battle.status === 'cancelled') return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <>
      {/* Score + Timer overlay (top center) */}
      <div className="absolute top-12 left-2 right-2 z-30 pointer-events-none">
        {/* Score bar */}
        <div className="relative bg-black/50 backdrop-blur-md rounded-full p-1 flex items-center overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-pink-500 to-pink-400 transition-all duration-500"
            style={{ width: `${pct1}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-gradient-to-l from-blue-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${pct2}%` }}
          />
          {/* Hosts info encima */}
          <div className="relative w-full flex items-center px-2 py-1">
            <div className="flex items-center gap-1.5 z-10">
              <img
                src={battle.host1?.avatar_url || '/avatar-placeholder.png'}
                alt={`Host 1: ${battle.host1?.full_name || ''}`}
                className="w-7 h-7 rounded-full border-2 border-white object-cover"
              />
              <div>
                <p className="text-white text-[10px] font-bold leading-none">{battle.host1?.full_name?.split(' ')[0]}</p>
                <p className="text-white text-xs font-black leading-none mt-0.5">{score1}</p>
              </div>
            </div>
            {/* Timer center */}
            <div className="mx-auto bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full flex items-center gap-1 z-10">
              <FiClock size={11} className="text-white" />
              <span className="text-white font-bold text-xs tabular-nums">
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 z-10">
              <div className="text-right">
                <p className="text-white text-[10px] font-bold leading-none">{battle.host2?.full_name?.split(' ')[0]}</p>
                <p className="text-white text-xs font-black leading-none mt-0.5">{score2}</p>
              </div>
              <img
                src={battle.host2?.avatar_url || '/avatar-placeholder.png'}
                alt={`Host 2: ${battle.host2?.full_name || ''}`}
                className="w-7 h-7 rounded-full border-2 border-white object-cover"
              />
            </div>
          </div>
        </div>

        {/* Tips flotantes */}
        <AnimatePresence>
          {recentTips.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 1, y: -30, scale: 1 }}
              exit={{ opacity: 0, y: -60 }}
              transition={{ duration: 1.8 }}
              className={`absolute top-12 ${t.team === 1 ? 'left-4' : 'right-4'} font-black text-2xl`}
              style={{ color: t.team === 1 ? '#ec4899' : '#06b6d4' }}
            >
              +{t.coins} 🪙
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Tip buttons para viewers (bottom area, encima del chat) */}
      {viewerSide === 'viewer' && !showWinner && (
        <div className="absolute bottom-24 left-2 right-2 z-30 flex gap-2 pointer-events-auto">
          <button
            onClick={() => handleTip(1, 10)}
            className="flex-1 bg-pink-500/90 hover:bg-pink-500 backdrop-blur-md text-white font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow-lg"
          >
            <FiZap size={13} /> Apoyar a {battle.host1?.full_name?.split(' ')[0] || 'Host 1'} · 10🪙
          </button>
          <button
            onClick={() => handleTip(2, 10)}
            className="flex-1 bg-blue-500/90 hover:bg-blue-500 backdrop-blur-md text-white font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow-lg"
          >
            <FiZap size={13} /> Apoyar a {battle.host2?.full_name?.split(' ')[0] || 'Host 2'} · 10🪙
          </button>
        </div>
      )}

      {/* Pantalla de ganador */}
      <AnimatePresence>
        {showWinner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/80 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <FiAward className="text-white mx-auto mb-3 drop-shadow-lg" size={56} />
              <h2 className="text-white font-black text-2xl mb-2">
                {showWinner.winner_id ? '¡Tenemos ganador!' : '¡Empate!'}
              </h2>
              {showWinner.winner_id && (
                <p className="text-white/95 font-bold text-lg mb-3">
                  {showWinner.winner_id === battle.host1_id
                    ? battle.host1?.full_name
                    : battle.host2?.full_name}
                </p>
              )}
              <div className="bg-black/30 backdrop-blur-md rounded-xl p-3 text-white font-bold flex items-center justify-around mb-4">
                <span>{showWinner.score1}</span>
                <span className="text-white/60">vs</span>
                <span>{showWinner.score2}</span>
              </div>
              <button
                onClick={() => setShowWinner(null)}
                className="bg-white text-orange-600 font-black px-6 py-2.5 rounded-xl hover:brightness-110"
              >
                Continuar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
