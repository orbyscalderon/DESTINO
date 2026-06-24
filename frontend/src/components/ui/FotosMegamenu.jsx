import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFilm, FiImage, FiCircle, FiUpload, FiZap, FiAward,
  FiTrendingUp, FiChevronRight,
} from 'react-icons/fi';
import api from '../../lib/api.js';

// Megamenu PH-style para tab FOTOS Y GIFS — layout 12-col (6 columnas iguales).
//
//   Col 1 (2): Descubre Fotos y Gifs — 8 quick links con iconos
//   Col 2 (2): Gifs Destacados — 2 GIFs stacked + autor
//   Col 3 (2): Gifs Más Vistos — 2 GIFs stacked
//   Col 4 (2): Álbumes Destacados — 2 albums stacked, título naranja
//   Col 5 (2): Álbumes Más Vistos — 2 albums stacked con % rating
//   Col 6 (2): Etiquetas Populares — pills flex-wrap

const DISCOVER_LINKS = [
  { id: 'gifs',          label: 'Porno Gifs',                icon: FiFilm,   filter: { kind: 'photo-filter', value: 'gifs' } },
  { id: 'gifs-top',      label: 'GIFs mejor evaluados',      icon: FiFilm,   filter: { kind: 'photo-filter', value: 'gifs-top' } },
  { id: 'gifs-views',    label: 'Los GIFs más vistos.',      icon: FiFilm,   filter: { kind: 'photo-filter', value: 'gifs-views' } },
  { id: 'all-albums',    label: 'Todos los Álbumes de Fotos',icon: FiCircle, filter: { kind: 'photo-filter', value: 'all-albums' }, dot: true },
  { id: 'albums-feat',   label: 'Álbumes Destacados',        icon: FiCircle, filter: { kind: 'photo-filter', value: 'albums-feat' }, dot: true },
  { id: 'albums-views',  label: 'Álbumes más Vistos',        icon: FiCircle, filter: { kind: 'photo-filter', value: 'albums-views' }, dot: true },
  { id: 'upload',        label: 'Cargar Fotos',              icon: FiUpload, link: '/creator/vault?upload=photo' },
  { id: 'make-gif',      label: 'Realiza tu propio GIF',     icon: FiFilm,   link: '/creator/vault?upload=gif' },
];

const POPULAR_TAGS_FALLBACK = [
  { label: 'Tetas',       wide: false },
  { label: 'Culo',        wide: false },
  { label: 'Coño',        wide: true  },
  { label: 'Aficionado',  wide: true  },
  { label: 'Verga',       wide: false },
  { label: 'Ardiente',    wide: false },
  { label: 'Jóvenes 18+', wide: true  },
  { label: 'Hentai',      wide: false },
  { label: 'Sexo',        wide: false },
  { label: 'Tetas',       wide: true  },
];

