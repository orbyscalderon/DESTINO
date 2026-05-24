import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUsers, FiStar, FiGlobe, FiWifi, FiX, FiSliders } from 'react-icons/fi';
import api from '../lib/api.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import FlagImg from '../components/ui/FlagImg.jsx';
import { COUNTRIES } from '../lib/geodata.js';

const GENDER_TABS = [
  { id: '',       label: 'Todos'    },
  { id: 'female', label: 'Chicas'   },
  { id: 'male',   label: 'Chicos'   },
  { id: 'other',  label: 'Trans / NB'},
];

const SORT_OPTIONS = [
  { id: 'new',     label: 'Nuevas'    },
  { id: 'popular', label: 'Populares' },
];

function isOnline(lastActive) {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000;
}

function CreatorCard({ c, onClick }) {
  const online = isOnline(c.last_active);
  const countryName = c.country
    ? (COUNTRIES.find(co => co.value === c.country || co.label === c.country)?.label || c.country)
    : null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dark-700 group w-full"
    >
      {/* Photo */}
      <img
        src={c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || 'C')}&size=400&background=1a1a2e&color=f43f5e`}
        alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
      />

      {/* Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
        {online ? (
          <span className="flex items-center gap-1 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> EN LÍNEA
          </span>
        ) : <span />}
        <div className="flex flex-col items-end gap-1">
          {c.is_verified && <VerifiedBadge size={14} />}
          {countryName && <FlagImg country={c.country} size={16} className="rounded-sm" />}
        </div>
      </div>

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

export default function AdultCreators() {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(isAgeVerified);
  const [creators, setCreators]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [query, setQuery]         = useState('');
  const [gender, setGender]       = useState('');
  const [country, setCountry]     = useState('');
  const [sort, setSort]           = useState('new');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef(null);

  const load = useCallback(async (opts = {}, append = false) => {
    setLoading(true);
    const { q = query, g = gender, c = country, s = sort, o = onlineOnly, p = 0 } = opts;
    try {
      const params = new URLSearchParams({ q, page: p, sort: s });
      if (g)  params.set('gender', g);
      if (c)  params.set('country', c);
      if (o)  params.set('online', 'true');
      const { data } = await api.get(`/api/creator/discover?${params}`);
      setCreators(prev => append ? [...prev, ...(data.creators || [])] : (data.creators || []));
      setHasMore(data.hasMore || false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [query, gender, country, sort, onlineOnly]);

  useEffect(() => {
    if (verified) load({ q: '', g: gender, c: country, s: sort, o: onlineOnly, p: 0 });
  }, [verified, gender, sort, onlineOnly, country]);

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

  const activeFilters = (country ? 1 : 0) + (onlineOnly ? 1 : 0);

  if (!verified) return <AgeGate onVerified={() => setVerified(true)} />;

  return (
    <div className="min-h-screen pb-24 bg-dark-900">
      {/* ── Header ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        {/* Title + controls */}
        <div className="flex items-center gap-2 px-4 pt-6 pb-2">
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

          {/* Filter toggle */}
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
                gender === tab.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-dark-700 text-gray-400 hover:text-white'
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
                  {/* Online only */}
                  <button
                    onClick={() => setOnlineOnly(v => !v)}
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Grid ───────────────────────────────────── */}
      <div className="px-3 pt-3">
        {loading && creators.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-dark-700 animate-pulse" />
            ))}
          </div>
        ) : creators.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-500 text-sm">No se encontraron creadores</p>
            {(gender || country || onlineOnly) && (
              <button
                onClick={() => { setGender(''); setCountry(''); setOnlineOnly(false); }}
                className="mt-3 text-brand-400 text-sm hover:text-brand-300"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Online now section */}
            {!onlineOnly && creators.some(c => isOnline(c.last_active)) && (
              <div className="mb-4">
                <h2 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> En línea ahora
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {creators.filter(c => isOnline(c.last_active)).slice(0, 4).map(c => (
                    <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} />
                  ))}
                </div>
              </div>
            )}

            {/* All creators */}
            <div className="mb-2">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {onlineOnly ? 'En línea' : 'Todos los creadores'} · {creators.length}{hasMore ? '+' : ''}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {creators.map(c => (
                <CreatorCard key={c.id} c={c} onClick={() => navigate(`/profile/${c.id}`)} />
              ))}
            </div>

            {hasMore && (
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
          </>
        )}
      </div>
    </div>
  );
}
