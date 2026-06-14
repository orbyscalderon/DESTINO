import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiCamera, FiClock, FiVideo, FiSearch } from 'react-icons/fi';
import api from '../../lib/api.js';
import FlagImg from './FlagImg.jsx';

// Megamenu PH-style para el tab LIVE CAMS.
// Layout:
//   Col 1 (col-span-3): título naranja "Cámaras en vivo" + 3 quick links
//                       + Categorías Destacadas de Cámara (pills)
//   Col 2 (col-span-9): 5 columnas verticales con 2 model cards cada una
//                       + CTA "Ver todos" al pie de cada columna
//
// Cada columna agrupa shows por criterio:
//   · Modelos En Línea Ahora — todos los shows live (default sort)
//   · Nuevos Modelos — hosts creados recientemente
//   · Modelos Cercanas — match por país del user (si hay)
//   · Show De Oro — shows con type='exclusive' o is_exclusive
//   · Chat De Fiesta — shows con type='party' (fallback: viewer_count alto)
//
// Si el backend aún no devuelve esos type/is_exclusive, fallback de
// distribuir el array por buckets de 2 para que las columnas no queden vacías.
//
// Props:
//   liveShows         — array de shows live desde el AdultHub padre
//   userCountry       — código país del user (opcional, para "Cercanas")
//   onSelectCategory  — slug de categoría pill
//   onClose

const LEFT_LINKS = [
  { id: 'all',    label: 'Todas las Cámaras en Vivo', icon: FiCamera },
  { id: 'recent', label: 'Modelos Recientes',         icon: FiClock  },
  { id: 'men',    label: 'Chicos',                    icon: FiVideo  },
];

const CAM_CATEGORIES_FALLBACK = [
  'Fetiche De Pies', 'Tetas Pequeñas', 'Maduras', 'Juguetes',
  'Latinas', 'Nenas', 'Amas De Casa', 'Morena',
  'Cuerpo Pequeño', 'Coño Rasurado', 'Sexo Anal', 'Tetas Medianas',
];

const COLUMNS = [
  { id: 'online',   title: 'Modelos En Línea Ahora', cta: 'Todos Los Modelos En Línea', filter: 'all'      },
  { id: 'new',      title: 'Nuevos Modelos',         cta: 'Todos Los Nuevos Modelos',   filter: 'new'      },
  { id: 'near',     title: 'Modelos Cercanas',       cta: 'Todas Las Modelos Cercanas', filter: 'near'     },
  { id: 'oro',      title: 'Show De Oro',            cta: 'Todos Los Shows De Oro',     filter: 'oro'      },
  { id: 'party',    title: 'Chat De Fiesta',         cta: 'Todas Las Fiestas De Chat',  filter: 'party'    },
];