export default function FotosMegamenu({ onClose, onSelectFilter, trendingFromHub }) {
  const [allCols, setAllCols] = useState([]); // photo collections (genéricos)

  // El backend probablemente no separa por type=gif vs type=album todavía.
  // Pedimos 8 collections y distribuimos por índice: 0-1 gifs feat, 2-3 gifs
  // views, 4-5 albums feat, 6-7 albums views. Si hay menos, los buckets
  // posteriores quedan vacíos (skeleton).
  useEffect(() => {
    api.get('/api/photo-collections/public?limit=8')
      .then(({ data }) => setAllCols(data.collections || []))
      .catch(() => {});
  }, []);

  const buckets = {
    gifsFeat:    allCols.slice(0, 2),
    gifsViews:   allCols.slice(2, 4),
    albumsFeat:  allCols.slice(4, 6),
    albumsViews: allCols.slice(6, 8),
  };

  // Tags reales si trending del hub trae algo razonable, sino fallback
  const tags = (trendingFromHub && trendingFromHub.length > 0)
    ? trendingFromHub.slice(0, 10).map((t, i) => ({ label: t, wide: i % 3 === 0 }))
    : POPULAR_TAGS_FALLBACK;

  const pickFilter = (filter) => {
    onSelectFilter?.(filter);
    onClose?.();
  };
  const pickTag = (label) => {
    onSelectFilter?.({ kind: 'photo-tag', value: label });
    onClose?.();
  };

  return (
    <div
      role="menu"
      aria-label="Menú de fotos y GIFs"
      className="relative bg-dark-900 border-y border-white/10 shadow-2xl shadow-black/80"
    >
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-5">

        {/* ── Col 1: Descubre Fotos y Gifs ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3 leading-tight">
            Descubre<br />Fotos y Gifs
          </h3>
          <ul className="space-y-0.5">
            {DISCOVER_LINKS.map(l => {
              const Icon = l.icon;
              const content = (
                <span className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-white/5 hover:text-white text-xs font-medium transition-colors">
                  {l.dot ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  ) : (
                    <Icon size={13} className="text-gray-500 shrink-0" />
                  )}
                  <span className="truncate">{l.label}</span>
                </span>
              );
              return (
                <li key={l.id}>
                  {l.link ? (
                    <Link to={l.link} onClick={onClose} role="menuitem">{content}</Link>
                  ) : (
                    <button
                      onClick={() => pickFilter(l.filter)}
                      role="menuitem"
                      className="w-full text-left"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Col 2: Gifs Destacados ── */}
        <PreviewCol
          title="Gifs Destacados"
          items={buckets.gifsFeat}
          variant="gif"
          onHeaderClick={() => pickFilter({ kind: 'photo-filter', value: 'gifs-featured' })}
        />

        {/* ── Col 3: Gifs Más Vistos ── */}
        <PreviewCol
          title="Gifs Más Vistos"
          items={buckets.gifsViews}
          variant="gif"
          onHeaderClick={() => pickFilter({ kind: 'photo-filter', value: 'gifs-views' })}
        />

        {/* ── Col 4: Álbumes Destacados ── */}
        <PreviewCol
          title="Álbumes Destacados"
          items={buckets.albumsFeat}
          variant="album"
          onHeaderClick={() => pickFilter({ kind: 'photo-filter', value: 'albums-featured' })}
        />

        {/* ── Col 5: Álbumes Más Vistos ── */}
        <PreviewCol
          title="Álbumes Más Vistos"
          items={buckets.albumsViews}
          variant="album-rating"
          onHeaderClick={() => pickFilter({ kind: 'photo-filter', value: 'albums-views' })}
        />

        {/* ── Col 6: Etiquetas Populares ── */}
        <div className="col-span-2">
          <h3 className="text-white text-sm font-black mb-3">Etiquetas Populares</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <button
                key={`${t.label}-${i}`}
                onClick={() => pickTag(t.label)}
                role="menuitem"
                className={`bg-dark-800 hover:bg-brand-500/15 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  t.wide ? 'flex-1 min-w-full text-center' : 'flex-grow text-center'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Preview column con 2 thumbs stacked ─── */
function PreviewCol({ title, items, variant, onHeaderClick }) {
  const isAlbum = variant === 'album' || variant === 'album-rating';
  const showRating = variant === 'album-rating';

  return (
    <div className="col-span-2">
      <button
        onClick={onHeaderClick}
        className="flex items-center gap-1 text-white text-sm font-black mb-3 hover:text-brand-300 transition-colors group"
      >
        {title}
        <FiChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
      <div className="space-y-3">
        {items.length === 0 && [...Array(2)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="aspect-[3/4] bg-dark-800 rounded-md animate-pulse" />
            <div className="h-3 bg-dark-800 rounded animate-pulse w-3/4" />
          </div>
        ))}
        {items.map(it => (
          <Link
            key={it.id}
            to={`/c/collection/${it.id}`}
            className="group block"
          >
            <div className="relative aspect-[3/4] bg-dark-800 rounded-md overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
              {it.cover_url ? (
                <img
                  src={it.cover_url}
                  alt={it.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-900/40 to-accent-900/40" />
              )}
              {variant === 'gif' && (
                <span className="absolute top-1.5 right-1.5 bg-black/80 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                  GIF
                </span>
              )}
              {it.is_paid && (
                <span className="absolute top-1.5 left-1.5 bg-brand-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                  PPV
                </span>
              )}
            </div>
            {/* Caption layout depende del variant */}
            {isAlbum ? (
              <div className="mt-1.5">
                <p className="text-orange-400 text-xs font-black uppercase tracking-tight truncate group-hover:text-orange-300 transition-colors">
                  {it.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-gray-500 text-[10px]">
                    {it.photo_count || 0} Fotos
                  </span>
                  {showRating && it.rating_pct != null && (
                    <span className="text-orange-400 text-[10px] font-bold">
                      {it.rating_pct}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-1.5">
                <p className="text-white text-xs font-semibold line-clamp-1 group-hover:text-brand-300 transition-colors">
                  {it.title}
                </p>
                <p className="text-gray-500 text-[10px] truncate">
                  {it.creator?.full_name || it.user?.full_name || ''}
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
