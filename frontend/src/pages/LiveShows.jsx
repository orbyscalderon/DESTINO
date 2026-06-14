import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  FiRadio, FiUsers, FiLock, FiSearch, FiX,
  FiRefreshCw, FiPlus, FiBarChart2, FiClock,
  FiCalendar, FiChevronDown, FiChevronUp, FiMonitor,
  FiPlay, FiFilm,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

/* ── Categorías ─────────────────────────────────────────────────── */
export const SHOW_CATEGORIES = [
  { key: 'adult',   label: 'Adulto',  emoji: '🔞' },
  { key: 'music',   label: 'Música',  emoji: '🎵' },
  { key: 'dance',   label: 'Baile',   emoji: '💃' },
  { key: 'comedy',  label: 'Comedia', emoji: '😂' },
  { key: 'chat',    label: 'Chat',    emoji: '💬' },
  { key: 'gaming',  label: 'Gaming',  emoji: '🎮' },
  { key: 'fitness', label: 'Fitness', emoji: '💪' },
  { key: 'cooking', label: 'Cocina',  emoji: '🍳' },
  { key: 'art',     label: 'Arte',    emoji: '🎨' },
];

const PUBLIC_CATEGORIES = SHOW_CATEGORIES.filter(c => c.key !== 'adult');

export function categoryLabel(key) {
  return SHOW_CATEGORIES.find(c => c.key === key) || { label: key, emoji: '📺' };
}

