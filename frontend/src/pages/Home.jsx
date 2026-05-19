import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFilter, FiX, FiStar, FiPlay } from 'react-icons/fi';
import SwipeCard from '../components/ui/SwipeCard.jsx';
import MatchNotification from '../components/ui/MatchNotification.jsx';
import PremiumModal from '../components/ui/PremiumModal.jsx';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import { COUNTRIES, LANGUAGES } from '../lib/geodata.js';
import { showBanner, hideBanner, showRewardedAd } from '../lib/admob.js';
import toast from 'react-hot-toast';

const DEFAULT_FILTERS = { gender: 'all', minAge: '', maxAge: '', country: '', language: '' };

export default function Home() {
  const { profile } = useAuthStore();
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS);
  const [likesRemaining, setLikesRemaining] = useState(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [watchingAd, setWatchingAd] = useState(false);

  useEffect(() => {
    loadFeed(activeFilters);
    if (!profile?.is_premium) {
      loadLikesCount();
      showBanner();
    }
    return () => { hideBanner(); };
  }, []);

  const loadLikesCount = async () => {
    try {
      const { data } = await api.get('/api/matches/likes/count');
      setLikesRemaining(data.remaining);
    } catch {}
  };

  const loadFeed = async (f = activeFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.gender && f.gender !== 'all') params.set('gender', f.gender);
      if (f.minAge) params.set('minAge', f.minAge);
      if (f.maxAge) params.set('maxAge', f.maxAge);
      if (f.country) params.set('country', f.country);
      if (f.language) params.set('language', f.language);
      const { data } = await api.get(`/api/profiles/feed?${params}`);
      setFeed(data.profiles || []);
    } catch {
      toast.error('Error cargando perfiles');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    setActiveFilters(filters);
    setShowFilters(false);
    setCountrySearch('');
    loadFeed(filters);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveFilters(DEFAULT_FILTERS);
    setShowFilters(false);
    setCountrySearch('');
    loadFeed(DEFAULT_FILTERS);
  };

  const hasActiveFilters = activeFilters.gender !== 'all' || activeFilters.minAge || activeFilters.maxAge
    || activeFilters.country || activeFilters.language;

  const handleLike = async (targetId) => {
    if (!profile?.is_premium && likesRemaining !== null && likesRemaining <= 0) {
      setShowPremiumModal(true);
      return;
    }
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: targetId });
      removeFromFeed(targetId);
      if (data.isMatch) {
        const matchedProfile = feed.find(p => p.id === targetId);
        setMatchData({ ...matchedProfile, matchId: data.matchId, myAvatar: profile?.avatar_url });
      }
      if (data.remainingLikes !== null && data.remainingLikes !== undefined) {
        setLikesRemaining(data.remainingLikes);
      }
    } catch (err) {
      if (err.response?.data?.code === 'LIKE_LIMIT_REACHED') {
        setLikesRemaining(0);
        setShowPremiumModal(true);
      } else {
        toast.error('Error al dar like');
      }
    }
  };

  const handleSuperLike = async (targetId) => {
    if (!profile?.is_premium) {
      setShowPremiumModal(true);
      return;
    }
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: targetId, isSuperLike: true });
      removeFromFeed(targetId);
      if (data.isMatch) {
        const matchedProfile = feed.find(p => p.id === targetId);
        setMatchData({ ...matchedProfile, matchId: data.matchId, myAvatar: profile?.avatar_url });
      }
      toast.success('⭐ Super Like enviado');
    } catch (err) {
      if (err.response?.data?.code === 'PREMIUM_REQUIRED') {
        setShowPremiumModal(true);
      } else {
        toast.error('Error al enviar Super Like');
      }
    }
  };

  const handleDislike = async (targetId) => {
    try {
      await api.post('/api/matches/dislike', { targetUserId: targetId });
      removeFromFeed(targetId);
    } catch {}
  };

  const removeFromFeed = (id) => setFeed(prev => prev.filter(p => p.id !== id));

  const handleWatchAd = async () => {
    setWatchingAd(true);
    try {
      const reward = await showRewardedAd();
      if (reward) {
        const amount = reward.amount || 10;
        try {
          const { data } = await api.post('/api/matches/likes/add', { amount });
          setLikesRemaining(data.remaining ?? (likesRemaining || 0) + amount);
        } catch {
          setLikesRemaining(prev => (prev || 0) + amount);
        }
        toast.success(`¡+${amount} likes desbloqueados!`);
      }
    } finally {
      setWatchingAd(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const currentProfile = feed[0];

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-6 lg:px-10 lg:pt-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 lg:mb-10">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black gradient-text">Descubrir</h1>
          <p className="text-gray-500 text-sm mt-0.5">Encuentra tu conexión hoy</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Contador de likes para usuarios gratuitos */}
          {!profile?.is_premium && likesRemaining !== null && (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
              likesRemaining <= 3
                ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                : 'bg-dark-700 text-gray-400 border-white/10'
            }`}>
              {likesRemaining <= 0 ? '❤️ Sin likes' : `❤️ ${likesRemaining} likes`}
            </span>
          )}
          {profile?.is_premium && (
            <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-full border border-yellow-500/30">
              ⚡ PREMIUM
            </span>
          )}
          <button
            onClick={() => { setFilters(activeFilters); setShowFilters(true); }}
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              hasActiveFilters
                ? 'bg-brand-500 text-white'
                : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            <FiFilter size={16} />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <AnimatePresence mode="wait">
        {feed.length > 0 ? (
          <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:max-w-5xl lg:mx-auto lg:items-start">

            <div>
              <motion.div key={currentProfile.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <SwipeCard
                  profile={currentProfile}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onSuperLike={handleSuperLike}
                  isPremium={profile?.is_premium}
                />
              </motion.div>

              {/* Banner de likes agotados (móvil) */}
              {!profile?.is_premium && likesRemaining === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 card p-4 border-brand-500/30 bg-brand-500/5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white text-sm font-medium">Likes diarios agotados</p>
                      <p className="text-gray-500 text-xs">Premium = likes ilimitados ⚡</p>
                    </div>
                    <Link to="/premium" className="btn-primary text-xs px-3 py-1.5">
                      Upgrade
                    </Link>
                  </div>
                  <button
                    onClick={handleWatchAd}
                    disabled={watchingAd}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-dark-700 text-gray-300 text-xs hover:bg-dark-600 transition-colors disabled:opacity-50"
                  >
                    <FiPlay size={12} />
                    {watchingAd ? 'Cargando anuncio...' : 'Ver anuncio → +10 likes gratis'}
                  </button>
                </motion.div>
              )}
            </div>

            <div className="hidden lg:flex flex-col gap-4 pt-2">
              <div className="card p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-3xl font-bold text-white">
                      {currentProfile.full_name}
                      {currentProfile.age && <span className="font-light text-gray-300">, {currentProfile.age}</span>}
                    </h2>
                    {currentProfile.gender && (
                      <span className="inline-block mt-2 text-xs font-medium bg-dark-700 text-gray-400 px-3 py-1 rounded-full capitalize">
                        {currentProfile.gender === 'male' ? 'Hombre' : currentProfile.gender === 'female' ? 'Mujer' : 'Otro'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {currentProfile.is_premium && (
                      <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-1 rounded-full border border-yellow-500/30">
                        ⚡ Premium
                      </span>
                    )}
                    {currentProfile.is_verified && (
                      <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-1 rounded-full border border-blue-500/30">
                        ✓ Verificado
                      </span>
                    )}
                  </div>
                </div>

                {currentProfile.bio && (
                  <p className="text-gray-300 leading-relaxed mt-4 border-t border-white/5 pt-4">
                    {currentProfile.bio}
                  </p>
                )}
              </div>

              <div className="card p-4 bg-dark-700/50">
                <p className="text-gray-500 text-sm text-center">
                  Arrastra la carta o usa los botones para decidir
                </p>
                <div className="flex justify-center gap-3 mt-3">
                  <span className="text-xs bg-brand-500/10 text-brand-400 px-3 py-1 rounded-full">← NOPE</span>
                  <span className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full flex items-center gap-1"><FiStar size={10} /> SUPER</span>
                  <span className="text-xs bg-green-500/10 text-green-400 px-3 py-1 rounded-full">LIKE →</span>
                </div>
              </div>

              {feed.length > 1 && (
                <p className="text-gray-600 text-xs text-center">
                  {feed.length - 1} perfil{feed.length > 2 ? 'es' : ''} más en cola
                </p>
              )}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 lg:max-w-lg lg:mx-auto"
          >
            <div className="text-6xl mb-4">🌟</div>
            <h3 className="text-xl font-bold text-white mb-2">
              {hasActiveFilters ? 'Sin resultados con estos filtros' : '¡Has visto todos los perfiles!'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              {hasActiveFilters ? 'Prueba ajustando los filtros' : 'Vuelve más tarde para ver nuevas personas'}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              {hasActiveFilters && (
                <button onClick={resetFilters} className="btn-secondary px-6">Quitar filtros</button>
              )}
              <button onClick={() => loadFeed(activeFilters)} className="btn-secondary px-6">Actualizar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {matchData && <MatchNotification match={matchData} onClose={() => setMatchData(null)} />}
      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}

      {/* Panel de filtros */}
      <AnimatePresence>
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60" onClick={() => setShowFilters(false)}>
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-sm bg-dark-800 rounded-2xl border border-white/10 p-5 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white">Filtros</h3>
                <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-white">
                  <FiX />
                </button>
              </div>

              {/* Género */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Género</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: 'male', label: 'Hombres' },
                    { value: 'female', label: 'Mujeres' },
                    { value: 'other', label: 'Otro' },
                  ].map(g => (
                    <button
                      key={g.value}
                      onClick={() => setFilters(f => ({ ...f, gender: g.value }))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${
                        filters.gender === g.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rango de edad */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Rango de edad</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="Mín"
                    min={18}
                    max={100}
                    value={filters.minAge}
                    onChange={e => setFilters(f => ({ ...f, minAge: e.target.value }))}
                    className="input-field flex-1 py-2 text-center text-sm"
                  />
                  <span className="text-gray-600">—</span>
                  <input
                    type="number"
                    placeholder="Máx"
                    min={18}
                    max={100}
                    value={filters.maxAge}
                    onChange={e => setFilters(f => ({ ...f, maxAge: e.target.value }))}
                    className="input-field flex-1 py-2 text-center text-sm"
                  />
                </div>
              </div>

              {/* País */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">País</p>
                {filters.country ? (
                  <div className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                    <span className="text-sm text-white">
                      {COUNTRIES.find(c => c.code === filters.country)?.flag}{' '}
                      {COUNTRIES.find(c => c.code === filters.country)?.name}
                    </span>
                    <button
                      onClick={() => setFilters(f => ({ ...f, country: '' }))}
                      className="text-gray-500 hover:text-white ml-2"
                    >
                      <FiX size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="input-field py-2 text-sm w-full"
                      placeholder="Buscar país..."
                      value={countrySearch}
                      onChange={e => setCountrySearch(e.target.value)}
                    />
                    {countrySearch && (
                      <div className="mt-1 max-h-32 overflow-y-auto rounded-xl border border-white/5 bg-dark-700 divide-y divide-white/5">
                        {filteredCountries.slice(0, 8).map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => { setFilters(f => ({ ...f, country: c.code })); setCountrySearch(''); }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-300 hover:bg-dark-600"
                          >
                            <span>{c.flag}</span><span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Idioma */}
              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Idioma</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => setFilters(f => ({ ...f, language: f.language === l.code ? '' : l.code }))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${
                        filters.language === l.code
                          ? 'bg-brand-500 text-white'
                          : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={resetFilters} className="btn-secondary flex-1 py-2.5 text-sm">
                  Limpiar
                </button>
                <button onClick={applyFilters} className="btn-primary flex-1 py-2.5 text-sm">
                  Aplicar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