function slugifyCamCat(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function LivesMegamenu({ liveShows = [], userCountry, onSelectCategory, onClose }) {
  const [camCategories, setCamCategories] = useState(CAM_CATEGORIES_FALLBACK);

  // Intento de hidratar categorías de cámara desde el backend si existen
  useEffect(() => {
    api.get('/api/adult-categories')
      .then(({ data }) => {
        // groups[kink|body|etc].map(c => c.name)
        const all = Object.values(data.groups || {}).flat()
          .map(c => c.name)
          .filter(Boolean);
        if (all.length >= 6) setCamCategories(all.slice(0, 12));
      })
      .catch(() => {});
  }, []);

  // Distribuir shows por bucket. Si el backend no marca type/is_exclusive,
  // hacemos fallback por índice (cada columna recibe 2 shows distintos).
  const columns = useMemo(() => {
    const result = {};
    const isNewHost = (s) => {
      if (!s.host?.created_at) return false;
      return Date.now() - new Date(s.host.created_at).getTime() < 30 * 24 * 3600 * 1000;
    };
    result.online = liveShows;
    result.new    = liveShows.filter(isNewHost);
    result.near   = userCountry
      ? liveShows.filter(s => s.host?.country === userCountry)
      : [];
    result.oro    = liveShows.filter(s => s.is_exclusive || s.type === 'exclusive' || s.type === 'gold');
    result.party  = liveShows.filter(s => s.type === 'party' || (s.viewer_count || 0) > 50);

    // Fallback: si algún bucket está vacío, repartir por slice del array original
    COLUMNS.forEach((c, idx) => {
      if (!result[c.id] || result[c.id].length === 0) {
        result[c.id] = liveShows.slice(idx * 2, idx * 2 + 2);
      } else {
        result[c.id] = result[c.id].slice(0, 2);
      }
    });
    return result;
  }, [liveShows, userCountry]);

  const pickLeftLink = (id) => {
    onSelectCategory?.({ kind: 'live-filter', value: id });
    onClose?.();
  };
  const pickCategory = (name) => {
    onSelectCategory?.({ kind: 'live-category', value: slugifyCamCat(name) });
    onClose?.();
  };
  const pickColumnAll = (filter) => {
    onSelectCategory?.({ kind: 'live-bucket', value: filter });
    onClose?.();
  };

  return (
    <div
      role="menu"
      aria-label="Menú de cámaras en vivo"
      className="relative bg-dark-900 border-y border-white/10 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* ── Col 1: Cámaras en vivo (header + quicklinks + cat pills) ── */}
        <div className="col-span-3 space-y-5">
          <section>
            <h3 className="text-amber-500 text-base font-black mb-3">Cámaras en vivo</h3>
            <ul className="space-y-0.5">
              {LEFT_LINKS.map(l => {
                const Icon = l.icon;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => pickLeftLink(l.id)}
                      role="menuitem"
                      className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors"
                    >
                      <Icon size={14} className="text-gray-500" />
                      {l.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="text-white text-sm font-black mb-3 flex items-center gap-1.5">
              <FiSearch size={13} className="text-gray-500" />
              Categorías Destacadas de Cámara.
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {camCategories.map(c => (
                <button
                  key={c}
                  role="menuitem"
                  onClick={() => pickCategory(c)}
                  className="bg-dark-800 hover:bg-amber-500/15 hover:border-amber-500/30 border border-white/5 text-gray-300 hover:text-amber-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* ── Col 2: 5 columnas de model cards ── */}
        <div className="col-span-9 grid grid-cols-5 gap-3">
          {COLUMNS.map(col => (
            <div key={col.id} className="flex flex-col">
              <h3 className="text-white text-xs font-black mb-2 leading-tight min-h-[2.5em]">
                {col.title}
              </h3>
              <div className="space-y-2 mb-2 flex-1">
                {columns[col.id].length === 0
                  ? [...Array(2)].map((_, i) => (
                      <div key={i} className="aspect-[3/4] bg-dark-800 rounded-md animate-pulse" />
                    ))
                  : columns[col.id].map(show => (
                      <LiveModelCard key={show.id} show={show} bucket={col.id} onClose={onClose} />
                    ))}
              </div>
              <button
                onClick={() => pickColumnAll(col.filter)}
                className="text-center w-full bg-dark-800 hover:bg-amber-500/15 hover:border-amber-500/30 border border-white/5 text-gray-300 hover:text-amber-300 text-[10px] font-semibold px-2 py-2 rounded-lg transition-colors leading-tight"
              >
                {col.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveModelCard({ show, bucket, onClose }) {
  const host = show.host || {};
  const label = bucket === 'oro' ? 'SHOW DE ORO' : 'EN VIVO';

  return (
    <Link
      to={`/shows/${show.id}`}
      onClick={onClose}
      className="block group"
    >
      <div className="relative aspect-[3/4] bg-dark-800 rounded-md overflow-hidden ring-1 ring-white/5 group-hover:ring-amber-500/40 transition-all">
        {show.cover_url || host.avatar_url ? (
          <img
            src={show.cover_url || host.avatar_url}
            alt={host.full_name || 'Modelo'}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/40 to-rose-900/40 flex items-center justify-center">
            <span className="text-4xl opacity-40">🎥</span>
          </div>
        )}

        {/* Username overlay arriba (cuando hay cover_url, sino se vería bajo el avatar) */}
        <div className="absolute inset-x-0 top-0 p-2 bg-gradient-to-b from-black/70 to-transparent">
          <p className="text-white text-[11px] font-black truncate drop-shadow">
            {host.full_name || host.username || 'Modelo'}
          </p>
        </div>
      </div>

      {/* Footer strip — naranja dot + label + HD + viewers + flag */}
      <div className="mt-1 flex items-center gap-1.5 text-[9px] bg-dark-800/60 rounded-md px-1.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span className="text-amber-400 font-black tracking-wide truncate">{label}</span>
        <span className="ml-auto text-gray-400 font-bold shrink-0">HD</span>
        {show.viewer_count > 0 && (
          <span className="text-gray-500 font-bold shrink-0">{show.viewer_count}</span>
        )}
        {host.country && (
          <FlagImg code={host.country} className="w-3.5 h-2.5 rounded-sm object-cover shrink-0" />
        )}
      </div>
    </Link>
  );
}
