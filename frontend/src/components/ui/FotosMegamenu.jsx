import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiImage, FiTrendingUp, FiZap, FiLock, FiCamera,
  FiChevronRight, FiAward,
} from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para el tab FOTOS Y GIFS.
// Layout 12-col:
//   Col 1 (3): Quick filters (Galerías populares, Nuevas, GIFs, Gratis, Premium, Sets)
//   Col 2 (5): Galerías destacadas — 4 thumbs en grid 2x2
//   Col 3 (2): GIFs trending — 2 thumbs
//   Col 4 (2): Categorías pills

const FILTERS = [
  { id: 'popular',  label: 'Galerías populares', icon: FiTrendingUp },
  { id: 'new',      label: 'Nuevas galerías',    icon: FiZap        },
  { id: 'gifs',     label: 'GIFs',               icon: FiCamera     },
  { id: 'free',     label: 'Gratis',             icon: FiImage      },
  { id: 'premium',  label: 'Premium / PPV',      icon: FiLock       },
  { id: 'editors',  label: 'Editor\'s pick',     icon: FiAward      },
];

const TAG_FALLBACK = [
  'Lencería', 'Cosplay', 'Selfies', 'Bondage', 'Lésbico',
  'POV', 'Caseras', 'Tatuadas', 'Playa', 'Latex',
];

export default function FotosMegamenu({ onClose, onSelectFilter, trendingFromHub }) {
  const [collections, setCollections] = useState([]);

  const tags = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 10)
    : TAG_FALLBACK;

  useEffect(() => {
    api.get('/api/photo-collections/public?limit=6')
      .then(({ data }) => setCollections((data.collections || []).slice(0, 6)))
      .catch(() => {});
  }, []);

  const pickFilter = (id) => {
    onSelectFilter?.({ kind: 'photo-filter', value: id });
    onClose?.();
  };
  const pickTag = (tag) => {
    onSelectFilter?.({ kind: 'photo-tag', value: tag });
    onClose?.();
  };

  const featured = collections.slice(0, 4);
  const gifs = collections.slice(4, 6);

  return (
    <div
      role="menu"
      aria-label="Menú de fotos y GIFs"
      className="relative bg-dark-900 border-y border-white/10 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* ── Col 1: Quick filters ── */}
        <div className="col-span-3">
          <h3 className="text-white text-sm font-black mb-3">Descubre Fotos</h3>
          <ul className="space-y-0.5">
            {FILTERS.map(f => {
              const Icon = f.icon;
              return (
                <li key={f.id}>
                  <button
                    onClick={() => pickFilter(f.id)}
                    role="menuitem"
                    className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors"
                  >
                    <Icon size={14} className="text-gray-500" />
                    {f.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Col 2: Galerías destacadas (2x2) ── */}
        <div className="col-span-5">
          <Link
            to="/adult?tab=fotos"
            onClick={onClose}
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
          >
            Galerías destacadas
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <div className="grid grid-cols-2 gap-2">
            {featured.length === 0 && [...Array(4)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-dark-800 rounded-md animate-pulse" />
            ))}
            {featured.map(col => (
              <Link
                key={col.id}
                to={`/photos/${col.id}`}
                onClick={onClose}
                className="group block relative aspect-[3/4] rounded-md overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-brand-500/40 transition-all"
              >
                {col.cover_url ? (
                  <img
                    src={col.cover_url}
                    alt={col.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-900/40 to-accent-900/40" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-white text-[11px] font-bold truncate">{col.title}</p>
                  <p className="text-gray-300 text-[9px]">{col.photo_count || 0} fotos</p>
                </div>
                {col.is_paid && (
                  <span className="absolute top-2 right-2 bg-brand-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                    PPV
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Col 3: GIFs trending ── */}
        <div className="col-span-2">
          <button
            onClick={() => pickFilter('gifs')}
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
          >
            GIFs
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div className="space-y-2">
            {gifs.length === 0 && [...Array(2)].map((_, i) => (
              <div key={i} className="aspect-square bg-dark-800 rounded-md animate-pulse" />
            ))}
            {gifs.map(col => (
              <Link
                key={col.id}
                to={`/photos/${col.id}`}
                onClick={onClose}
                className="group block relative aspect-square rounded-md overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-brand-500/40 transition-all"
              >
                {col.cover_url && (
                  <img src={col.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                )}
                <span className="absolute top-1 right-1 bg-black/80 text-white text-[9px] font-black px-1 rounded">GIF</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Col 4: Categorías pills ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3">Categorías</h3>
          <ul className="space-y-1.5">
            {tags.map((t, i) => (
              <li key={`${t}-${i}`}>
                <button
                  onClick={() => pickTag(t)}
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