/* ── Countdown ──────────────────────────────────────────────────── */
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
  if (diff <= 0) return <span className="text-green-400 font-bold">¡Ahora!</span>;
  if (h >= 24) return (
    <span>{new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
  );
  return <span className="font-mono font-bold text-brand-400">{h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
}

/* ── Channel Card (canal en vivo) ───────────────────────────────── */
function ChannelCard({ show, index }) {
  const cat = categoryLabel(show.category);
  const isPrivate = show.show_type === 'private';

  return (
    <Link to={`/shows/${show.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        className="group cursor-pointer"
      >
        {/* Thumbnail 16:9 */}
        <div className="relative rounded-xl overflow-hidden aspect-video bg-dark-800 mb-2.5">
          {show.cover_url
            ? <img src={show.cover_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : (
              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${
                isPrivate ? 'from-purple-900/60 to-dark-900' : 'from-dark-700 to-dark-900'
              }`}>
                <span className="text-5xl opacity-25">{cat.emoji}</span>
              </div>
            )
          }

          {/* Darkening on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 ease-out-expo" />

          {/* LIVE badge — top left */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg">
              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
              EN VIVO
            </span>
            <span className="bg-black/60 backdrop-blur-sm text-gray-200 text-[10px] px-1.5 py-0.5 rounded-md">
              {cat.emoji} {cat.label}
            </span>
          </div>

          {/* Viewers — top right */}
          <div className="absolute top-2 right-2">
            <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-gray-200 text-[10px] px-2 py-0.5 rounded-md">
              <FiUsers size={9} /> {(show.viewer_count || 0).toLocaleString()}
            </span>
          </div>

          {/* Private badge */}
          {isPrivate && (
            <div className="absolute bottom-2 right-2">
              <span className="flex items-center gap-1 bg-purple-600/80 backdrop-blur-sm text-white text-[10px] font-medium px-1.5 py-0.5 rounded-md">
                <FiLock size={8} /> 1:1
              </span>
            </div>
          )}

          {/* Hover overlay CTA */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg shadow-brand-500/30 flex items-center gap-1.5">
              <FiRadio size={12} /> Ver ahora
            </div>
          </div>
        </div>

        {/* Info below thumbnail */}
        <div className="flex items-start gap-2.5 px-0.5">
          {/* Avatar */}
          <img
            src={show.host?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${show.host?.id}`}
            alt=""
            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0 mt-0.5"
          />

          <div className="flex-1 min-w-0">
            {/* Show title */}
            <p className="text-white text-sm font-semibold leading-tight truncate">{show.title}</p>

            {/* Creator name */}
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-gray-400 text-xs truncate">{show.host?.full_name}</span>
              {show.host?.is_verified && <VerifiedBadge size={12} />}
            </div>

            {/* Price */}
            <span className={`text-[11px] font-bold mt-1 inline-block ${
              show.ticket_price > 0 ? 'text-brand-400' : 'text-green-400'
            }`}>
              {show.ticket_price > 0 ? `🪙 ${Math.ceil(show.ticket_price * 20)} coins` : 'Gratis'}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ── Upcoming row (compacto) ────────────────────────────────────── */
function UpcomingRow({ show }) {
  const cat = categoryLabel(show.category);
  const [interested, setInterested] = useState(null); // null = loading
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api.get(`/api/shows/${show.id}/interest`)
      .then(r => setInterested(!!r.data?.interested))
      .catch(() => setInterested(false));
  }, [show.id]);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setToggling(true);
    try {
      const { data } = await api.post(`/api/shows/${show.id}/interest`);
      setInterested(!!data?.interested);
      toast.success(data?.interested ? '🔔 Te avisaremos 15 min antes' : 'Recordatorio cancelado');
    } catch {
      toast.error('Error');
    } finally {
      setToggling(false);
    }
  };

  return (
    <Link to={`/shows/${show.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-dark-800 border border-white/5 hover:border-white/10 transition-colors">
        <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-dark-700 flex items-center justify-center">
          {show.cover_url
            ? <img src={show.cover_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-xl">{cat.emoji}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{show.title}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-gray-500 text-xs truncate">{show.host?.full_name}</span>
            {show.host?.is_verified && <VerifiedBadge size={10} />}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={toggling || interested === null}
          className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold transition ${
            interested ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-700 text-gray-400 hover:text-white'
          }`}
        >
          {interested ? '🔔 Avísame' : '+ Recordar'}
        </button>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-gray-400 flex items-center gap-1 justify-end">
            <FiClock size={9} />
            {show.scheduled_at ? <Countdown date={show.scheduled_at} /> : 'Sin fecha'}
          </div>
          <span className={`text-[10px] font-bold ${show.ticket_price > 0 ? 'text-brand-400' : 'text-green-400'}`}>
            {show.ticket_price > 0 ? `🪙 ${Math.ceil(show.ticket_price * 20)}` : 'Gratis'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function LiveShows() {
  const { profile } = useAuthStore();

  const [shows, setShows]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter]         = useState('all');
  const [search, setSearch]                 = useState('');
  const [showSearch, setShowSearch]         = useState(false);
  const [showUpcoming, setShowUpcoming]     = useState(false);

  const loadShows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ status: 'all' });
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      const { data } = await api.get(`/api/shows?${params}`);
      setShows(data.shows || []);
    } catch {
      if (!silent) toast.error('Error al cargar los shows');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, categoryFilter]);

  useEffect(() => {
    loadShows();
    // Polling cada 60s (era 15s — demasiado agresivo, mucho costo backend
    // sin beneficio real de UX). El onVisible refresca cuando vuelves al tab.
    const interval = setInterval(() => loadShows(true), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadShows(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadShows]);

  // Realtime: recarga al instante cuando un show cambia a 'live' o 'ended'
  useEffect(() => {
    const ch = supabase
      .channel('live-shows-feed')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_shows',
      }, (payload) => {
        const { status, id } = payload.new || {};
        if (status === 'live') {
          // Show nuevo en vivo — recarga silenciosa inmediata
          loadShows(true);
        } else if (status === 'ended') {
          // Show terminado — quitar de la lista sin llamada extra
          setShows(prev => prev.filter(s => s.id !== id));
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_shows',
      }, () => loadShows(true))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadShows]);

  /* ── Derived ── */
  // Show propio del host (si está en vivo, incluye adultos porque es suyo)
  const myLiveShow = shows.find(s => s.status === 'live' && s.host_id === profile?.id);
  const liveShows = shows.filter(s => s.status === 'live' && s.category !== 'adult');
  const upcomingShows = shows.filter(s => s.status === 'scheduled' && s.category !== 'adult');

  // Agrupar shows programados por fecha
  const upcomingByDate = upcomingShows.reduce((acc, show) => {
    if (!show.scheduled_at) return acc;
    const d = new Date(show.scheduled_at);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    const nextWeek = new Date(today.getTime() + 7 * 86400000);
    const showDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let key;
    if (showDay.getTime() === today.getTime()) key = 'Hoy';
    else if (showDay.getTime() === tomorrow.getTime()) key = 'Mañana';
    else if (showDay < nextWeek) key = d.toLocaleDateString('es', { weekday: 'long' });
    else key = d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(show);
    return acc;
  }, {});
  const totalViewers = liveShows.reduce((sum, s) => sum + (s.viewer_count || 0), 0);

  const filtered = liveShows.filter(s => {
    if (typeFilter !== 'all' && s.show_type !== typeFilter) return false;
    if (!search) return true;
    return (
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.host?.full_name?.toLowerCase().includes(search.toLowerCase())
    );
  });

  /* ══ RENDER ══════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-28">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 glass border-b border-white/5">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <FiRadio size={18} className="text-red-400 animate-pulse" />
              Shows en Vivo
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {liveShows.length > 0 ? (
                <span className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  {liveShows.length} {liveShows.length === 1 ? 'canal' : 'canales'}
                </span>
              ) : (
                <span className="text-gray-600 text-[10px]">Sin transmisiones ahora</span>
              )}
              {totalViewers > 0 && (
                <span className="text-gray-600 text-[10px] flex items-center gap-1">
                  · <FiUsers size={9} /> {totalViewers.toLocaleString()} viendo
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowSearch(v => !v)}
              className="w-8 h-8 rounded-xl bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors"
            >
              {showSearch ? <FiX size={14} className="text-gray-300" /> : <FiSearch size={14} className="text-gray-400" />}
            </button>
            <button
              onClick={() => loadShows(true)}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors"
            >
              <FiRefreshCw size={13} className={`text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {profile?.is_creator && (
              <Link
                to="/creator/dashboard"
                className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 border border-white/10 text-gray-300 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors"
              >
                <FiBarChart2 size={12} /> Panel
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
              className="overflow-hidden px-4 pb-3"
            >
              <div className="relative">
                <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  autoFocus
                  className="w-full bg-dark-700 border border-white/10 text-white placeholder-gray-500 rounded-xl pl-8 pr-9 py-2 text-sm outline-none focus:border-brand-500/50"
                  placeholder="Buscar canales o shows…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <FiX size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Category chips ────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              categoryFilter === 'all' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
            }`}
          >
            ✨ Todas
          </button>
          {PUBLIC_CATEGORIES.map(({ key, label, emoji }) => {
            const liveCount = liveShows.filter(s => s.category === key).length;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(prev => prev === key ? 'all' : key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                  categoryFilter === key ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
                }`}
              >
                {emoji} {label}
                {liveCount > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    categoryFilter === key ? 'bg-white/20' : 'bg-red-500 text-white'
                  }`}>{liveCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Type filter ───────────────────────────────────────── */}
        <div className="flex gap-1.5 bg-dark-800 p-1 rounded-2xl border border-white/5">
          {[
            { key: 'all',       label: 'Todos',      icon: FiRadio },
            { key: 'broadcast', label: 'Broadcast',   icon: FiMonitor },
            { key: 'private',   label: 'Privado 1:1', icon: FiLock },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                typeFilter === key ? 'bg-brand-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

        {/* ── Banner: el host tiene un show en vivo ─────────────── */}
        {myLiveShow && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3"
          >
            <span className="flex items-center gap-1.5 text-red-400 text-sm font-bold shrink-0">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              TU SHOW EN VIVO
            </span>
            <p className="text-white text-sm truncate flex-1">{myLiveShow.title}</p>
            <button
              onClick={() => navigate('/studio')}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-xl font-semibold hover:bg-red-600 transition-colors shrink-0"
            >
              Volver al studio
            </button>
          </motion.div>
        )}

        {/* ── Live channels grid ────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-video rounded-xl bg-dark-700 animate-pulse" />
                <div className="flex gap-2">
                  <div className="w-9 h-9 rounded-full bg-dark-700 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 skeleton rounded w-4/5" />
                    <div className="h-2.5 skeleton rounded w-3/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((show, i) => (
              <ChannelCard key={show.id} show={show} index={i} />
            ))}
          </div>
        ) : (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 bg-dark-800 border border-white/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
              {search
                ? <FiSearch size={28} className="text-gray-600" />
                : categoryFilter !== 'all'
                  ? <span className="text-4xl">{categoryLabel(categoryFilter).emoji}</span>
                  : <FiRadio size={28} className="text-gray-600" />
              }
            </div>
            <p className="text-white font-bold text-base mb-1">
              {search
                ? 'Sin resultados'
                : categoryFilter !== 'all'
                  ? `Nadie transmite ${categoryLabel(categoryFilter).label} ahora`
                  : 'Ningún canal en vivo ahora'
              }
            </p>
            <p className="text-gray-500 text-sm mb-6">
              {search
                ? `No hay canales para "${search}"`
                : 'Vuelve más tarde o crea tu propio show'
              }
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {search ? (
                <button onClick={() => setSearch('')} className="btn-secondary text-sm px-5 py-2.5">
                  Limpiar búsqueda
                </button>
              ) : categoryFilter !== 'all' ? (
                <button onClick={() => setCategoryFilter('all')} className="btn-secondary text-sm px-5 py-2.5">
                  Ver todas las categorías
                </button>
              ) : profile?.is_creator ? (
                <Link to="/studio" className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5">
                  <FiRadio size={14} /> Ir en vivo ahora
                </Link>
              ) : (
                <Link to="/become-creator" className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5">
                  Ser creador
                </Link>
              )}
              <button onClick={() => loadShows(true)} className="btn-secondary inline-flex items-center gap-2 text-sm px-5 py-2.5">
                <FiRefreshCw size={13} /> Actualizar
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Calendario de próximos shows ─────────────────────── */}
        {!search && upcomingShows.length > 0 && (
          <section className="pt-2">
            <button
              onClick={() => setShowUpcoming(v => !v)}
              className="flex items-center gap-2 w-full text-left py-3 border-t border-white/5"
            >
              <FiCalendar size={13} className="text-gray-500" />
              <span className="text-gray-400 text-sm font-semibold flex-1">
                Calendario de shows
              </span>
              <span className="text-xs text-gray-600 bg-dark-700 px-2 py-0.5 rounded-full">{upcomingShows.length}</span>
              {showUpcoming
                ? <FiChevronUp size={14} className="text-gray-500" />
                : <FiChevronDown size={14} className="text-gray-500" />
              }
            </button>
            <AnimatePresence>
              {showUpcoming && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pb-4"
                >
                  {Object.entries(upcomingByDate).map(([dateLabel, dayShows]) => (
                    <div key={dateLabel} className="mb-4">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className={`text-xs font-bold uppercase tracking-wide ${
                          dateLabel === 'Hoy' ? 'text-brand-400' :
                          dateLabel === 'Mañana' ? 'text-yellow-400' :
                          'text-gray-500'
                        }`}>{dateLabel}</span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <div className="space-y-2">
                        {dayShows.map(show => <UpcomingRow key={show.id} show={show} />)}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* ── Replays (shows pasados con grabación) ─────────────────── */}
        <ReplaysSection />

      </div>

      {/* ── FAB: ir en vivo (solo creadores) ─────────────────────── */}
      {profile?.is_creator && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-20 right-4 z-40"
        >
          <Link
            to="/studio"
            className="w-14 h-14 bg-gradient-to-br from-red-500 to-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-500/25 hover:scale-105 active:scale-95 transition-transform"
            title="Ir en vivo"
          >
            <FiRadio size={22} className="text-white" />
          </Link>
        </motion.div>
      )}
    </div>
  );
}

// ── Sección de Replays (shows pasados con grabación) ──────────────────
function ReplaysSection() {
  const [replays, setReplays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.get('/api/shows/replays?limit=12')
      .then(({ data }) => { if (!cancel) setReplays(data.replays || []); })
      .catch(() => { if (!cancel) setReplays([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  if (loading || replays.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between mb-3 px-1"
      >
        <h2 className="font-bold text-white flex items-center gap-2">
          <FiFilm size={16} className="text-pink-400" />
          Replays · {replays.length}
        </h2>
        {expanded ? <FiChevronUp size={16} className="text-gray-500" /> : <FiChevronDown size={16} className="text-gray-500" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {replays.map(r => (
                <a
                  key={r.id}
                  href={r.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-dark-800 rounded-xl overflow-hidden border border-white/5 hover:border-pink-500/40 transition-colors"
                >
                  <div className="aspect-video bg-black relative">
                    {r.cover_url ? (
                      <img src={r.cover_url} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FiFilm size={32} className="text-gray-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 bg-pink-500/90 rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                        <FiPlay className="text-white ml-0.5" size={16} />
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-white text-xs font-bold truncate">{r.title}</p>
                    <p className="text-gray-500 text-[10px] truncate">{r.host?.full_name}</p>
                  </div>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
