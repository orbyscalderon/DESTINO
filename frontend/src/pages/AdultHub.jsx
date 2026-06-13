import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHome, FiVideo, FiGrid, FiUsers, FiImage, FiRadio,
  FiCheck, FiTrendingUp, FiChevronRight, FiSearch,
} from 'react-icons/fi';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import Explore from './Explore.jsx';
import AdultCreators from './AdultCreators.jsx';

// AdultHub — punto único de entrada al +18.
// Estructura:
//   1) AgeGate (una sola vez para toda la sección)
//   2) VIP gate (una sola vez)
//   3) Hero search bar + trending pills (PH-style)
//   4) Tab nav con red-underline indicator (INICIO / VIDEOS / CATEGORÍAS / LIVE / CREATORS / FOTOS)
//   5) LIVE strip permanente (cuando NO estás en el tab Lives)
//   6) Contenido del tab activo
//
// URL state:
//   ?tab=inicio|videos|categorias|lives|creators|fotos (default: inicio)
//   filtros de cada tab se mantienen vía search params del propio tab
//
// Backwards compat: /explore y /adult ambos rendean AdultHub.

const TABS = [
  { id: 'inicio',     label: 'Inicio',     icon: FiHome },
  { id: 'videos',     label: 'Videos',     icon: FiVideo },
  { id: 'categorias', label: 'Categorías', icon: FiGrid },
  { id: 'lives',      label: 'Lives',      icon: FiRadio, accent: true },
  { id: 'creators',   label: 'Creators',   icon: FiUsers },
  { id: 'fotos',      label: 'Fotos',      icon: FiImage },
];

// Trending pills — mezcla creator names + búsquedas comunes.
// TODO: idealmente viene del backend /api/explore/trending pero hardcoded
// como fallback para que la sección se sienta viva desde día 1.
const TRENDING_PILLS_FALLBACK = [
  'amateur latino', 'parejas reales', 'castellano', 'colombianas',
  'milf', 'pov sub', 'lésbico', 'cosplay', 'roleplay', 'español',
  'argentina', 'venezolanas', 'tatuadas',
];

