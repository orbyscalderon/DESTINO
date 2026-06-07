import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FiTrendingUp, FiZap } from 'react-icons/fi';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import api from '../lib/api.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/shows/leaderboard')
      .then(({ data }) => setCreators(data.creators || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthName = new Date().toLocaleString('es', { month: 'long' });

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 lg:px-10 lg:pt-10 max-w-2xl mx-auto relative">
      <div className="absolute top-12 right-0 w-72 h-72 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute top-1/2 left-0 w-60 h-60 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="relative flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/20 ring-1 ring-yellow-500/30 flex items-center justify-center">
          <FiTrendingUp size={18} className="text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black gradient-text">Leaderboard</h1>
          <p className="text-xs text-gray-500 capitalize">Top creadores — {monthName}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : creators.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-4xl mb-3">🎭</p>
          <p className="text-gray-400 text-sm">Aún no hay datos para este mes.</p>
          <p className="text-gray-600 text-xs mt-1">¡Sé el primero en hacer un show y recibir tips!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {creators.map((creator, i) => (
            <motion.div
              key={creator.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/profile/${creator.id}`} className="card p-4 flex items-center gap-4 hover:border-white/15 transition-colors block">
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {i < 3 ? (
                    <span className="text-xl">{MEDAL[i]}</span>
                  ) : (
                    <span className="text-gray-500 font-black text-lg">#{i + 1}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className={`relative shrink-0 ${i === 0 ? 'w-14 h-14' : 'w-11 h-11'}`}>
                  <img
                    src={creator.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.full_name || 'C')}&size=100&background=1a1a2e&color=f43f5e`}
                    alt=""
                    className={`w-full h-full rounded-full object-cover ring-2 ${i === 0 ? 'ring-yellow-400' : i === 1 ? 'ring-gray-300' : i === 2 ? 'ring-orange-400' : 'ring-white/10'}`}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`font-bold text-white truncate ${i === 0 ? 'text-base' : 'text-sm'}`}>
                      {creator.full_name || 'Creador'}
                    </p>
                    {creator.is_verified && <VerifiedBadge size={14} />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {creator.show_count} {creator.show_count === 1 ? 'show' : 'shows'}
                  </p>
                </div>

                {/* Coins */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    <FiZap size={12} className="text-yellow-400" />
                    <span className={`font-black text-yellow-400 ${i === 0 ? 'text-lg' : 'text-sm'}`}>
                      {creator.total_coins?.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-600">coins</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-700 mt-8">
        Ranking actualizado en tiempo real · Basado en tips y regalos del mes
      </p>
    </div>
  );
}
