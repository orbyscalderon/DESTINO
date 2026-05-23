import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiSearch, FiX, FiTrendingUp, FiSliders } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { countryByCode, COUNTRIES } from '../lib/geodata.js';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';

const RANK_BADGE = [
  'bg-yellow-400 text-black',   // #1 oro
  'bg-gray-300 text-black',     // #2 plata
  'bg-amber-700 text-white',    // #3 bronce
];

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function CreatorCard({ creator, rank }) {
  return (
    <Link to={`/profile/${creator.id}`} className="block">
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dark-700">
        <img
          src={
            creator.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.full_name || 'U')}&size=200&background=1a1a2e&color=f43f5e`
          }
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Rank badge */}
        <span className={`absolute top-1.5 left-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${RANK_BADGE[rank]}`}>
          #{rank + 1}
        </span>
        {/* Premium badge */}
        {creator.is_premium && (
          <span className="absolute top-1.5 right-1.5 text-[9px] bg-yellow-500/80 text-black font-bold px-1 py-0.5 rounded-full">
            ⚡
          </span>
        )}
        {/* Name overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-8 pb-2 px-2">
          <p className="text-white text-[11px] font-bold leading-tight truncate">
            {creator.full_name}
            {creator.is_verified && <VerifiedBadge size={14} className="ml-0.5" />}
          </p>
          {creator.subscriber_count > 0 && (
            <p className="text-gray-400 text-[10px] mt-0.5">
              🔔 {creator.subscriber_count.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

const HISTORY_KEY = 'destino_search_history';
const MAX_HISTORY = 8;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveToHistory(term) {
  const prev = getHistory().filter(t => t !== term);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([term, ...prev].slice(0, MAX_HISTORY)));
}
function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [topCreators, setTopCreators] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ gender: 'all', minAge: '', maxAge: '', country: '', creatorOnly: false, interests: [] });
  const [history, setHistory] = useState(getHistory);
  const [inputFocused, setInputFocused] = useState(false);

const QUICK_INTERESTS = ['🎵 Música', '✈️ Viajes', '💪 Fitness', '🎮 Gaming', '📸 Fotografía', '🍷 Vinos', '🎬 Cine', '⚽ Deportes'];

  useEffect(() => {
    api.get('/api/profiles/top-creators')
      .then(({ data }) => setTopCreators(data.categories || []))
      .catch(() => {})
      .finally(() => setLoadingTop(false));
  }, []);

  const doSearch = useCallback(
    debounce(async (q, f) => {
      if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
      setLoading(true);
      setSearched(true);
      try {
        const params = new URLSearchParams({ q });
        if (f?.gender && f.gender !== 'all') params.set('gender', f.gender);
        if (f?.minAge) params.set('min_age', f.minAge);
        if (f?.maxAge) params.set('max_age', f.maxAge);
        if (f?.country) params.set('country', f.country);
        if (f?.creatorOnly) params.set('is_creator', 'true');
        if (f?.interests?.length) params.set('interests', f.interests.join(','));
        const { data } = await api.get(`/api/profiles/search?${params}`);
        setResults(data.profiles || []);
        if (q.trim().length >= 2) {
          saveToHistory(q.trim());
          setHistory(getHistory());
        }
      } catch {}
      setLoading(false);
    }, 400),
    []
  );

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    doSearch(v, filters);
  };

  const selectHistory = (term) => {
    setQuery(term);
    setInputFocused(false);
    doSearch(term, filters);
  };

  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
    if (query.trim().length >= 2) doSearch(query, newFilters);
  };

  const hasActiveFilters = filters.gender !== 'all' || filters.minAge || filters.maxAge || filters.country || filters.creatorOnly || filters.interests?.length > 0;

  return (
    <div className="min-h-screen px-4 pt-8 pb-20 max-w-lg mx-auto">
      <h1 className="text-2xl font-black gradient-text mb-6">Buscar</h1>

      {/* Input de búsqueda + filtros */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field pl-9 pr-9 w-full"
            placeholder="Nombre o @username..."
            value={query}
            onChange={handleChange}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 150)}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <FiX size={16} />
            </button>
          )}
          {/* Dropdown de historial */}
          {inputFocused && !query && history.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                <span className="text-xs text-gray-500 font-medium">Búsquedas recientes</span>
                <button
                  onClick={() => { clearHistory(); setHistory([]); }}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  Borrar
                </button>
              </div>
              {history.map(term => (
                <button
                  key={term}
                  onMouseDown={() => selectHistory(term)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 text-left transition-colors"
                >
                  <FiSearch size={13} className="text-gray-500 shrink-0" />
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors relative shrink-0 ${
            hasActiveFilters ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
          }`}
        >
          <FiSliders size={16} />
          {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full" />}
        </button>
      </div>

      {/* Panel de filtros */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="card p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Género</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[{ v: 'all', l: 'Todos' }, { v: 'male', l: 'Hombres' }, { v: 'female', l: 'Mujeres' }, { v: 'other', l: 'Otro' }].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setFilters(f => ({ ...f, gender: opt.v }))}
                      className={`py-1.5 rounded-xl text-xs font-medium transition-all ${filters.gender === opt.v ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Edad mín.</p>
                  <input type="number" className="input-field py-2 text-sm" placeholder="18" min="18" max="99" value={filters.minAge} onChange={e => setFilters(f => ({ ...f, minAge: e.target.value }))} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Edad máx.</p>
                  <input type="number" className="input-field py-2 text-sm" placeholder="99" min="18" max="99" value={filters.maxAge} onChange={e => setFilters(f => ({ ...f, maxAge: e.target.value }))} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">País</p>
                <select
                  className="input-field py-2 text-sm w-full"
                  value={filters.country}
                  onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}
                >
                  <option value="">Todos los países</option>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setFilters(f => ({ ...f, creatorOnly: !f.creatorOnly }))}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${filters.creatorOnly ? 'bg-brand-500/20 border-brand-500/50 text-brand-400' : 'bg-dark-700 border-white/5 text-gray-400'}`}
              >
                <span>Solo creadores</span>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${filters.creatorOnly ? 'bg-brand-500' : 'bg-dark-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${filters.creatorOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Intereses</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_INTERESTS.map(tag => {
                    const selected = (filters.interests || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setFilters(f => ({
                          ...f,
                          interests: selected
                            ? f.interests.filter(t => t !== tag)
                            : [...(f.interests || []), tag],
                        }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${selected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'}`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => applyFilters({ gender: 'all', minAge: '', maxAge: '', country: '', creatorOnly: false, interests: [] })} className="flex-1 btn-secondary text-xs py-2">Limpiar</button>
                <button onClick={() => applyFilters(filters)} className="flex-1 btn-primary text-xs py-2">Aplicar</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spinner de búsqueda */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Sin resultados */}
        {!loading && searched && results.length === 0 && (
          <motion.p
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-gray-500 py-8"
          >
            No se encontraron resultados para "{query}"
          </motion.p>
        )}

        {/* Resultados de búsqueda */}
        {!loading && results.length > 0 && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {results.map(profile => (
              <Link
                key={profile.id}
                to={`/profile/${profile.id}`}
                className="flex items-center gap-3 card p-3 hover:border-brand-500/30 transition-colors"
              >
                <img
                  src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white font-medium text-sm truncate">{profile.full_name}</p>
                    {profile.is_verified && <VerifiedBadge size={14} className="ml-0.5" />}
                    {profile.is_creator && (
                      <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">Creador</span>
                    )}
                    {profile.is_premium && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">⚡</span>
                    )}
                  </div>
                  {profile.username && <p className="text-gray-500 text-xs">@{profile.username}</p>}
                  {profile.country && (
                    <p className="text-gray-600 text-xs">
                      {countryByCode(profile.country)?.flag} {countryByCode(profile.country)?.name}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </motion.div>
        )}

        {/* Ranking por categoría (estado inicial, sin búsqueda activa) */}
        {!searched && (
          <motion.div
            key="ranking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {loadingTop ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : topCreators.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <FiSearch size={40} className="mx-auto mb-3 opacity-30" />
                <p>Escribe al menos 2 caracteres para buscar</p>
              </div>
            ) : (
              <div className="space-y-7">
                <div className="flex items-center gap-2">
                  <FiTrendingUp className="text-brand-400" size={15} />
                  <h2 className="text-sm font-semibold text-gray-300">Top Creadores por Categoría</h2>
                </div>

                {topCreators.map(cat => (
                  <div key={cat.key}>
                    {/* Header de categoría */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">
                        {cat.emoji} {cat.label}
                      </span>
                      <Link
                        to="/shows"
                        className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        Ver shows →
                      </Link>
                    </div>

                    {/* Grid de 3 creadores */}
                    <div className="grid grid-cols-3 gap-2">
                      {cat.creators.map((creator, i) => (
                        <CreatorCard key={creator.id} creator={creator} rank={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
