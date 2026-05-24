import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiVideo, FiUsers, FiLock, FiRadio, FiCalendar,
  FiBarChart2, FiAlertTriangle, FiSearch, FiX,
  FiClock, FiStar, FiZap, FiRefreshCw, FiPlus,
  FiChevronRight, FiGlobe, FiShield,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

/* ── Categorías ──────────────────────────────────────────── */
export const SHOW_CATEGORIES = [
  { key: 'music',   label: 'Música',  emoji: '🎵' },
  { key: 'dance',   label: 'Baile',   emoji: '💃' },
  { key: 'comedy',  label: 'Comedia', emoji: '😂' },
  { key: 'chat',    label: 'Chat',    emoji: '💬' },
  { key: 'gaming',  label: 'Gaming',  emoji: '🎮' },
  { key: 'fitness', label: 'Fitness', emoji: '💪' },
  { key: 'cooking', label: 'Cocina',  emoji: '🍳' },
  { key: 'art',     label: 'Arte',    emoji: '🎨' },
];

export function categoryLabel(key) {
  return SHOW_CATEGORIES.find(c => c.key === key) || { label: key, emoji: '📺' };
}

/* ── Countdown ───────────────────────────────────────────── */
function Countdown({ date }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const calc = () => setDiff(Math.max(0, new Date(date) - Date.now()));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [date]);

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  if (diff <= 0) return <span className="text-green-400 text-[10px] font-bold">¡Ahora!</span>;
  if (h >= 24) return (
    <span className="text-gray-400 text-[10px]">
      {new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </span>
  );
  return (
    <span className="text-brand-400 text-[10px] font-mono font-bold">
      {h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

/* ── Featured Show Card (grande) ────────────────────────── */
function FeaturedCard({ show }) {
  const cat = categoryLabel(show.category);
  return (
    <Link to={`/shows/${show.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden h-52 group"
      >
        {/* Background */}
        {show.cover_url
          ? <img src={show.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/40 via-purple-600/30 to-pink-500/20">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-7xl opacity-30">{cat.emoji}</span>
              </div>
            </div>
          )
        }

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg shadow-red-500/30">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              EN VIVO
            </span>
            <span className="bg-black/50 backdrop-blur-sm text-gray-200 text-[10px] px-2 py-1 rounded-full">
              {cat.emoji} {cat.label}
            </span>
          </div>
          {show.show_type === 'private' && (
            <span className="flex items-center gap-1 bg-purple-500/80 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-1 rounded-full">
              <FiLock size={8} /> Privado
            </span>
          )}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-white font-black text-lg leading-tight mb-1 line-clamp-1">{show.title}</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src={show.host?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${show.host?.id}`}
                alt=""
                className="w-6 h-6 rounded-full border border-white/30 object-cover"
              />
              <span className="text-gray-300 text-xs font-medium">{show.host?.full_name}</span>
              {show.host?.is_verified && <VerifiedBadge size={14} />}
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-gray-300 text-[11px] px-2 py-0.5 rounded-full">
                <FiUsers size={9} /> {show.viewer_count || 0}
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                show.ticket_price > 0
                  ? 'bg-brand-500 text-white'
                  : 'bg-green-500/80 text-white'
              }`}>
                {show.ticket_price > 0 ? `$${show.ticket_price}` : 'Gratis'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ── Show Card (grid) ────────────────────────────────────── */
function ShowCard({ show, index }) {
  const isLive = show.status === 'live';
  const cat = categoryLabel(show.category);

  return (
    <Link to={`/shows/${show.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="card overflow-hidden hover:border-brand-500/30 transition-all group active:scale-[0.98]"
      >
        {/* Cover */}
        <div className="relative h-28 bg-gradient-to-br from-dark-700 to-dark-800 overflow-hidden">
          {show.cover_url
            ? <img src={show.cover_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-4xl opacity-40">{cat.emoji}</span>
              </div>
            )
          }

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Live badge */}
          {isLive && (
            <div className="absolute top-2 left-2">
              <span className="flex items-center gap-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md">
                <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            </div>
          )}

          {/* Private badge */}
          {show.show_type === 'private' && (
            <div className="absolute top-2 right-2">
              <span className="flex items-center gap-0.5 bg-purple-500/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                <FiLock size={7} /> 1:1
              </span>
            </div>
          )}

          {/* Viewer count (live only) */}
          {isLive && (
            <div className="absolute bottom-2 right-2">
              <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-gray-300 text-[9px] px-1.5 py-0.5 rounded-full">
                <FiUsers size={8} /> {show.viewer_count || 0}
              </span>
            </div>
          )}

          {/* Category chip */}
          <div className="absolute bottom-2 left-2">
            <span className="bg-black/50 backdrop-blur-sm text-gray-300 text-[9px] px-1.5 py-0.5 rounded-full">
              {cat.emoji}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-2.5">
          {/* Host */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <img
              src={show.host?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${show.host?.id}`}
              alt=""
              className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0"
            />
            <span className="text-gray-500 text-[10px] truncate">{show.host?.full_name}</span>
            {show.host?.is_verified && <VerifiedBadge size={12} />}
          </div>

          <p className="text-white font-semibold text-xs leading-tight truncate mb-2">{show.title}</p>

          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold ${show.ticket_price > 0 ? 'text-brand-400' : 'text-green-400'}`}>
              {show.ticket_price > 0 ? `$${show.ticket_price}` : 'Gratis'}
            </span>

            {!isLive && show.scheduled_at && (
              <Countdown date={show.scheduled_at} />
            )}

            {isLive && (
              <span className="text-red-400 text-[10px] font-bold flex items-center gap-0.5">
                <FiRadio size={8} className="animate-pulse" /> En vivo
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ── Scheduled Show Row (lista horizontal) ──────────────── */
function ScheduledRow({ show }) {
  const cat = categoryLabel(show.category);
  return (
    <Link to={`/shows/${show.id}`}>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 p-3 rounded-2xl bg-dark-800 border border-white/5 hover:border-brand-500/20 transition-all group"
      >
        {/* Cover mini */}
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-dark-700 flex items-center justify-center">
          {show.cover_url
            ? <img src={show.cover_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-2xl">{cat.emoji}</span>
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{show.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <img
              src={show.host?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${show.host?.id}`}
              alt=""
              className="w-4 h-4 rounded-full object-cover border border-white/10"
            />
            <span className="text-gray-500 text-xs truncate">{show.host?.full_name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-gray-600 text-[10px]">
              <FiCalendar size={9} />
              {show.scheduled_at
                ? new Date(show.scheduled_at).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
                : 'Sin fecha'}
            </span>
            {show.scheduled_at && <Countdown date={show.scheduled_at} />}
          </div>
        </div>

        {/* Price + arrow */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-bold ${show.ticket_price > 0 ? 'text-brand-400' : 'text-green-400'}`}>
            {show.ticket_price > 0 ? `$${show.ticket_price}` : 'Gratis'}
          </span>
          {show.show_type === 'private' && (
            <span className="flex items-center gap-0.5 text-purple-400 text-[9px]">
              <FiLock size={8} /> 1:1
            </span>
          )}
          <FiChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </motion.div>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function LiveShows() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const [shows, setShows]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  const [typeFilter, setTypeFilter]         = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch]                 = useState('');
  const [showSearch, setShowSearch]         = useState(false);

  const handleCategoryClick = (key) => {
    setCategoryFilter(prev => prev === key ? 'all' : key);
  };

  const loadShows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ status: 'all' });
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      const { data } = await api.get(`/api/shows?${params}`);
      setShows(data.shows || []);
      setLastUpdated(new Date());
    } catch {
      if (!silent) toast.error('Error al cargar los shows');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, categoryFilter]);

  useEffect(() => {
    loadShows();
    api.get('/api/shows/leaderboard').then(({ data }) => setLeaderboard(data.creators || [])).catch(() => {});
    const interval = setInterval(() => loadShows(true), 30000);
    // Refetch when user returns to this tab (e.g. after a show ends)
    const onVisible = () => { if (document.visibilityState === 'visible') loadShows(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadShows]);

  /* ── Derived ── */
  const liveShows = shows.filter(s => s.status === 'live' && s.category !== 'adult');
  const upcomingShows = shows.filter(s => s.status === 'scheduled' && s.category !== 'adult');

  const filteredLive = liveShows.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.host?.full_name?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredUpcoming = upcomingShows.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.host?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const featuredShow = filteredLive[0];
  const restLive = filteredLive.slice(1);

  const totalViewers = liveShows.reduce((sum, s) => sum + (s.viewer_count || 0), 0);

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-24">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                <FiRadio size={22} className="text-brand-400" /> Shows
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {liveShows.length > 0 && (
                  <span className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    {liveShows.length} en vivo
                  </span>
                )}
                {totalViewers > 0 && (
                  <span className="flex items-center gap-1 text-gray-500 text-[10px]">
                    <FiUsers size={9} /> {totalViewers} viendo
                  </span>
                )}
                {upcomingShows.length > 0 && (
                  <span className="flex items-center gap-1 text-gray-600 text-[10px]">
                    <FiClock size={9} /> {upcomingShows.length} próximos
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(v => !v)}
              className="p-2 rounded-xl bg-dark-700/70 text-gray-400 hover:text-white transition-colors"
            >
              {showSearch ? <FiX size={16} /> : <FiSearch size={16} />}
            </button>
            <button
              onClick={() => loadShows(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-dark-700/70 text-gray-400 hover:text-white transition-colors"
            >
              <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {profile?.is_creator && (
              <Link
                to="/creator/dashboard"
                className="flex items-center gap-1.5 bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 text-xs font-semibold px-3 py-2 rounded-xl transition-colors border border-brand-500/20"
              >
                <FiBarChart2 size={13} /> Panel
              </Link>
            )}
          </div>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className="relative">
                <FiSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  autoFocus
                  className="w-full bg-dark-700 border border-white/10 text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-brand-500/50"
                  placeholder="Buscar shows o creadores…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <FiX size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Categories horizontal scroll ─────────────────── */}
      <div className="px-4 mb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {/* Todas */}
          <button
            onClick={() => setCategoryFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              categoryFilter === 'all'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            ✨ Todas
          </button>

          {SHOW_CATEGORIES.map(({ key, label, emoji }) => {
            const count = shows.filter(s => s.category === key && s.status === 'live').length;
            return (
              <button
                key={key}
                onClick={() => handleCategoryClick(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  categoryFilter === key
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                    : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {emoji} {label}
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    categoryFilter === key ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Type filter ──────────────────────────────────── */}
      <div className="px-4 mb-5">
        <div className="flex gap-1.5 bg-dark-800/80 p-1 rounded-2xl border border-white/5">
          {[
            { key: 'all',       label: 'Todos',      icon: FiGlobe },
            { key: 'broadcast', label: 'Broadcast',   icon: FiRadio },
            { key: 'private',   label: 'Privado 1:1', icon: FiLock },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                typeFilter === key
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="px-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-dark-700/50" />
            ))}
          </div>
        ) : (
          <>
            {/* Featured live show */}
            {featuredShow && !search && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 uppercase tracking-wide">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    Destacado
                  </span>
                </div>
                <FeaturedCard show={featuredShow} />
              </div>
            )}

            {/* Live shows grid */}
            {filteredLive.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                    <span className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      EN VIVO
                    </span>
                    <span className="text-gray-400 text-xs font-normal">{filteredLive.length} shows</span>
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Si hay featured, mostrar desde index 1 (el featured ya ocupa el top) */}
                  {(featuredShow && !search ? restLive : filteredLive).map((show, i) => (
                    <ShowCard key={show.id} show={show} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming shows */}
            {filteredUpcoming.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                    <span className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <FiClock size={9} /> PRÓXIMOS
                    </span>
                    <span className="text-gray-400 text-xs font-normal">{filteredUpcoming.length} programados</span>
                  </h2>
                </div>
                <div className="space-y-2">
                  {filteredUpcoming.map(show => (
                    <ScheduledRow key={show.id} show={show} />
                  ))}
                </div>
              </section>
            )}

            {/* Leaderboard */}
            {!search && leaderboard.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <FiStar size={13} className="text-yellow-400" />
                  <h2 className="text-sm font-bold text-white">Top Creadores</h2>
                  <span className="text-gray-600 text-xs">este mes</span>
                </div>
                <div className="space-y-2">
                  {leaderboard.map((creator, i) => (
                    <Link key={creator.id} to={`/profile/${creator.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-dark-800 border border-white/5 hover:border-brand-500/20 transition-all">
                        <span className={`w-6 text-center text-sm font-black shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <img
                          src={creator.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.full_name || 'C')}&size=80&background=1a1a2e&color=f43f5e`}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{creator.full_name}</p>
                          <p className="text-gray-500 text-xs">{creator.show_count} shows</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-yellow-400 text-xs font-bold">{(creator.total_coins || 0).toLocaleString()} 🪙</p>
                          <p className="text-gray-600 text-[10px]">{(creator.total_viewers || 0).toLocaleString()} viewers</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {filteredLive.length === 0 && filteredUpcoming.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16"
              >
                <div className="w-20 h-20 bg-dark-700 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  {search
                    ? <FiSearch size={28} className="text-gray-600" />
                    : categoryFilter !== 'all'
                      ? <span className="text-4xl">{categoryLabel(categoryFilter).emoji}</span>
                      : <FiRadio size={28} className="text-gray-600" />
                  }
                </div>
                <p className="text-white font-semibold text-base mb-1">
                  {search
                    ? 'Sin resultados'
                    : categoryFilter !== 'all'
                      ? `Sin shows en ${categoryLabel(categoryFilter).label}`
                      : 'Sin shows ahora'
                  }
                </p>
                <p className="text-gray-500 text-sm">
                  {search
                    ? `No encontramos shows para "${search}"`
                    : 'Nadie está transmitiendo en este momento'
                  }
                </p>

                {!search && categoryFilter === 'all' && (
                  <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                    {profile?.is_creator ? (
                      <Link
                        to="/creator/dashboard"
                        className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5"
                      >
                        <FiPlus size={15} /> Crear mi show
                      </Link>
                    ) : (
                      <Link
                        to="/become-creator"
                        className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5"
                      >
                        <FiZap size={15} /> Ser creador
                      </Link>
                    )}
                    <button
                      onClick={() => loadShows(true)}
                      className="btn-secondary inline-flex items-center gap-2 text-sm px-5 py-2.5"
                    >
                      <FiRefreshCw size={13} /> Actualizar
                    </button>
                  </div>
                )}

                {search && (
                  <button onClick={() => setSearch('')} className="mt-4 text-brand-400 text-sm hover:underline">
                    Limpiar búsqueda
                  </button>
                )}
                {categoryFilter !== 'all' && !search && (
                  <button onClick={() => setCategoryFilter('all')} className="mt-4 text-brand-400 text-sm hover:underline">
                    Ver todas las categorías
                  </button>
                )}
              </motion.div>
            )}

            {/* Last updated */}
            {lastUpdated && shows.length > 0 && (
              <p className="text-center text-gray-700 text-[10px] mt-4 pb-2">
                Actualizado {lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                {' · '}auto-refresh cada 30s
              </p>
            )}
          </>
        )}
      </div>

      {/* ── FAB (creadores): crear show ───────────────────── */}
      {profile?.is_creator && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-20 right-4 z-40"
        >
          <Link
            to="/creator/dashboard"
            className="w-14 h-14 bg-gradient-to-br from-red-500 to-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-500/25 hover:scale-105 active:scale-95 transition-transform"
          >
            <FiPlus size={22} className="text-white" />
          </Link>
        </motion.div>
      )}

    </div>
  );
}
