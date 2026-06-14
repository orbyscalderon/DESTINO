import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiMessageSquare, FiPlay, FiFileText, FiUsers, FiCalendar,
  FiBarChart2, FiAward, FiChevronRight,
} from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para el tab COMUNIDAD.
// Layout 12-col:
//   Col 1 (3): quick-links a todas las secciones de comunidad
//   Col 2 (5): Reels +18 recientes (2x2 grid)
//   Col 3 (2): Eventos/encuestas próximos
//   Col 4 (2): Búsquedas tendencia (pills)

const LINKS = [
  { id: 'feed',      label: 'Feed +18',          icon: FiMessageSquare, to: '/adult?tab=comunidad' },
  { id: 'reels',     label: 'Reels +18',         icon: FiPlay,          to: '/reels?adult=1' },
  { id: 'posts',     label: 'Posts de creators', icon: FiFileText,      to: '/adult?tab=comunidad&section=posts' },
  { id: 'follows',   label: 'Mis seguidos',      icon: FiUsers,         to: '/adult?tab=comunidad&section=follows' },
  { id: 'eventos',   label: 'Próximos eventos',  icon: FiCalendar,      to: '/adult?tab=comunidad&section=events' },
  { id: 'encuestas', label: 'Encuestas activas', icon: FiBarChart2,     to: '/adult?tab=comunidad&section=polls' },
  { id: 'top',       label: 'Top contribuidores',icon: FiAward,         to: '/leaderboard' },
];

const TRENDING_FALLBACK = [
  '#FollandoDuro', '#LiveBattle', '#StoryTime', '#FetichePies',
  '#Roleplay', '#PartyChat', '#NewModel', '#ExclusiveDrops',
];

export default function ComunidadMegamenu({ onClose, trendingFromHub }) {
  const [reels, setReels] = useState([]);
  const [events, setEvents] = useState([]);
  const [polls, setPolls] = useState([]);

  const trending = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 8)
    : TRENDING_FALLBACK;

  useEffect(() => {
    api.get('/api/reels/feed?limit=4&adult=1')
      .then(({ data }) => setReels((data.reels || []).slice(0, 4)))
      .catch(() => {});
    api.get('/api/shows/recurring/upcoming?limit=3')
      .then(({ data }) => setEvents((data.shows || []).slice(0, 3)))
      .catch(() => {});
    // Encuestas activas opcional (si endpoint existe)
    api.get('/api/shows/polls/active?limit=2')
      .then(({ data }) => setPolls((data.polls || []).slice(0, 2)))
      .catch(() => {});
  }, []);

  return (
    <div
      role="menu"
      aria-label="Menú de comunidad"
      className="bg-dark-900/98 backdrop-blur-xl border-y border-white/5 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* ── Col 1: Quick links ── */}
        <div className="col-span-3">
          <h3 className="text-white text-sm font-black mb-3">Comunidad</h3>
          <ul className="space-y-0.5">
            {LINKS.map(l => {
              const Icon = l.icon;
              return (
                <li key={l.id}>
                  <Link
                    to={l.to}
                    onClick={onClose}
                    role="menuitem"
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors"
                  >
                    <Icon size={14} className="text-gray-500" />
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Col 2: Reels recientes (2x2) ── */}
        <div className="col-span-5">
          <Link
            to="/reels?adult=1"
            onClick={onClose}
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
          >
            Reels +18 recientes
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <div className="grid grid-cols-4 gap-2">
            {reels.length === 0 && [...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[9/16] bg-dark-800 rounded-md animate-pulse" />
            ))}
            {reels.map(r => (
              <Link
                key={r.id}
                to={`/reels?id=${r.id}`}
                onClick={onClose}
                className="group block relative aspect-[9/16] rounded-md overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-brand-500/40 transition-all"
              >
                {r.thumbnail_url ? (
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-dark-700" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-white text-[10px] font-bold truncate">
                    {r.user?.full_name || ''}
                  </p>
                </div>
                <span className="absolute top-1 right-1 w-5 h-5 bg-brand-500/90 rounded-full flex items-center justify-center">
                  <FiPlay size={9} className="text-white ml-0.5" fill="currentColor" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Col 3: Eventos próximos + encuestas activas ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3 flex items-center gap-1.5">
            <FiCalendar size={13} className="text-gray-500" /> Próximos
          </h3>
          <div className="space-y-2">
            {events.length === 0 && polls.length === 0 && (
              <p className="text-gray-500 text-xs">Sin eventos programados.</p>
            )}
            {events.map(e => (
              <Link
                key={e.id}
                to={`/shows/${e.id}`}
                onClick={onClose}
                className="block bg-dark-800 hover:bg-white/5 rounded-lg p-2 border border-white/5 transition-colors"
              >
                <p className="text-white text-[11px] font-bold truncate">{e.title || 'Show'}</p>
                <p className="text-brand-400 text-[10px] mt-0.5">
                  {e.next_at ? new Date(e.next_at).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Próximamente'}
                </p>
              </Link>
            ))}
            {polls.map(p => (
              <div key={p.id} className="bg-dark-800 rounded-lg p-2 border border-white/5">
                <div className="flex items-center gap-1 text-amber-400 text-[10px] font-bold mb-0.5">
                  <FiBarChart2 size={9} /> ENCUESTA
                </div>
                <p className="text-white text-[11px] truncate">{p.question}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 4: Trending pills ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3">Tendencias</h3>
          <ul className="space-y-1.5">
            {trending.map((t, i) => (
              <li key={`${t}-${i}`}>
                <Link
                  to={`/adult?tab=videos&tag=${encodeURIComponent(t.replace(/^#/, ''))}`}
                  onClick={onClose}
                  className="block bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors text-left"
                  role="menuitem"
                >
                  {t.startsWith('#') ? t : `#${t}`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
