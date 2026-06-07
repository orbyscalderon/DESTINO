import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiAward, FiLock } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const RARITY_STYLES = {
  common:    { color: 'text-gray-400',    bg: 'bg-gray-500/10',   border: 'border-gray-500/20' },
  rare:      { color: 'text-blue-400',    bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  epic:      { color: 'text-purple-400',  bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  legendary: { color: 'text-yellow-400',  bg: 'bg-yellow-500/10', border: 'border-yellow-500/40' },
};

const CATEGORY_LABEL = {
  social:    'Social',
  creator:   'Creador',
  spender:   'Generosidad',
  milestone: 'Hitos',
};

export default function Achievements() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { load(); }, []);

  const load = () => {
    api.get('/api/achievements')
      .then(r => setData(r.data))
      .catch(() => toast.error('Error cargando logros'))
      .finally(() => setLoading(false));
  };

  const setBadge = async (achievement_id) => {
    try {
      await api.patch('/api/achievements/badge', { achievement_id });
      toast.success(achievement_id ? 'Badge activado' : 'Badge removido');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const list = (data?.achievements || []);
  const filtered = filter === 'all' ? list
                 : filter === 'earned' ? list.filter(a => a.earned)
                 : list.filter(a => a.category === filter);

  const stats = data?.stats || {};
  const progressPct = stats.xp_for_next_level > stats.xp_for_current_level
    ? Math.round((stats.xp_progress / (stats.xp_for_next_level - stats.xp_for_current_level)) * 100)
    : 0;

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto relative">
      <div className="absolute top-12 right-0 w-64 h-64 bg-yellow-500/6 rounded-full blur-3xl pointer-events-none animate-float -z-10" />
      <div className="flex items-center gap-3 mb-6">
        <Link to="/profile" className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"><FiArrowLeft size={20} /></Link>
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Logros</h1>
      </div>

      {/* Nivel + XP bar */}
      <div className="card p-5 mb-4 bg-gradient-to-br from-brand-500/15 to-accent-500/8 border-brand-500/30 shadow-glow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Nivel</p>
            <p className="text-4xl font-black text-white">{stats.level || 1}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">XP</p>
            <p className="text-xl font-black text-white">{(stats.xp || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-pink-500"
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 text-center">
          {stats.xp_needed > 0 ? `${stats.xp_needed} XP para nivel ${(stats.level || 1) + 1}` : 'Nivel máximo'}
        </p>
      </div>

      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-gray-400">
          <span className="text-white font-bold">{stats.earned_count || 0}</span> / {stats.total_count || 0} logros
        </span>
        {stats.active_badge && (
          <button onClick={() => setBadge(null)} className="text-[10px] text-brand-400 hover:text-brand-300">
            Quitar badge activo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {['all', 'earned', 'social', 'creator', 'spender', 'milestone'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[11px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-colors ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'earned' ? 'Ganados' : CATEGORY_LABEL[f] || f}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="card p-8 text-center text-gray-500 text-sm">Sin logros en esta categoría</div>
        )}
        {filtered.map(a => {
          const style = RARITY_STYLES[a.rarity] || RARITY_STYLES.common;
          const isBadge = stats.active_badge === a.id;
          return (
            <motion.div
              key={a.id}
              whileTap={a.earned ? { scale: 0.98 } : {}}
              className={`card p-3 flex items-center gap-3 transition ${a.earned ? `${style.bg} ${style.border}` : 'opacity-60'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${style.bg} text-2xl`}>
                {a.earned ? a.icon : <FiLock className="text-gray-600" size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white truncate">{a.name}</p>
                  <span className={`text-[9px] uppercase font-black ${style.color}`}>{a.rarity}</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{a.description}</p>
                <div className="flex gap-3 text-[10px] text-gray-500 mt-0.5">
                  {a.xp_reward > 0   && <span>+{a.xp_reward} XP</span>}
                  {a.coin_reward > 0 && <span className="text-yellow-400">+{a.coin_reward} coins</span>}
                  {a.earned_at && <span>· {new Date(a.earned_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>}
                </div>
              </div>
              {a.earned && (
                <button
                  onClick={() => setBadge(isBadge ? null : a.id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${
                    isBadge ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                  }`}
                >
                  <FiAward size={11} className="inline mr-1" />
                  {isBadge ? 'Activo' : 'Usar'}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
