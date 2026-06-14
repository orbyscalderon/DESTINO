import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight, FiUser, FiGlobe } from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para el tab Categorías.
// Layout 3 zonas:
//   Izquierda  : Orientación (4 botones) + Idioma (chips)
//   Centro     : Más Populares — grid de category tiles con thumbnail + count
//   Derecha    : Búsquedas Populares (pills verticales)
//
// Props:
//   onSelectFilter({ kind, value })  — orientation:'gay' | language:'es' | category:'milf'
//   onSelectTag(tag)
//   onClose()
//   trendingFromHub                  — array de strings/tags trending del padre

const ORIENTATIONS = [
  { id: 'straight',    label: 'Hetero'      },
  { id: 'gay',         label: 'Gay'         },
  { id: 'transgender', label: 'Transgénero' },
  { id: 'sapphic',     label: 'Sáfica'      },
];

const LANGUAGES = [
  { code: 'es', label: 'Spanish'    },
  { code: 'pt', label: 'Portuguese' },
  { code: 'en', label: 'English'    },
];

// Fallback de categorías populares — render desde día 1 sin esperar al
// backend. Cuando /api/explore/categories devuelve tags, sobrescribimos.
// label en ES; slug en kebab-case (matches con backend tags).
const POPULAR_FALLBACK = [
  { slug: 'maduras',         label: 'Maduras',                videos_count: null },
  { slug: '18-25',           label: '18-25 años',             videos_count: null },
  { slug: 'milf',            label: 'MILF',                   videos_count: null },
  { slug: 'negras',          label: 'Negras',                 videos_count: null },
  { slug: 'anal',            label: 'Anal',                   videos_count: null },
  { slug: 'edades',          label: 'Jovencitas/Viejos (18+)',videos_count: null },
  { slug: 'lesbianas',       label: 'Lesbianas',              videos_count: null },
  { slug: 'trios',           label: 'Tríos',                  videos_count: null },
  { slug: 'japonesas',       label: 'Japonesas',              videos_count: null },
  { slug: 'hentai',          label: 'Hentai',                 videos_count: null },
  { slug: 'tetas-grandes',   label: 'Tetas Grandes',          videos_count: null },
  { slug: 'publico',         label: 'Público',                videos_count: null },
  { slug: 'caricaturas',     label: 'Caricaturas',            videos_count: null },
  { slug: 'bondage',         label: 'Bondage',                videos_count: null },
  { slug: 'creampie',        label: 'Creampie',               videos_count: null },
  { slug: 'transgenero',     label: 'Transgénero',            videos_count: null },
  { slug: 'orgia',           label: 'Orgía',                  videos_count: null },
  { slug: 'vergas-grandes',  label: 'Vergas grandes',         videos_count: null },
];

const TRENDING_FALLBACK = [
  'Abella Anderson', 'Asa Akira', 'Rebeca Linares', 'Follando Duro',
  'Lesbian Tribbing', 'Ricos Gemidos', 'La Perversa Singando',
  'Xxnx Porn Videos', 'Jocessita', 'Blahgigi Torres',
];

// Paleta determinística para los tiles (consistencia entre renders y para
// que cada slug tenga su propio color sin pedir image al backend).
const TILE_GRADIENTS = [
  'from-rose-900/60 to-pink-900/40',
  'from-purple-900/60 to-fuchsia-900/40',
  'from-indigo-900/60 to-blue-900/40',
  'from-amber-900/60 to-orange-900/40',
  'from-emerald-900/60 to-teal-900/40',
  'from-red-900/60 to-rose-900/40',
];
function gradientFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return TILE_GRADIENTS[h % TILE_GRADIENTS.length];
}

function fmtCount(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M videos`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K videos`;
  return `${n} videos`;
}

export default function CategoriasMegamenu({ onSelectFilter, onSelectTag, onClose, trendingFromHub }) {
  const [popular, setPopular] = useState(POPULAR_FALLBACK);
  const trending = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 10)
    : TRENDING_FALLBACK;

  // Sustituir fallback con tags reales del backend (con counts) si llegan
  useEffect(() => {
    api.get('/api/explore/tags?limit=18&sort=popular')
      .then(({ data }) => {
        const real = (data.tags || []).map(t => ({
          slug: t.slug,
          label: t.name || t.slug,
          videos_count: t.videos_count || null,
          cover_url: t.cover_url || null,
        }));
        if (real.length >= 6) setPopular(real);
      })
      .catch(() => {});
  }, []);

  const pickTag = (slug) => {
    onSelectTag?.(slug);
    onClose?.();
  };
  const pickFilter = (kind, value) => {
    onSelectFilter?.({ kind, value });
    onClose?.();
  };

  return (
    <div
      role="menu"
      aria-label="Menú de categorías"
      className="bg-dark-900/98 backdrop-blur-xl border-y border-white/5 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* ── Col 1: Orientación + Idioma ── */}
        <div className="col-span-3 space-y-6">
          <section>
            <h3 className="text-white text-sm font-black mb-3 flex items-center gap-1.5">
              <FiUser size={13} className="text-gray-500" /> Orientación
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {ORIENTATIONS.map(o => (
                <button
                  key={o.id}
                  role="menuitem"
                  onClick={() => pickFilter('orientation', o.id)}
                  className="bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-200 hover:text-brand-300 text-xs font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-white text-sm font-black mb-3 flex items-center gap-1.5">
              <FiGlobe size={13} className="text-gray-500" /> Porno En Su Idioma
            </h3>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  role="menuitem"
                  onClick={() => pickFilter('language', l.code)}
                  className="bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-200 hover:text-brand-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* ── Col 2: Más Populares (grid 3x6) ── */}
        <div className="col-span-7">
          <button
            onClick={() => pickTag('')}
            className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
          >
            Más Populares
            <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div className="grid grid-cols-6 gap-2">
            {popular.slice(0, 18).map(cat => (
              <CategoryTile
                key={cat.slug}
                cat={cat}
                onPick={() => pickTag(cat.slug)}
              />
            ))}
          </div>
        </div>

        {/* ── Col 3: Búsquedas Populares ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3">Búsquedas Populares</h3>
          <ul className="space-y-1.5">
            {trending.map((t, i) => (
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

function CategoryTile({ cat, onPick }) {
  const grad = gradientFor(cat.slug);
  const count = fmtCount(cat.videos_count);
  return (
    <button
      onClick={onPick}
      className="group relative aspect-[4/3] rounded-md overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-brand-500/40 transition-all"
      role="menuitem"
      aria-label={cat.label}
    >
      {cat.cover_url ? (
        <img
          src={cat.cover_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad}`}>
          <div className="absolute inset-0 opacity-30" style={{
            background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15), transparent 60%)',
          }} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute left-2 right-2 bottom-1.5 text-left">
        <p className="text-white text-[11px] font-black leading-tight truncate group-hover:text-brand-200">
          {cat.label}
        </p>
        {count && (
          <p className="text-gray-300 text-[9px] font-medium mt-0.5">{count}</p>
        )}
      </div>
    </button>
  );
}
