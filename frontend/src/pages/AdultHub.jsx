import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHome, FiVideo, FiGrid, FiUsers, FiImage, FiRadio,
  FiCheck, FiTrendingUp, FiChevronRight, FiChevronDown,
  FiSearch, FiZap, FiMessageSquare, FiShuffle,
} from 'react-icons/fi';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import Explore from './Explore.jsx';
import AdultCreators from './AdultCreators.jsx';
import VideosMegamenu from '../components/ui/VideosMegamenu.jsx';
import CategoriasMegamenu from '../components/ui/CategoriasMegamenu.jsx';
import LivesMegamenu from '../components/ui/LivesMegamenu.jsx';
import CreatorsMegamenu from '../components/ui/CreatorsMegamenu.jsx';
import ComunidadMegamenu from '../components/ui/ComunidadMegamenu.jsx';
import FotosMegamenu from '../components/ui/FotosMegamenu.jsx';

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
  { id: 'videos',     label: 'Vídeos',     icon: FiVideo },
  { id: 'categorias', label: 'Categorías', icon: FiGrid },
  { id: 'lives',      label: 'Live Cams',  icon: FiRadio,    accent: true },
  { id: 'creators',   label: 'Estrellas',  icon: FiUsers },
  // FUCK NOW (PH parity) — sin dropdown, navega al tab "ahora" con random pick
  { id: 'ahora',      label: 'Fuck Now',   icon: FiZap,      hotAccent: true },
  { id: 'comunidad',  label: 'Comunidad',  icon: FiMessageSquare },
  { id: 'fotos',      label: 'Fotos y GIFs', icon: FiImage },
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

  // Megamenu hover state — tabs que muestran panel en hover
  const TABS_WITH_MEGAMENU = ['videos', 'categorias', 'lives', 'creators', 'comunidad', 'fotos'];
  const [openMega, setOpenMega] = useState(null);
  const megaCloseTimerRef = useRef(null);
  const openMegamenu = (id) => {
    if (megaCloseTimerRef.current) clearTimeout(megaCloseTimerRef.current);
    setOpenMega(id);
  };
  const scheduleCloseMegamenu = () => {
    if (megaCloseTimerRef.current) clearTimeout(megaCloseTimerRef.current);
    megaCloseTimerRef.current = setTimeout(() => setOpenMega(null), 180);
  };
  const cancelCloseMegamenu = () => {
    if (megaCloseTimerRef.current) clearTimeout(megaCloseTimerRef.current);
  };
  // Cleanup timer al desmontar
  useEffect(() => () => {
    if (megaCloseTimerRef.current) clearTimeout(megaCloseTimerRef.current);
  }, []);

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
      <div className="sticky top-0 z-30 bg-dark-900/95 backdrop-blur-md border-b border-white/5 relative">
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
            const hasMegamenu = TABS_WITH_MEGAMENU.includes(t.id);
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                aria-haspopup={hasMegamenu ? 'menu' : undefined}
                aria-expanded={hasMegamenu ? openMega === t.id : undefined}
                onClick={() => switchTab(t.id)}
                onMouseEnter={hasMegamenu ? () => openMegamenu(t.id) : undefined}
                onMouseLeave={hasMegamenu ? scheduleCloseMegamenu : undefined}
                onFocus={hasMegamenu ? () => openMegamenu(t.id) : undefined}
                className={`relative shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors ${
                  active ? 'text-white' : 'text-gray-500 hover:text-gray-200'
                } ${t.accent && !active ? 'text-red-400 hover:text-red-300' : ''} ${t.hotAccent ? 'text-orange-400 hover:text-orange-300' : ''}`}
              >
                <Icon size={13} className={t.accent ? 'text-red-500' : t.hotAccent ? 'text-orange-500' : ''} />
                {t.label}
                {t.accent && liveShows.length > 0 && (
                  <span className="bg-red-500 text-white text-[8px] font-black px-1 py-0.5 rounded leading-none">
                    {liveShows.length}
                  </span>
                )}
                {hasMegamenu && (
                  <FiChevronDown size={10} className="opacity-60 -ml-0.5" aria-hidden="true" />
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

        {/* Megamenu hover panel (solo desktop) — pegado al fondo del nav */}
        <AnimatePresence mode="wait">
          {openMega && (
            <motion.div
              key={`mega-${openMega}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              onMouseEnter={cancelCloseMegamenu}
              onMouseLeave={scheduleCloseMegamenu}
              className="hidden lg:block absolute left-0 right-0 top-full z-50"
            >
              {openMega === 'videos' && (
                <VideosMegamenu
                  trendingFromHub={trending}
                  onSelectSort={(sortId) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'videos');
                    p.set('sort', sortId);
                    setSearchParams(p, { replace: true });
                  }}
                  onSelectTag={(tag) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'videos');
                    p.set('tag', tag);
                    setSearchParams(p, { replace: true });
                  }}
                  onClose={() => setOpenMega(null)}
                />
              )}
              {openMega === 'categorias' && (
                <CategoriasMegamenu
                  trendingFromHub={trending}
                  onSelectTag={(tag) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'videos');
                    if (tag) p.set('tag', tag); else p.delete('tag');
                    setSearchParams(p, { replace: true });
                  }}
                  onSelectFilter={({ kind, value }) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'videos');
                    // orientation/language → mapeo a query param dedicado
                    p.set(kind, value);
                    setSearchParams(p, { replace: true });
                  }}
                  onClose={() => setOpenMega(null)}
                />
              )}
              {openMega === 'lives' && (
                <LivesMegamenu
                  liveShows={liveShows}
                  userCountry={profile?.country}
                  onSelectCategory={({ kind, value }) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'lives');
                    p.set(kind, value);
                    setSearchParams(p, { replace: true });
                  }}
                  onClose={() => setOpenMega(null)}
                />
              )}
              {openMega === 'creators' && (
                <CreatorsMegamenu
                  trendingFromHub={trending}
                  onSelectFilter={({ kind, value }) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'creators');
                    p.set(kind, value);
                    setSearchParams(p, { replace: true });
                  }}
                  onClose={() => setOpenMega(null)}
                />
              )}
              {openMega === 'comunidad' && (
                <ComunidadMegamenu
                  trendingFromHub={trending}
                  onClose={() => setOpenMega(null)}
                />
              )}
              {openMega === 'fotos' && (
                <FotosMegamenu
                  trendingFromHub={trending}
                  onSelectFilter={({ kind, value }) => {
                    const p = new URLSearchParams(searchParams);
                    p.set('tab', 'fotos');
                    p.set(kind, value);
                    setSearchParams(p, { replace: true });
                  }}
                  onClose={() => setOpenMega(null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
        {tab === 'ahora' && <AhoraTab liveShows={liveShows} onSwitchTab={switchTab} profile={profile} />}
        {tab === 'comunidad' && <ComunidadTab onSwitchTab={switchTab} />}
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
    creators:   'Estrellas verificadas',
    ahora:      'Fuck Now — match instantáneo',
    comunidad:  'Comunidad +18',
    fotos:      'Fotos y GIFs',
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

/* ── Fuck Now: pick aleatorio de live shows con botón "siguiente" ── */
/* ── Fuck Now: directorio classified-ads de adult creators verificados ──
 *
 * Inspirado en Skokka / Photoprepagos: grid denso con énfasis en ubicación
 * y disponibilidad. Reusa /api/creator/discover con flag adult.
 * Importante: TODO el contacto pasa por chat interno (/chat/), no expone
 * teléfono/WhatsApp. Solo creators con is_adult_creator+age_verified_at.
 */
function AhoraTab({ liveShows, onSwitchTab, profile }) {
  const userCountry = profile?.country || 'do';
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(99);

  // Ciudades por país — RD primero ya que es donde está la mayoría del user base
  const CITIES_BY_COUNTRY = {
    do: ['Santo Domingo', 'Santiago', 'Punta Cana', 'La Romana', 'Puerto Plata', 'San Pedro de Macorís', 'San Cristóbal', 'Bávaro'],
    mx: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Cancún', 'Tijuana', 'Puebla'],
    ar: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata'],
    co: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'],
    es: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga'],
    ve: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto'],
  };
  const cityOptions = CITIES_BY_COUNTRY[userCountry?.toLowerCase()] || CITIES_BY_COUNTRY.do;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      sort: 'recent',
      adult: '1',
      limit: '60',
    });
    if (genderFilter !== 'all') params.set('gender', genderFilter);
    if (onlineOnly) params.set('online', 'true');
    if (city !== 'all') params.set('city', city);
    if (userCountry) params.set('country', userCountry);
    api.get(`/api/creator/discover?${params}`)
      .then(({ data }) => setCreators(data.creators || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [genderFilter, onlineOnly, city, userCountry]);

  const filtered = creators.filter(c => {
    if (c.age && (c.age < minAge || c.age > maxAge)) return false;
    return true;
  });

  // Pick aleatorio — botón "Sorpréndeme"
  const surpriseMe = () => {
    if (filtered.length === 0) return;
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    window.location.hash = `#/profile/${pick.id}`;
  };

  return (
    <div className="px-4 py-4 max-w-7xl mx-auto">
      {/* Banner aclaratorio */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4 flex items-start gap-3">
        <span className="text-xl">🔥</span>
        <div className="flex-1 text-xs text-gray-300 leading-relaxed">
          <p className="text-orange-400 font-bold mb-0.5">Directorio Fuck Now</p>
          <p>
            Creators adultos verificados disponibles. Todo el contacto pasa por chat de la
            plataforma — sin números externos. Encuentros físicos no se gestionan en-app.
          </p>
        </div>
      </div>

      {/* Filtros: ciudad + género + edad + online */}
      <div className="bg-dark-800/60 border border-white/5 rounded-2xl p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase font-bold tracking-wide shrink-0">
            <FiZap size={11} className="text-orange-500" /> Ciudad
          </label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="bg-dark-900 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 outline-none focus:border-orange-500/50"
          >
            <option value="all">Todas las ciudades</option>
            {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setOnlineOnly(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border ${
                onlineOnly
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-dark-900 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${onlineOnly ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`} />
              En línea
            </button>
            <button
              onClick={surpriseMe}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              <FiShuffle size={11} /> Sorpréndeme
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wide shrink-0">Género</span>
          {[
            { id: 'all',    label: 'Todos'   },
            { id: 'female', label: 'Chicas'  },
            { id: 'male',   label: 'Chicos'  },
            { id: 'couple', label: 'Parejas' },
            { id: 'trans',  label: 'Trans'   },
          ].map(g => (
            <button
              key={g.id}
              onClick={() => setGenderFilter(g.id)}
              className={`text-[11px] font-bold px-3 py-1 rounded-full transition-colors ${
                genderFilter === g.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-dark-900 text-gray-400 hover:text-white border border-white/5'
              }`}
            >
              {g.label}
            </button>
          ))}

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Edad</span>
            <input
              type="number" min="18" max="99"
              value={minAge}
              onChange={(e) => setMinAge(Math.max(18, parseInt(e.target.value) || 18))}
              className="w-12 bg-dark-900 border border-white/10 text-white text-xs rounded-md px-1.5 py-0.5 outline-none focus:border-orange-500/50 text-center"
            />
            <span className="text-gray-500 text-xs">—</span>
            <input
              type="number" min="18" max="99"
              value={maxAge}
              onChange={(e) => setMaxAge(Math.min(99, parseInt(e.target.value) || 99))}
              className="w-12 bg-dark-900 border border-white/10 text-white text-xs rounded-md px-1.5 py-0.5 outline-none focus:border-orange-500/50 text-center"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">
          {loading ? 'Cargando…' : (
            <>
              <span className="text-orange-400 font-bold">{filtered.length}</span> creators disponibles
              {city !== 'all' && <> · {city}</>}
              {onlineOnly && <> · En línea</>}
            </>
          )}
        </p>
        {liveShows.length > 0 && (
          <button
            onClick={() => onSwitchTab('lives')}
            className="text-xs text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveShows.length} en vivo ahora →
          </button>
        )}
      </div>

      {/* Grid classified-ads */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {[...Array(18)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-white font-bold">No hay creators con estos filtros</p>
          <p className="text-gray-500 text-sm mt-1">Probá quitando ciudad o género.</p>
          <button
            onClick={() => { setCity('all'); setGenderFilter('all'); setOnlineOnly(false); setMinAge(18); setMaxAge(99); }}
            className="mt-5 bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map(c => <FuckNowCard key={c.id} creator={c} />)}
        </div>
      )}
    </div>
  );
}

function FuckNowCard({ creator }) {
  const isOnline = creator.last_active && (Date.now() - new Date(creator.last_active).getTime() < 5 * 60 * 1000);
  const isLive = !!creator.is_live;
  const services = [];
  if (creator.has_video_calls)    services.push('Video');
  if (creator.has_custom_content) services.push('Custom');
  if (creator.has_subscription)   services.push('Sub');
  if (creator.has_ppv)            services.push('PPV');

  return (
    <Link
      to={`/profile/${creator.id}`}
      className="group block relative aspect-[3/4] rounded-xl overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-orange-500/50 transition-all"
    >
      {creator.avatar_url ? (
        <img
          src={creator.avatar_url}
          alt={creator.full_name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/40 to-rose-900/40 flex items-center justify-center text-3xl">
          🔥
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
        <div className="flex items-center gap-1">
          {isLive && (
            <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
            </span>
          )}
          {!isLive && isOnline && (
            <span className="flex items-center gap-1 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              <span className="w-1.5 h-1.5 bg-white rounded-full" /> Online
            </span>
          )}
        </div>
        {creator.is_verified && (
          <span className="bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-dark-900" aria-label="Verificado">
            <FiCheck size={9} className="text-white" strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <p className="text-white font-black text-sm truncate">{creator.full_name}</p>
          {creator.age && <span className="text-orange-300 text-xs font-bold">· {creator.age}</span>}
        </div>
        {(creator.city || creator.country) && (
          <p className="text-gray-300 text-[10px] flex items-center gap-1 truncate">
            <span className="text-orange-400">📍</span>
            {creator.city || creator.country}
          </p>
        )}
        {services.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {services.slice(0, 3).map(s => (
              <span key={s} className="text-[8px] font-bold bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── Comunidad: reels recientes + posts (placeholder funcional) ── */
function ComunidadTab({ onSwitchTab }) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/reels/feed?limit=12&adult=1')
      .then(({ data }) => setReels(data.reels || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-4 space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-white">Reels +18 más recientes</h2>
          <Link to="/reels?adult=1" className="text-xs text-brand-400 hover:text-brand-300 font-bold">
            Ver todos →
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <div key={i} className="aspect-[9/16] bg-dark-800 rounded-lg animate-pulse" />)}
          </div>
        ) : reels.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-12">No hay reels todavía. Volvé pronto.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {reels.map(r => (
              <Link key={r.id} to={`/reels?id=${r.id}`} className="group block relative aspect-[9/16] rounded-lg overflow-hidden bg-dark-800 ring-1 ring-white/5 hover:ring-brand-500/40 transition-all">
                {r.thumbnail_url && (
                  <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-white text-xs font-bold truncate">{r.user?.full_name || ''}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
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
