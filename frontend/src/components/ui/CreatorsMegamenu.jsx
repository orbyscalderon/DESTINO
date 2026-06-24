import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiStar, FiUserCheck, FiTrendingUp, FiUsers, FiGlobe,
  FiHeart, FiChevronRight,
} from 'react-icons/fi';
import api from '../../lib/api.js';
import VerifiedBadge from './VerifiedBadge.jsx';
import FlagImg from './FlagImg.jsx';

// Megamenu PH-style para el tab CREATORS (ESTRELLAS PORNO).
// Layout 12-col:
//   Col 1 (3): Quick filters (Top, Nuevas, Verificadas, Premium, En línea, Cercanas)
//   Col 2 (6): Top Estrellas — 8 avatares grid 4x2
//   Col 3 (3): Por país (lista con banderas) + Nombres trending pills

const FILTERS = [
  { id: 'top',         label: 'Top Estrellas',     icon: FiStar       },
  { id: 'new',         label: 'Nuevas Estrellas',  icon: FiTrendingUp },
  { id: 'verified',    label: 'Verificadas',       icon: FiUserCheck  },
  { id: 'premium',     label: 'Premium',           icon: FiStar       },
  { id: 'online',      label: 'En Línea Ahora',    icon: FiUsers      },
  { id: 'near',        label: 'Cercanas',          icon: FiGlobe      },
  { id: 'follows',     label: 'Mis seguidas',      icon: FiHeart      },
];

// Países fallback con código ISO-2 (matches FlagImg).
// Si el backend devuelve countries con creators reales (via /api/creator/discover),
// se reemplazan dinámicamente en useEffect.
const COUNTRIES_FALLBACK = [
  { code: 'do', label: 'R. Dominicana' },
  { code: 'mx', label: 'México'      },
  { code: 'co', label: 'Colombia'    },
  { code: 'ar', label: 'Argentina'   },
  { code: 've', label: 'Venezuela'   },
  { code: 'es', label: 'España'      },
  { code: 'us', label: 'EE.UU.'      },
  { code: 'br', label: 'Brasil'      },
];
// Map ISO-2 → label en español para countries derivados del backend
const COUNTRY_LABELS = {
  do: 'R. Dominicana', mx: 'México', co: 'Colombia', ar: 'Argentina',
  ve: 'Venezuela',     es: 'España', us: 'EE.UU.',   br: 'Brasil',
  cl: 'Chile',         pe: 'Perú',   uy: 'Uruguay',  ec: 'Ecuador',
  bo: 'Bolivia',       pa: 'Panamá', pr: 'Puerto Rico', cr: 'Costa Rica',
};

const TRENDING_NAMES_FALLBACK = [
  'Abella Anderson', 'Asa Akira', 'Rebeca Linares',
  'Jocessita', 'Blahgigi Torres', 'Sweetfantasy',
];

export default function CreatorsMegamenu({ onClose, onSelectFilter, trendingFromHub }) {
  const [creators, setCreators] = useState([]);
  const [countries, setCountries] = useState(COUNTRIES_FALLBACK);

  const trending = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 6)
    : TRENDING_NAMES_FALLBACK;

  useEffect(() => {
    // Pedimos hasta 60 creators para derivar countries reales (no hardcoded)
    api.get('/api/creator/discover?sort=popular&limit=60')
      .then(({ data }) => {
        const list = data.creators || [];
        setCreators(list.slice(0, 8));
        // Derivar countries únicos top 8 ordenados por frecuencia
        const counts = {};
        for (const c of list) {
          const code = (c.country || '').toLowerCase().slice(0, 2);
          if (code && /^[a-z]{2}$/.test(code)) counts[code] = (counts[code] || 0) + 1;
        }
        const topCountries = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([code]) => ({ code, label: COUNTRY_LABELS[code] || code.toUpperCase() }));
        if (topCountries.length >= 3) setCountries(topCountries);
      })
      .catch(() => {});
  }, []);

  const pickFilter = (id) => {
    onSelectFilter?.({ kind: 'creator-filter', value: id });
    onClose?.();
  };
  const pickCountry = (code) => {
    onSelectFilter?.({ kind: 'creator-country', value: code });
    onClose?.();
  };

  return (
    <div
      role="menu"
      aria-label="Menú de estrellas"
      className="relative bg-dark-900 border-y border-white/10 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* ── Col 1: Quick filters ── */}
        <div className="col-span-3">
          <h3 className="text-white text-sm font-black mb-3">Descubre Estrellas</h3>
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

        {/* ── Col 2: Top Estrellas (4x2 avatars) ── */}
        <div className="col-span-6">
          <Link
            to="/adult?tab=creators"
            onClick={onClose}
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
          >
            Top Estrellas
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <div className="grid grid-cols-4 gap-3">
            {creators.length === 0 && [...Array(8)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="aspect-square rounded-full bg-dark-800 animate-pulse" />
                <div className="h-3 bg-dark-800 rounded animate-pulse" />
              </div>
            ))}
            {creators.map(c => (
              <Link
                key={c.id}
                to={`/profile/${c.id}`}
                onClick={onClose}
                className="block text-center group"
              >
                <div className="relative aspect-square rounded-full overflow-hidden bg-dark-800 ring-2 ring-white/5 group-hover:ring-brand-500/50 transition-all">
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt={c.full_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-900/40 to-accent-900/40 flex items-center justify-center text-white font-black">
                      {c.full_name?.[0]}
                    </div>
                  )}
                  {c.is_verified && (
                    <div className="absolute bottom-0 right-0">
                      <VerifiedBadge size={14} />
                    </div>
                  )}
                </div>
                <p className="text-white text-[11px] font-bold mt-1.5 truncate group-hover:text-brand-300 transition-colors">
                  {c.full_name}
                </p>
                {c.subscribers_count > 0 && (
                  <p className="text-gray-500 text-[10px] truncate">
                    {c.subscribers_count.toLocaleString()} subs
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Col 3: Por país + trending nombres ── */}
        <div className="col-span-3 space-y-5">
          <section>
            <h3 className="text-white text-sm font-black mb-3 flex items-center gap-1.5">
              <FiGlobe size={13} className="text-gray-500" /> Por País
            </h3>
            <ul className="grid grid-cols-2 gap-1.5">
              {countries.map(c => (
                <li key={c.code}>
                  <button
                    onClick={() => pickCountry(c.code)}
                    role="menuitem"
                    className="w-full text-left flex items-center gap-2 bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <FlagImg code={c.code} className="w-4 h-3 rounded-sm object-cover shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-white text-sm font-black mb-3">Búsquedas trending</h3>
            <ul className="space-y-1.5">
              {trending.map((t, i) => (
                <li key={`${t}-${i}`}>
                  <Link
                    to={`/search?q=${encodeURIComponent(t)}`}
                    onClick={onClose}
                    className="block bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors text-left"
                    role="menuitem"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