export default function AdultHub() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const isVip = profile?.premium_tier === 'vip' || profile?.is_adult_creator;
  const [ageOk, setAgeOk] = useState(isAgeVerified());
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'inicio';

  const [liveShows, setLiveShows] = useState([]);
  const [trending, setTrending] = useState(TRENDING_PILLS_FALLBACK);
  const [searchInput, setSearchInput] = useState('');

  // Cargar live shows (polling cada 60s para que se sienta vivo)
  useEffect(() => {
    if (!ageOk || !isVip) return;
    const load = () => {
      api.get('/api/shows?category=adult&status=live')
        .then(({ data }) => setLiveShows(data.shows || []))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [ageOk, isVip]);

  // Cargar trending tags reales (si el endpoint existe; sino mantiene fallback)
  useEffect(() => {
    if (!ageOk || !isVip) return;
    api.get('/api/explore/tags?limit=20').then(({ data }) => {
      const real = (data.tags || []).map(t => t.slug || t.name).filter(Boolean);
      if (real.length > 5) setTrending(real);
    }).catch(() => {});
  }, [ageOk, isVip]);

  const switchTab = (id) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', id);
    // Limpiar filtros específicos del tab anterior para no contaminar
    ['sort', 'category', 'q'].forEach(k => p.delete(k));
    setSearchParams(p, { replace: true });
  };

  const goSearch = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    const p = new URLSearchParams(searchParams);
    p.set('tab', 'videos');
    p.set('q', q);
    setSearchParams(p, { replace: true });
  };

  // VIP-gate fuera de la sección
  if (!isVip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="text-5xl">👑</div>
        <h2 className="text-2xl font-black text-white">Sección VIP</h2>
        <p className="text-gray-400 text-sm max-w-xs">
          El acceso al hub adulto está disponible exclusivamente para el Plan VIP.
        </p>
        <button
          onClick={() => navigate('/premium')}
          className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl px-8 py-3 transition-colors"
        >
          Ver Plan VIP
        </button>
      </div>
    );
  }

  // Age-gate (una sola vez en todo el hub)
  if (!ageOk) return <AgeGate onVerified={() => setAgeOk(true)} />;

  const showLiveStrip = tab !== 'lives' && liveShows.length > 0;

  return (
    <div className="min-h-screen pb-24 bg-dark-900">
      {/* ── Top: search hero + tab nav (sticky) ──────────────────── */}
      <div className="sticky top-0 z-30 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        {/* Hero search (PH-style: barra ancha visible siempre) */}
        <div className="px-4 pt-4 pb-3 max-w-7xl mx-auto">
          <form onSubmit={goSearch} className="relative max-w-2xl">
            <FiSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar videos, creators, tags…"
              className="w-full bg-dark-800 border border-white/10 text-white text-sm rounded-2xl pl-11 pr-24 py-3 outline-none focus:border-brand-500/50 focus:bg-dark-700 transition-colors"
              aria-label="Buscar en sección adulta"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>

        {/* Tab nav PH-style (red underline indicator) */}
        <nav
          role="tablist"
          aria-label="Secciones adultas"
          className="px-4 max-w-7xl mx-auto flex gap-1 sm:gap-3 overflow-x-auto scrollbar-none"
        >
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.id)}
                className={`relative shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors ${
                  active ? 'text-white' : 'text-gray-500 hover:text-gray-200'
                } ${t.accent && !active ? 'text-red-400 hover:text-red-300' : ''}`}
              >
                <Icon size={13} className={t.accent ? 'text-red-500' : ''} />
                {t.label}
                {t.accent && liveShows.length > 0 && (
                  <span className="bg-red-500 text-white text-[8px] font-black px-1 py-0.5 rounded leading-none">
                    {liveShows.length}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="adult-tab-indicator"
                    className="absolute left-0 right-0 bottom-0 h-[3px] bg-brand-500 rounded-t-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── LIVE strip permanente (cuando no estás en Lives) ──── */}
      <AnimatePresence>
        {showLiveStrip && (
          <motion.section
            key="live-strip"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            aria-label="Shows en vivo ahora"
          >
            <div className="px-4 pt-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  En Vivo Ahora
                  <span className="text-gray-500 font-normal normal-case lowercase">· {liveShows.length} shows</span>
                </h2>
                <button
                  onClick={() => switchTab('lives')}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-bold flex items-center gap-0.5"
                >
                  Ver todos <FiChevronRight size={12} />
                </button>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
                {liveShows.slice(0, 12).map(s => (
                  <LiveStripCard key={s.id} show={s} />
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Section title + trending tag pills ─────────────────── */}
      <div className="px-4 pt-4 max-w-7xl mx-auto">
        <SectionTitle tab={tab} />
        <TrendingPills
          pills={trending}
          onPick={(p) => {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'videos');
            next.set('tag', p);
            setSearchParams(next, { replace: true });
          }}
        />
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto">
        {tab === 'inicio' && <InicioTab liveShows={liveShows} onSwitchTab={switchTab} />}
        {tab === 'videos' && <Explore embedded />}
        {tab === 'categorias' && <CategoriasTab onPickTag={(slug) => {
          const p = new URLSearchParams(searchParams);
          p.set('tab', 'videos'); p.set('tag', slug);
          setSearchParams(p, { replace: true });
        }} />}
        {tab === 'lives' && <LivesTab liveShows={liveShows} />}
        {tab === 'creators' && <AdultCreators embedded />}
        {tab === 'fotos' && <FotosTab />}
      </div>
    </div>
  );
}

/* ─────────────────────── Sub-componentes ─────────────────────── */

function SectionTitle({ tab }) {
  const titles = {
    inicio:     'Destacados +18',
    videos:     'Videos porno calientes',
    categorias: 'Explora por categoría',
    lives:      'Shows en vivo ahora',
    creators:   'Creators verificados',
    fotos:      'Galerías y colecciones',
  };
  return (
    <h1 className="flex items-center gap-2 text-lg sm:text-xl font-black text-white mb-3">
      {titles[tab] || 'Adult'}
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500" aria-label="Verificado">
        <FiCheck size={11} className="text-white" strokeWidth={3} />
      </span>
    </h1>
  );
}

function TrendingPills({ pills, onPick }) {
  if (!pills?.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4" aria-label="Búsquedas trending">
      {pills.map((p, i) => (
        <button
          key={`${p}-${i}`}
          onClick={() => onPick(p)}
          className="shrink-0 bg-dark-800 hover:bg-brand-500/20 hover:border-brand-500/30 border border-white/5 text-gray-300 hover:text-brand-300 text-xs font-medium px-4 py-2 rounded-full transition-colors whitespace-nowrap"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function LiveStripCard({ show }) {
  return (
    <Link
      to={`/shows/${show.id}`}
      className="shrink-0 w-40 sm:w-48 group"
    >
      <div className="relative aspect-video bg-dark-800 rounded-xl overflow-hidden ring-1 ring-red-500/30 group-hover:ring-red-500/60 transition-all">
        {show.cover_url ? (
          <img
            src={show.cover_url}
            alt={show.title || 'Show en vivo'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-900/50 to-pink-900/30 flex items-center justify-center">
            <span className="text-3xl opacity-50">🔞</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> EN VIVO
          </span>
        </div>
        {show.viewer_count > 0 && (
          <div className="absolute top-1.5 right-1.5">
            <span className="bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              👁 {show.viewer_count}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
          <p className="text-white text-xs font-bold truncate">{show.title || 'Show en vivo'}</p>
          {show.host?.full_name && (
            <p className="text-gray-300 text-[10px] truncate">{show.host.full_name}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Tabs ── */

function InicioTab({ liveShows, onSwitchTab }) {
  const [featured, setFeatured] = useState([]);
  const [newCreators, setNewCreators] = useState([]);

  useEffect(() => {
    api.get('/api/explore/videos?sort=trending&limit=8')
      .then(({ data }) => setFeatured(data.videos || []))
      .catch(() => {});
    api.get('/api/creator/discover?sort=new&limit=6')
      .then(({ data }) => setNewCreators((data.creators || []).slice(0, 6)))
      .catch(() => {});
  }, []);

  return (
    <div className="px-4 py-4 space-y-8">
      {/* Trending videos preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white">
            <FiTrendingUp size={14} className="text-brand-400" /> Trending ahora
          </h2>
          <button onClick={() => onSwitchTab('videos')} className="text-xs text-brand-400 hover:text-brand-300 font-bold">
            Ver más →
          </button>
        </div>
        {featured.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-video bg-dark-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {featured.slice(0, 8).map(v => (
              <Link key={v.id} to={`/explore/v/${v.id}`} className="group block">
                <div className="relative aspect-video bg-dark-800 rounded-lg overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
                  <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                  <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {fmtDuration(v.duration_seconds)}
                  </span>
                </div>
                <p className="text-white text-xs font-semibold mt-1.5 line-clamp-2 group-hover:text-brand-300">{v.title}</p>
                <p className="text-gray-500 text-[10px] mt-0.5 truncate">{v.user?.full_name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Nuevos creators */}
      {newCreators.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-white">Nuevos creators</h2>
            <button onClick={() => onSwitchTab('creators')} className="text-xs text-brand-400 hover:text-brand-300 font-bold">
              Ver todos →
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {newCreators.map(c => (
              <Link key={c.id} to={`/profile/${c.id}`} className="group block text-center">
                <div className="aspect-square rounded-full overflow-hidden bg-dark-800 ring-2 ring-white/5 group-hover:ring-brand-500/50 transition-all mb-2">
                  <img
                    src={c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || 'C')}&size=200&background=1a1a2e&color=f43f5e`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p className="text-white text-xs font-semibold truncate group-hover:text-brand-300">{c.full_name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LivesTab({ liveShows }) {
  if (liveShows.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-3 animate-float inline-block">🎭</div>
        <p className="text-white font-bold">No hay shows en vivo ahora</p>
        <p className="text-gray-500 text-sm mt-1">Volvé en un rato — los creadores suben en cualquier momento.</p>
      </div>
    );
  }
  return (
    <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {liveShows.map(s => <LiveStripCard key={s.id} show={s} />)}
    </div>
  );
}

function CategoriasTab({ onPickTag }) {
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/explore/categories')
      .then(({ data }) => setCategories(data.categories || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const LABEL = {
    body: 'Cuerpo', ethnicity: 'Etnia', scenario: 'Escenario',
    age: 'Edad', orientation: 'Orientación', fetish: 'Fetiche',
    quality: 'Calidad', other: 'Otros',
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (Object.keys(categories).length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-3">🗂️</div>
        <p className="text-gray-500 text-sm">Sin categorías cargadas todavía.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-6">
      {Object.entries(categories).map(([cat, tags]) => (
        <section key={cat}>
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">{LABEL[cat] || cat}</h3>
          <div className="flex gap-2 flex-wrap">
            {tags.map(t => (
              <button
                key={t.id}
                onClick={() => onPickTag(t.slug)}
                className="bg-dark-800 hover:bg-brand-500/20 hover:border-brand-500/30 border border-white/5 text-gray-200 hover:text-brand-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              >
                {t.name}
                {t.videos_count > 0 && (
                  <span className="text-gray-500 ml-1.5 text-[10px]">{fmtViews(t.videos_count)}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FotosTab() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/photo-collections/public?limit=24')
      .then(({ data }) => setCollections(data.collections || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (collections.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-3 animate-float inline-block">📸</div>
        <p className="text-white font-bold">Aún no hay colecciones públicas</p>
        <p className="text-gray-500 text-sm mt-1">Los creators las publicarán pronto.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {collections.map(col => (
        <Link key={col.id} to={`/photos/${col.id}`} className="group block">
          <div className="relative aspect-[3/4] bg-dark-800 rounded-xl overflow-hidden ring-1 ring-white/5 group-hover:ring-brand-500/40 transition-all">
            <img
              src={col.cover_url}
              alt={col.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
              <p className="text-white text-xs font-bold truncate">{col.title}</p>
              <p className="text-gray-300 text-[10px] truncate">{col.photo_count || 0} fotos</p>
            </div>
            {col.is_paid && (
              <span className="absolute top-2 right-2 bg-brand-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                PPV
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── Utils ─── */
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
