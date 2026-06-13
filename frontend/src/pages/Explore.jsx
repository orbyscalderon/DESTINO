import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArrowLeft, FiSearch, FiClock, FiEye, FiThumbsUp,
  FiTrendingUp, FiZap, FiStar, FiVideo, FiChevronRight, FiX, FiMoreVertical,
  FiBookmark, FiFlag, FiShare2, FiPlus,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import LazyImage from '../components/ui/LazyImage.jsx';

const SORT_TABS = [
  { id: 'trending', label: 'Trending',  icon: FiTrendingUp },
  { id: 'new',      label: 'Nuevos',    icon: FiZap },
  { id: 'top',      label: 'Top',       icon: FiStar },
  { id: 'views',    label: 'Más vistos', icon: FiEye },
];

const CATEGORY_LABELS = {
  body: 'Cuerpo', ethnicity: 'Etnia', scenario: 'Escenario',
  age: 'Edad', orientation: 'Orientación', fetish: 'Fetiche',
  quality: 'Calidad', other: 'Otros',
};

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

function VideoCard({ video, onBookmark, onReport, onShare }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ratingPct = video.rating_up + video.rating_down > 0
    ? Math.round((video.rating_up / (video.rating_up + video.rating_down)) * 100)
    : null;
  const placeholder = video.thumbnail_blur_url || video.thumbnail_tiny_url;

  return (
    <div
      className="group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
    >
      <Link to={`/explore/v/${video.id}`} className="block">
        <div className="relative aspect-video bg-dark-800 rounded-lg overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all duration-200">
          {hover && video.url ? (
            <video
              src={video.url}
              autoPlay muted playsInline loop
              className="w-full h-full object-cover"
            />
          ) : (
            <LazyImage
              src={video.thumbnail_url || video.url}
              placeholder={placeholder}
              alt={video.title}
              className="w-full h-full"
            />
          )}
          {/* Hover gradient overlay (lifts info chips) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

          {/* Duration — bottom right (PH-style) */}
          <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[11px] font-bold px-1.5 py-0.5 rounded leading-none">
            {fmtDuration(video.duration_seconds)}
          </span>

          {/* Rating — top right */}
          {ratingPct !== null && (
            <span className={`absolute top-2 right-2 backdrop-blur-md text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
              ratingPct >= 80 ? 'bg-green-600/85' : ratingPct >= 50 ? 'bg-black/70' : 'bg-red-600/85'
            }`}>
              <FiThumbsUp size={9} /> {ratingPct}%
            </span>
          )}

          {/* PPV badge — top left */}
          {video.is_paid && (
            <span className="absolute top-2 left-2 bg-gradient-to-br from-brand-500 to-brand-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-glow-sm">
              PPV
            </span>
          )}

          {/* HD badge — bottom left when applicable */}
          {video.is_hd && (
            <span className="absolute bottom-2 left-2 bg-white/15 backdrop-blur-md text-white text-[9px] font-black px-1.5 py-0.5 rounded">
              HD
            </span>
          )}
        </div>
      </Link>

      {/* Info row */}
      <div className="mt-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Link to={`/explore/v/${video.id}`}>
            <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-brand-300 transition-colors">
              {video.title}
            </p>
          </Link>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400 min-w-0">
            {video.user?.id ? (
              <Link
                to={`/profile/${video.user.id}`}
                className="hover:text-brand-300 truncate flex items-center gap-1 transition-colors"
              >
                {video.user.full_name}
                {video.user.is_verified && <VerifiedBadge size={11} />}
              </Link>
            ) : (
              <span className="truncate">{video.user?.full_name}</span>
            )}
            <span className="text-gray-600 shrink-0">·</span>
            <span className="text-gray-500 shrink-0 flex items-center gap-0.5">
              <FiEye size={9} /> {fmtViews(video.views_count)}
            </span>
          </div>
        </div>

        {/* 3-dot menu */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(o => !o); }}
            className="p-1 -m-1 text-gray-500 hover:text-white opacity-60 group-hover:opacity-100 transition-opacity"
            aria-label="Más opciones"
          >
            <FiMoreVertical size={14} />
          </button>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute right-0 top-full mt-1 z-30 bg-dark-800 border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-1 min-w-[150px]"
            >
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onBookmark?.(video); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/5"
              >
                <FiBookmark size={12} /> Guardar
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onShare?.(video); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/5"
              >
                <FiShare2 size={12} /> Compartir
              </button>
              <div className="border-t border-white/5 my-1" />
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onReport?.(video); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
              >
                <FiFlag size={12} /> Reportar
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// Props:
//   embedded — si true, NO renderiza AgeGate ni el sticky header (asume que
//   el contenedor padre los maneja, ej. AdultHub). Sirve para reutilizar la
//   misma lógica de grid/filtros tanto como página standalone como tab.
export default function Explore({ embedded = false }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort     = searchParams.get('sort') || 'trending';
  const tag      = searchParams.get('tag') || '';
  const category = searchParams.get('category') || '';
  const q        = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(q);

  const [videos, setVideos]     = useState([]);
  const [tags, setTags]         = useState([]);
  const [categories, setCategories] = useState({});
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [ageOk, setAgeOk]       = useState(isAgeVerified());

  const loadingRef = useRef(false);

  const load = useCallback(async (resetPage = true) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (resetPage) { setPage(0); setLoading(true); }
    try {
      const params = new URLSearchParams({ sort, page: resetPage ? '0' : String(page) });
      if (tag) params.set('tag', tag);
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      const { data } = await api.get(`/api/explore/videos?${params}`);
      setVideos(prev => resetPage ? (data.videos || []) : [...prev, ...(data.videos || [])]);
      setHasMore(data.has_more);
    } catch (err) {
      if (err.response?.status === 451) {
        toast.error('Contenido no disponible en tu región');
        navigate('/home');
      } else if (err.response?.status === 403) {
        if (err.response?.data?.code === 'AGE_VERIFICATION_REQUIRED') setAgeOk(false);
        else toast.error('No tienes acceso a esta sección');
      } else {
        toast.error('Error cargando videos');
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [sort, tag, category, q, page, navigate]);

  useEffect(() => {
    if (!ageOk) return;
    load(true);
  }, [sort, tag, category, q, ageOk]); // eslint-disable-line

  useEffect(() => {
    if (!ageOk) return;
    Promise.all([
      api.get('/api/explore/tags?limit=30').catch(() => ({ data: { tags: [] } })),
      api.get('/api/explore/categories').catch(() => ({ data: { categories: {} } })),
    ]).then(([t, c]) => {
      setTags(t.data?.tags || []);
      setCategories(c.data?.categories || {});
    });
  }, [ageOk]);

  const updateParam = (key, value) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    setSearchParams(p, { replace: true });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateParam('q', searchInput.trim());
  };

  const handleBookmark = async (video) => {
    try {
      await api.post(`/api/explore/videos/${video.id}/bookmark`);
      toast.success('Video guardado');
    } catch (err) {
      const msg = err.response?.data?.error;
      if (err.response?.status === 409) toast('Ya está en tus guardados', { icon: '✓' });
      else toast.error(msg || 'No se pudo guardar');
    }
  };

  const handleShare = async (video) => {
    const url = `${window.location.origin}/#/explore/v/${video.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: video.title, url }); }
      catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copiado');
      } catch { toast.error('No se pudo copiar'); }
    }
  };

  const handleReport = (video) => {
    navigate(`/explore/v/${video.id}?action=report`);
  };

  if (!ageOk && !embedded) {
    return <AgeGate onVerified={() => setAgeOk(true)} />;
  }

  return (
    <div className={embedded ? '' : 'min-h-screen pb-24'}>
      {/* Header — oculto en modo embedded (el padre lo provee) */}
      {!embedded && (
      <div className="sticky top-0 z-30 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        <div className="px-4 pt-4 pb-2 max-w-7xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white shrink-0">
            <FiArrowLeft size={20} />
          </button>
          <form onSubmit={handleSearch} className="relative flex-1">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-xl pl-9 pr-9 py-2 outline-none focus:border-brand-500/50"
              placeholder="Buscar videos..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {q && (
              <button type="button" onClick={() => { setSearchInput(''); updateParam('q', ''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <FiX size={14} />
              </button>
            )}
          </form>
          <Link to="/explore/playlists" className="text-xs text-brand-400 hover:text-brand-300 shrink-0 font-bold">
            Mis listas
          </Link>
        </div>

        {/* Sort tabs */}
        <div className="px-4 max-w-7xl mx-auto flex gap-1 overflow-x-auto pb-2">
          {SORT_TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => updateParam('sort', t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  sort === t.id ? 'bg-brand-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
                }`}
              >
                <Icon size={11} /> {t.label}
              </button>
            );
          })}
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="ml-2 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-dark-800 text-gray-400 hover:text-white whitespace-nowrap"
          >
            Categorías <FiChevronRight size={11} className={showSidebar ? 'rotate-90 transition' : 'transition'} />
          </button>
        </div>

        {/* Active filters */}
        {(tag || category) && (
          <div className="px-4 max-w-7xl mx-auto pb-2 flex items-center gap-1.5 flex-wrap">
            {tag && (
              <span className="bg-brand-500/20 text-brand-300 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                #{tag}
                <button onClick={() => updateParam('tag', '')}><FiX size={10} /></button>
              </span>
            )}
            {category && (
              <span className="bg-pink-500/20 text-pink-300 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                {category}
                <button onClick={() => updateParam('category', '')}><FiX size={10} /></button>
              </span>
            )}
          </div>
        )}
      </div>
      )}

      {/* Sidebar de categorías expandible */}
      {showSidebar && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="overflow-hidden border-b border-white/5 bg-dark-800/30"
        >
          <div className="px-4 py-3 max-w-7xl mx-auto space-y-3">
            {Object.entries(categories).map(([cat, ts]) => (
              <div key={cat}>
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1.5">{CATEGORY_LABELS[cat] || cat}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {ts.slice(0, 15).map(t => (
                    <button
                      key={t.id}
                      onClick={() => { updateParam('tag', t.slug); setShowSidebar(false); }}
                      className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                        tag === t.slug ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                      }`}
                    >
                      {t.name}
                      {t.videos_count > 0 && (
                        <span className="ml-1 text-gray-500 text-[9px]">{fmtViews(t.videos_count)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Top tags pill bar */}
      {!showSidebar && tags.length > 0 && (
        <div className="px-4 py-2 max-w-7xl mx-auto flex gap-1.5 overflow-x-auto">
          {tags.slice(0, 20).map(t => (
            <button
              key={t.id}
              onClick={() => updateParam('tag', t.slug)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                tag === t.slug ? 'bg-brand-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              #{t.slug}
            </button>
          ))}
        </div>
      )}

      {/* Grid de videos */}
      <div className="px-4 py-4 max-w-7xl mx-auto">
        {/* Section header — PH-style "Vídeos porno calientes" */}
        {videos.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-white font-black text-base sm:text-lg">
              {tag ? (
                <>Resultados <span className="text-brand-400">#{tag}</span></>
              ) : q ? (
                <>Resultados para "<span className="text-brand-400">{q}</span>"</>
              ) : sort === 'trending' ? (
                <>Trending ahora <span className="text-brand-400">🔥</span></>
              ) : sort === 'new' ? (
                <>Más nuevos <span className="text-brand-400">✨</span></>
              ) : sort === 'top' ? (
                <>Top rated <span className="text-yellow-400">⭐</span></>
              ) : (
                <>Más vistos <span className="text-brand-400">👁</span></>
              )}
            </h2>
            <span className="text-[11px] text-gray-500 font-medium">
              {videos.length} {hasMore && '+'} videos
            </span>
          </div>
        )}

        {loading && videos.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {[...Array(15)].map((_, i) => (
              <div key={i}>
                <div className="aspect-video bg-dark-800 rounded-lg animate-pulse" />
                <div className="h-3.5 bg-dark-800 rounded-full mt-2 w-4/5 animate-pulse" />
                <div className="h-3 bg-dark-800/60 rounded-full mt-1.5 w-2/3 animate-pulse" />
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            <FiVideo size={32} className="mx-auto mb-2 opacity-30" />
            Sin resultados. Prueba con otros filtros.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {videos.map(v => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onBookmark={handleBookmark}
                  onShare={handleShare}
                  onReport={handleReport}
                />
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={async () => {
                    const next = page + 1;
                    setPage(next);
                    loadingRef.current = false;
                    await load(false);
                  }}
                  disabled={loading}
                  className="btn-secondary px-8 py-2.5 disabled:opacity-50 font-bold"
                >
                  {loading ? 'Cargando…' : 'Cargar más videos'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
