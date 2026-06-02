import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUsers, FiStar, FiGlobe, FiWifi, FiX, FiSliders, FiChevronRight } from 'react-icons/fi';
import api from '../lib/api.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import { useAuthStore } from '../store/authStore.js';
import FlagImg from '../components/ui/FlagImg.jsx';
import { COUNTRIES } from '../lib/geodata.js';

const GENDER_TABS = [
  { id: '',       label: 'Todas'    },
  { id: 'female', label: 'Chicas'   },
  { id: 'male',   label: 'Chicos'   },
  { id: 'other',  label: 'Trans / NB'},
];

const SORT_OPTIONS = [
  { id: 'new',     label: 'Nuevas'    },
  { id: 'popular', label: 'Populares' },
];

const GROUP_LABELS = {
  style:     'Estilo',
  body:      'Tipo de cuerpo',
  ethnicity: 'Etnia',
  age:       'Edad',
  kink:      'Kink / Nicho',
};

const GROUP_ORDER = ['style', 'body', 'ethnicity', 'age', 'kink'];

function isOnline(lastActive) {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000;
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> En Vivo
    </span>
  );
}

function OnlineBadge() {
  return (
    <span className="flex items-center gap-1 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Online
    </span>
  );
}

function CreatorCard({ c, onClick, large = false }) {
  const online = isOnline(c.last_active);
  const countryName = c.country
    ? (COUNTRIES.find(co => co.value === c.country || co.label === c.country)?.label || c.country)
    : null;

  const thumb = c.is_live && c.live_show?.cover_url
    ? c.live_show.cover_url
    : (c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || 'C')}&size=400&background=1a1a2e&color=f43f5e`);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden bg-dark-700 group w-full ${large ? 'aspect-[4/5]' : 'aspect-[3/4]'}`}
    >
      <img
        src={thumb}
        alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
      />

      {/* Dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
        <div>
          {c.is_live ? <LiveBadge /> : online ? <OnlineBadge /> : <span />}
        </div>
        <div className="flex flex-col items-end gap-1">
          {c.is_verified && <VerifiedBadge size={14} />}
          {countryName && <FlagImg country={c.country} size={16} className="rounded-sm" />}
        </div>
      </div>

      {/* Live show title overlay */}
      {c.is_live && c.live_show?.title && (
        <div className="absolute top-8 left-2 right-2">
          <p className="text-white text-[9px] bg-black/60 rounded px-1.5 py-0.5 truncate">
            {c.live_show.title}
          </p>
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5">
        <p className="text-white font-semibold text-xs truncate leading-tight">{c.full_name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-gray-400 text-[9px] flex items-center gap-0.5">
            <FiUsers size={8} /> {c.subscribers_count || 0}
          </span>
          {c.creator_subscription_price ? (
            <span className="bg-brand-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <FiStar size={7} /> ${parseFloat(c.creator_subscription_price).toFixed(0)}/mes
            </span>
          ) : (
            <span className="bg-green-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              Gratis
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function SectionHeader({ title, count, color = 'text-gray-400', dot, onSeeAll }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${color}`}>
        {dot && <span className={`w-2 h-2 rounded-full animate-pulse ${dot}`} />}
        {title}
        {count > 0 && <span className="font-normal opacity-60">· {count}</span>}
      </h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-brand-400 text-[10px] flex items-center gap-0.5 hover:text-brand-300">
          Ver todo <FiChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

function ShowCard({ show }) {
  return (
    <Link to={`/shows/${show.id}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative aspect-[4/5] rounded-xl overflow-hidden bg-dark-700 group"
      >
        {show.cover_url
          ? <img src={show.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          : <div className="w-full h-full bg-gradient-to-br from-red-900/40 to-pink-900/30 flex items-center justify-center"><span className="text-4xl opacity-40">🔞</span></div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
        <div className="absolute top-2 left-2">
          <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> EN VIVO
          </span>
        </div>
        {show.viewer_count > 0 && (
          <div className="absolute top-2 right-2">
            <span className="bg-black/60 text-gray-300 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <FiUsers size={7} /> {show.viewer_count}
            </span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5">
          <p className="text-white font-semibold text-xs truncate">{show.title || 'Show en vivo'}</p>
          {show.host?.full_name && (
            <p className="text-gray-400 text-[9px] truncate mt-0.5">{show.host.full_name}</p>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default function AdultCreators() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const isVip = profile?.premium_tier === 'vip' || profile?.is_adult_creator;
  const [verified, setVerified] = useState(isAgeVerified);
  const [liveShows, setLiveShows] = useState([]);
  const [creators, setCreators]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [query, setQuery]         = useState('');
  const [gender, setGender]       = useState('');
  const [country, setCountry]     = useState('');
  const [sort, setSort]           = useState('new');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [liveOnly, setLiveOnly]   = useState(false);
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryGroups, setCategoryGroups] = useState({});  // { group: [{slug, name, emoji}] }
  const [selectedCategories, setSelectedCategories] = useState(new Set()); // set de slugs
  const debounceRef = useRef(null);

  // Cargar catálogo de categorías una vez
  useEffect(() => {
    if (!verified) return;
    api.get('/api/adult-categories')
      .then(({ data }) => setCategoryGroups(data.groups || {}))
      .catch(() => {});
  }, [verified]);

  const load = useCallback(async (opts = {}, append = false) => {
    setLoading(true);
    const { q = query, g = gender, c = country, s = sort, o = onlineOnly, p = 0, cats = selectedCategories } = opts;
    try {
      const params = new URLSearchParams({ q, page: p, sort: s });
      if (g)  params.set('gender', g);
      if (c)  params.set('country', c);
      if (o)  params.set('online', 'true');
      if (cats && cats.size > 0) {
        params.set('categories', Array.from(cats).join(','));
      }
      const { data } = await api.get(`/api/creator/discover?${params}`);
      setCreators(prev => append ? [...prev, ...(data.creators || [])] : (data.creators || []));
      setHasMore(data.hasMore || false);
    } catch {
      if (!append) toast.error('Error al cargar creadores');
    } finally {
      setLoading(false);
    }
  }, [query, gender, country, sort, onlineOnly, selectedCategories]);

  useEffect(() => {
    if (!verified) return;
    load({ q: '', g: gender, c: country, s: sort, o: onlineOnly, p: 0, cats: selectedCategories });
    api.get('/api/shows?category=adult&status=live')
      .then(({ data }) => setLiveShows(data.shows || []))
      .catch(() => {});
  }, [verified, gender, sort, onlineOnly, country, selectedCategories]);

  const toggleCategory = (slug) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setPage(0);
  };

  const clearAllCategories = () => {
    setSelectedCategories(new Set());
    setPage(0);
  };

  const handleSearch = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      load({ q: val, g: gender, c: country, s: sort, o: onlineOnly, p: 0 });
    }, 400);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load({ p: next }, true);
  };

  const activeFilters = (country ? 1 : 0) + (onlineOnly ? 1 : 0) + (liveOnly ? 1 : 0);

  // Derived sections
  const liveCreators    = creators.filter(c => c.is_live);
  const onlineCreators  = creators.filter(c => !c.is_live && isOnline(c.last_active));
  const allCreators     = liveOnly
    ? liveCreators
    : onlineOnly
      ? creators.filter(c => c.is_live || isOnline(c.last_active))
      : creators;

  if (!isVip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="text-5xl">👑</div>
        <h2 className="text-2xl font-black text-white">Sección VIP</h2>
        <p className="text-gray-400 text-sm max-w-xs">
          El acceso a creadores adultos está disponible exclusivamente para el Plan VIP.
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

  if (!verified) return <AgeGate onVerified={() => setVerified(true)} />;

  const isFiltered = query || gender || country || onlineOnly || liveOnly;

  return (
    <div className="min-h-screen pb-24 bg-dark-900">
      {/* ── Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        {/* Search + filter toggle */}
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <div className="flex-1 relative">
            <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar creadores..."
              className="input-field pl-9 py-2 text-sm w-full"
            />
            {query && (
              <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiX size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              showFilters || activeFilters > 0 ? 'bg-brand-500/20 border border-brand-500/40 text-brand-400' : 'bg-dark-700 text-gray-400'
            }`}
          >
            <FiSliders size={15} />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Gender tabs */}
        <div className="flex gap-1 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {GENDER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setGender(tab.id); setPage(0); }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                gender === tab.id ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Expandable filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5"
            >
              <div className="px-4 py-3 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {/* Live only */}
                  <button
                    onClick={() => { setLiveOnly(v => !v); setOnlineOnly(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      liveOnly ? 'bg-red-600/20 border border-red-500/40 text-red-400' : 'bg-dark-700 text-gray-400'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> En Vivo
                  </button>

                  {/* Online only */}
                  <button
                    onClick={() => { setOnlineOnly(v => !v); setLiveOnly(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      onlineOnly ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-dark-700 text-gray-400'
                    }`}
                  >
                    <FiWifi size={11} /> En línea
                  </button>

                  {/* Sort */}
                  {SORT_OPTIONS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSort(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        sort === s.id ? 'bg-brand-500/20 border border-brand-500/40 text-brand-400' : 'bg-dark-700 text-gray-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Country */}
                <div className="flex items-center gap-2">
                  <FiGlobe size={13} className="text-gray-500 shrink-0" />
                  <select
                    value={country}
                    onChange={e => { setCountry(e.target.value); setPage(0); }}
                    className="flex-1 bg-dark-700 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                  >
                    <option value="">Todos los países</option>
                    {COUNTRIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  {country && (
                    <button onClick={() => setCountry('')} className="text-gray-500 hover:text-white">
                      <FiX size={14} />
                    </button>
                  )}
                </div>

                {/* Categorías agrupadas */}
                {Object.keys(categoryGroups).length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-white/5 mt-2">
                    {GROUP_ORDER.filter(g => categoryGroups[g]?.length).map(group => (
                      <div key={group}>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
                          {GROUP_LABELS[group] || group}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {categoryGroups[group].map(cat => {
                            const active = selectedCategories.has(cat.slug);
                            return (
                              <button
                                key={cat.slug}
                                onClick={() => toggleCategory(cat.slug)}
                                className={`text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors ${
                                  active
                                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                                    : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                                }`}
                              >
                                {cat.emoji && <span>{cat.emoji}</span>}
                                {cat.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chips de filtros activos (visibles aunque el panel esté cerrado) */}
        {selectedCategories.size > 0 && (
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={clearAllCategories}
              className="text-[10px] text-gray-400 hover:text-white shrink-0 px-1.5"
              aria-label="Limpiar filtros"
            >
              <FiX size={12} />
            </button>
            {Array.from(selectedCategories).map(slug => {
              // Encontrar el cat object para el emoji + name
              const cat = Object.values(categoryGroups).flat().find(c => c.slug === slug);
              if (!cat) return null;
              return (
                <button
                  key={slug}
                  onClick={() => toggleCategory(slug)}
                  className="bg-brand-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0"
                >
                  {cat.emoji && <span>{cat.emoji}</span>}
                  {cat.name}
                  <FiX size={11} className="ml-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────── */}
      <div className="px-3 pt-3">

        {/* Loading skeleton */}
        {loading && creators.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-dark-700 animate-pulse" />
            ))}
          </div>

        ) : allCreators.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-500 text-sm">No se encontraron creadores</p>
            {(gender || country || onlineOnly || liveOnly) && (
              <button
                onClick={() => { setGender(''); setCountry(''); setOnlineOnly(false); setLiveOnly(false); }}
                className="mt-3 text-brand-400 text-sm hover:text-brand-300"
              >
                Limpiar filtros
              </button>
            )}
          </div>

        ) : isFiltered ? (
          /* ── Filtered view: single flat grid ── */
          <>
            <SectionHeader title="Resultados" count={allCreators.length} color="text-gray-400" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
              {allCreators.map(c => (
                <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} />
              ))}
            </div>
          </>

        ) : (
          /* ── Default sections view ── */
          <>
            {/* ADULT LIVE SHOWS */}
            {liveShows.length > 0 && (
              <section className="mb-6">
                <SectionHeader
                  title="Shows en Vivo"
                  count={liveShows.length}
                  color="text-red-400"
                  dot="bg-red-500"
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {liveShows.map(s => <ShowCard key={s.id} show={s} />)}
                </div>
              </section>
            )}

            {/* LIVE NOW (creators) */}
            {liveCreators.length > 0 && (
              <section className="mb-6">
                <SectionHeader
                  title="En Vivo Ahora"
                  count={liveCreators.length}
                  color="text-red-400"
                  dot="bg-red-500"
                  onSeeAll={liveCreators.length > 6 ? () => setLiveOnly(true) : null}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {liveCreators.slice(0, 8).map(c => (
                    <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} large />
                  ))}
                </div>
              </section>
            )}

            {/* ONLINE NOW (not live) */}
            {onlineCreators.length > 0 && (
              <section className="mb-6">
                <SectionHeader
                  title="En Línea Ahora"
                  count={onlineCreators.length}
                  color="text-green-400"
                  dot="bg-green-400"
                  onSeeAll={onlineCreators.length > 6 ? () => setOnlineOnly(true) : null}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {onlineCreators.slice(0, 10).map(c => (
                    <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} />
                  ))}
                </div>
              </section>
            )}

            {/* ALL CREATORS */}
            <section>
              <SectionHeader
                title="Todos los Creadores"
                count={creators.length}
                color="text-gray-500"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {creators.map(c => (
                  <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} />
                ))}
              </div>
            </section>
          </>
        )}

        {/* Load more */}
        {hasMore && !isFiltered && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loading}
              className="btn-secondary text-sm px-8 py-2.5 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : 'Ver más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
