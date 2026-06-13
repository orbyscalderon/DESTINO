import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiThumbsUp, FiZap, FiBarChart2, FiAward, FiHome, FiClock,
  FiList, FiUsers, FiShuffle, FiStar, FiChevronRight,
} from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para el tab Videos.
// Se muestra al hacer hover sobre el botón VIDEOS del AdultHub.
// Layout: 6 columnas en desktop (collapse a 1 en mobile, pero en mobile
// no se muestra por hover — solo desktop).
//
// Columnas:
//   1) Descubre Videos — sort filters verticales
//   2) El más caliente — 2 preview thumbs
//   3) Recomendado — 2 preview thumbs
//   4) Listas de reproducción — 2 playlist thumbs
//   5) Canales — 2 channel logos
//   6) Búsquedas de Tendencia — pills verticales
//
// Props:
//   onSelectSort(sortId)  — click en un item de Descubre
//   onSelectTag(tagSlug)  — click en una pill de Tendencia
//   onClose()             — para cerrar tras click

const DISCOVER_ITEMS = [
  { id: 'recommended', label: 'Recomendado',                 icon: FiThumbsUp },
  { id: 'hot',         label: 'El más caliente',             icon: FiZap },
  { id: 'views',       label: 'Más vistos',                  icon: FiBarChart2 },
  { id: 'top',         label: 'Mejor valorados',             icon: FiStar },
  { id: 'amateur',     label: 'Contenido Casero Popular',    icon: FiHome },
  { id: 'shorts',      label: 'Cortos',                      icon: FiClock },
  { id: 'channels',    label: 'Canales',                     icon: FiUsers, link: '?tab=creators' },
  { id: 'playlists',   label: 'Listas de reproducción',      icon: FiList, link: '/explore/playlists' },
  { id: 'random',      label: 'Al Azar',                     icon: FiShuffle },
  { id: 'new',         label: 'El más nuevo',                icon: FiZap },
  { id: 'editors',     label: 'Elección de los espectadores',icon: FiAward },
];

const TRENDING_FALLBACK = [
  'Abella Anderson', 'Asa Akira', 'Rebeca Linares',
  'Follando Duro', 'Lesbian Tribbing', 'Ricos Gemidos',
  'La Perversa Singando', 'Xxnx Porn Videos',
];

function fmtDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `${h}:${mm}:${s}`;
  }
  return `${m}:${s}`;
}
function fmtViews(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VideosMegamenu({ onSelectSort, onSelectTag, onClose, trendingFromHub }) {
  const [hot, setHot] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [channels, setChannels] = useState([]);
  const trending = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 8)
    : TRENDING_FALLBACK;

  // Fetch lazy una sola vez al montarse (el megamenu se monta on-hover)
  useEffect(() => {
    api.get('/api/explore/videos?sort=trending&limit=2')
      .then(({ data }) => setHot((data.videos || []).slice(0, 2)))
      .catch(() => {});
    api.get('/api/explore/videos?sort=top&limit=2')
      .then(({ data }) => setRecommended((data.videos || []).slice(0, 2)))
      .catch(() => {});
    api.get('/api/explore/playlists/featured?limit=2')
      .then(({ data }) => setPlaylists((data.playlists || []).slice(0, 2)))
      .catch(() => {});
    api.get('/api/creator/discover?sort=popular&limit=2')
      .then(({ data }) => setChannels((data.creators || []).slice(0, 2)))
      .catch(() => {});
  }, []);

  const handleSort = (id) => {
    onSelectSort?.(id);
    onClose?.();
  };
  const handleTag = (slug) => {
    onSelectTag?.(slug);
    onClose?.();
  };

  return (
    <div
      role="menu"
      aria-label="Menú de videos"
      className="bg-dark-900/98 backdrop-blur-xl border-y border-white/5 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* Col 1: Descubre Videos (3 cols) */}
        <div className="col-span-3">
          <h3 className="text-white text-sm font-black mb-3">Descubre Videos</h3>
          <ul className="space-y-0.5">
            {DISCOVER_ITEMS.map(item => {
              const Icon = item.icon;
              const content = (
                <span className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors">
                  <Icon size={14} className="text-gray-500" />
                  {item.label}
                </span>
              );
              return (
                <li key={item.id}>
                  {item.link?.startsWith('/') ? (
                    <Link to={item.link} onClick={onClose}>{content}</Link>
                  ) : (
                    <button
                      onClick={() => handleSort(item.id)}
                      className="w-full text-left"
                      role="menuitem"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Col 2: El más caliente */}
        <PreviewColumn
          title="El más caliente"
          videos={hot}
          onClick={() => handleSort('hot')}
        />

        {/* Col 3: Recomendado */}
        <PreviewColumn
          title="Recomendado"
          videos={recommended}
          onClick={() => handleSort('recommended')}
        />

        {/* Col 4: Listas de reproducción */}
        <PlaylistsColumn playlists={playlists} onClose={onClose} />

        {/* Col 5: Canales */}
        <ChannelsColumn channels={channels} onClose={onClose} />

        {/* Col 6: Búsquedas de Tendencia */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3">Búsquedas de Tendencia</h3>
          <ul className="space-y-1.5">
            {trending.map((t, i) => (
              <li key={`${t}-${i}`}>
                <button
                  onClick={() => handleTag(t)}
                  className="w-full text-left bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                  role="menuitem"
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PreviewColumn({ title, videos, onClick }) {
  return (
    <div className="col-span-2">
      <button
        onClick={onClick}
        className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
      >
        {title}
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
      <div className="space-y-3">
        {videos.length === 0 && [...Array(2)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="aspect-video bg-dark-800 rounded-md animate-pulse" />
            <div className="h-3 bg-dark-800 rounded animate-pulse w-4/5" />
          </div>
        ))}
        {videos.map(v => (
          <Link
            key={v.id}
            to={`/explore/v/${v.id}`}
            className="block group"
          >
            <div className="relative aspect-video bg-dark-800 rounded-md overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt={v.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-dark-700" />
              )}
              <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[10px] font-bold px-1 py-0.5 rounded leading-none">
                {fmtDuration(v.duration_seconds)}
              </span>
            </div>
            <p className="text-xs text-white font-semibold mt-1.5 line-clamp-2 leading-tight group-hover:text-brand-300 transition-colors">
              {v.title}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
              {v.user?.full_name}
              {v.user?.is_verified && ' ✓'}
            </p>
            <p className="text-[10px] text-gray-600">{fmtViews(v.views_count)} vistas</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PlaylistsColumn({ playlists, onClose }) {
  return (
    <div className="col-span-2">
      <Link
        to="/explore/playlists"
        onClick={onClose}
        className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
      >
        Listas de reproducción
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </Link>
      <div className="space-y-3">
        {playlists.length === 0 && [...Array(2)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="aspect-video bg-dark-800 rounded-md animate-pulse" />
            <div className="h-3 bg-dark-800 rounded animate-pulse w-3/5" />
          </div>
        ))}
        {playlists.map(p => (
          <Link
            key={p.id}
            to={`/explore/playlists/${p.id}`}
            onClick={onClose}
            className="block group"
          >
            <div className="relative aspect-video bg-dark-800 rounded-md overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
              {p.cover_url ? (
                <img src={p.cover_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-dark-700 to-dark-800 flex items-center justify-center">
                  <FiList size={24} className="text-gray-600" />
                </div>
              )}
              <span className="absolute top-1 right-1 bg-black/85 text-white text-[10px] font-bold px-1 py-0.5 rounded leading-none flex items-center gap-0.5">
                <FiList size={8} /> {p.items_count || 0}
              </span>
            </div>
            <p className="text-xs text-white font-semibold mt-1.5 truncate group-hover:text-brand-300 transition-colors">
              {p.name}
            </p>
            <p className="text-[10px] text-gray-500">{fmtViews(p.views_count)} vistas</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ChannelsColumn({ channels, onClose }) {
  return (
    <div className="col-span-1">
      <Link
        to="/adult?tab=creators"
        onClick={onClose}
        className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
      >
        Canales
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </Link>
      <div className="space-y-3">
        {channels.length === 0 && [...Array(2)].map((_, i) => (
          <div key={i} className="aspect-square bg-dark-800 rounded-md animate-pulse" />
        ))}
        {channels.map(c => (
          <Link
            key={c.id}
            to={`/profile/${c.id}`}
            onClick={onClose}
            className="block group"
          >
            <div className="relative aspect-square bg-dark-800 rounded-md overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all flex items-center justify-center p-2">
              {c.avatar_url ? (
                <img
                  src={c.avatar_url}
                  alt={c.full_name}
                  className="w-full h-full object-cover rounded"
                  loading="lazy"
                />
              ) : (
                <div className="text-white font-black text-lg uppercase truncate">
                  {c.full_name?.split(' ').map(p => p[0]).slice(0, 2).join('')}
                </div>
              )}
            </div>
            <p className="text-xs text-brand-400 font-bold mt-1.5 truncate group-hover:text-brand-300 transition-colors">
              {c.full_name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
