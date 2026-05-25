import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFilter, FiX, FiStar, FiPlay, FiPlus, FiRotateCcw, FiZap, FiMapPin } from 'react-icons/fi';
import SwipeCard from '../components/ui/SwipeCard.jsx';
import TutorialOverlay from '../components/ui/TutorialOverlay.jsx';
import { SwipeCardSkeleton } from '../components/ui/Skeleton.jsx';
import MatchNotification from '../components/ui/MatchNotification.jsx';
import PremiumModal from '../components/ui/PremiumModal.jsx';
import StoryRing from '../components/ui/StoryRing.jsx';
import StoryViewer from '../components/ui/StoryViewer.jsx';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import { useAuthStore } from '../store/authStore.js';
import { COUNTRIES, LANGUAGES } from '../lib/geodata.js';
import { showBanner, hideBanner, showRewardedAd } from '../lib/admob.js';
import { useAds } from '../hooks/useAds.js';
import { compressImage } from '../lib/imageCompressor.js';
import toast from 'react-hot-toast';

const DEFAULT_FILTERS = { gender: 'all', minAge: '', maxAge: '', country: '', language: '', interests: [] };

const QUICK_INTERESTS = ['🎵 Música', '✈️ Viajes', '💪 Fitness', '🎮 Gaming', '📸 Fotografía', '🍷 Vinos'];

export default function Discover() {
  const { profile } = useAuthStore();
  const { trackAction } = useAds();
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS);
  const [likesRemaining, setLikesRemaining] = useState(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [watchingAd, setWatchingAd]   = useState(false);
  const [lastSwiped, setLastSwiped]   = useState(null);
  const [undoing, setUndoing]         = useState(false);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boosting, setBoosting]       = useState(false);
  const [boostActive, setBoostActive] = useState(() =>
    profile?.boosted_until ? new Date(profile.boosted_until) > new Date() : false
  );
  const longPressTimerRef = useRef(null);
  const [storyGroups, setStoryGroups] = useState([]);
  const [openStoryIdx, setOpenStoryIdx] = useState(null);
  const [showAddStory, setShowAddStory] = useState(false);
  const storyFileRef = useRef(null);
  const [topMatch, setTopMatch] = useState(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('destino_tutorial_done'));

  useEffect(() => {
    loadFeed(activeFilters);
    loadStories();
    loadTopMatch();
    if (!profile?.is_premium) {
      loadLikesCount();
      showBanner();
    }
    return () => { hideBanner(); };
  }, []);

  useEffect(() => {
    if (!profile?.boosted_until) return;
    const expiresAt = new Date(profile.boosted_until);
    const now = new Date();
    const isActive = expiresAt > now;
    setBoostActive(isActive);
    if (isActive) {
      const ms = expiresAt - now;
      const t = setTimeout(() => {
        setBoostActive(false);
        toast('⚡ Tu boost ha expirado', { icon: '⚡', duration: 5000 });
      }, ms);
      return () => clearTimeout(t);
    }
  }, [profile?.boosted_until]);

  const loadLikesCount = async () => {
    try {
      const { data } = await api.get('/api/matches/likes/count');
      setLikesRemaining(data.remaining);
    } catch {}
  };

  const loadStories = async () => {
    try {
      const { data } = await api.get('/api/stories');
      setStoryGroups(data.stories || []);
    } catch {}
  };

  const loadTopMatch = async () => {
    try {
      const { data } = await api.get('/api/matches?limit=1&sort=compatibility');
      const best = data.matches?.[0];
      if (best) setTopMatch(best);
    } catch {}
  };

  const handleAddStory = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const isVideo = file.type.startsWith('video/');
      const processed = isVideo ? file : await compressImage(file);
      const fd = new FormData();
      fd.append('media', processed);
      await api.post('/api/stories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Story publicada');
      loadStories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar la story');
    }
  };

  const preloadImage = (url) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
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
      if (f.interests?.length) params.set('interests', f.interests.join(','));
      const { data } = await api.get(`/api/profiles/feed?${params}`);
      const profiles = (data.profiles || []).filter(p => !p.is_adult_creator);
      setFeed(profiles);
      if (profiles[1]?.avatar_url) preloadImage(profiles[1].avatar_url);
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
    || activeFilters.country || activeFilters.language || activeFilters.interests?.length > 0;

  const handleLike = async (targetId) => {
    if (!profile?.is_premium && likesRemaining !== null && likesRemaining <= 0) {
      setShowPremiumModal(true);
      return;
    }
    const swiped = feed.find(p => p.id === targetId);
    try {
      trackAction();
      const { data } = await api.post('/api/matches/like', { targetUserId: targetId });
      setLastSwiped({ profile: swiped, action: 'like' });
      removeFromFeed(targetId);
      if (data.isMatch) {
        setMatchData({ ...swiped, matchId: data.matchId, myAvatar: profile?.avatar_url });
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
    if (!profile?.is_premium) { setShowPremiumModal(true); return; }
    const swiped = feed.find(p => p.id === targetId);
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: targetId, isSuperLike: true });
      setLastSwiped({ profile: swiped, action: 'superlike' });
      removeFromFeed(targetId);
      if (data.isMatch) setMatchData({ ...swiped, matchId: data.matchId, myAvatar: profile?.avatar_url });
      toast.success('⭐ Super Like enviado');
    } catch (err) {
      if (err.response?.data?.code === 'PREMIUM_REQUIRED') setShowPremiumModal(true);
      else toast.error('Error al enviar Super Like');
    }
  };

  const handleDislike = async (targetId) => {
    const swiped = feed.find(p => p.id === targetId);
    try {
      await api.post('/api/matches/dislike', { targetUserId: targetId });
      setLastSwiped({ profile: swiped, action: 'dislike' });
      removeFromFeed(targetId);
    } catch {}
  };

  const handleUndo = async () => {
    if (!lastSwiped || undoing) return;
    if (!profile?.is_premium) { setShowPremiumModal(true); return; }
    setUndoing(true);
    try {
      await api.post('/api/matches/undo', { targetUserId: lastSwiped.profile.id }).catch(() => {});
      setFeed(prev => [lastSwiped.profile, ...prev]);
      toast.success('↩ Swipe deshecho');
      setLastSwiped(null);
    } catch {
      toast.error('No se pudo deshacer');
    } finally {
      setUndoing(false);
    }
  };

  const handleBoost = async () => {
    if (boostActive) { toast('Tu Boost ya está activo ⚡', { icon: '🚀' }); setShowBoostModal(false); return; }
    setBoosting(true);
    try {
      await api.post('/api/profiles/boost');
      setBoostActive(true);
      setShowBoostModal(false);
      toast.success('¡Boost activado por 30 minutos! 🚀');
    } finally {
      setBoosting(false);
    }
  };

  const removeFromFeed = (id) => {
    const remaining = feed.filter(p => p.id !== id);
    if (remaining[1]?.avatar_url) preloadImage(remaining[1].avatar_url);
    setFeed(remaining);
    if (remaining.length <= 3 && remaining.length > 0) loadFeed(activeFilters);
  };

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
    <div className="min-h-screen px-4 pt-8 pb-6 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-dark-700 rounded-full animate-pulse" />
          <div className="h-4 w-48 bg-dark-700/60 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 mb-6 scrollbar-hide">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-14 h-14 rounded-full bg-dark-700 animate-pulse border-2 border-dark-600" />
            <div className="w-10 h-2 bg-dark-700/60 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
      <SwipeCardSkeleton />
    </div>
  );

  const currentProfile = feed[0];

  const isCurrentOnline = currentProfile?.last_active
    ? (Date.now() - new Date(currentProfile.last_active).getTime()) < 5 * 60 * 1000
    : false;

  const myInterests = profile?.interests || [];
  const theirInterests = currentProfile?.interests || [];
  const commonCount = myInterests.filter(i => theirInterests.includes(i)).length;
  const compatibilityPct = myInterests.length > 0 && theirInterests.length > 0
    ? Math.round((commonCount / Math.max(myInterests.length, theirInterests.length)) * 100)
    : 0;

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
          <AnimatePresence>
            {lastSwiped && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                onClick={handleUndo}
                disabled={undoing}
                className="relative w-9 h-9 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 flex items-center justify-center transition-colors disabled:opacity-50"
                title="Deshacer último swipe (Premium)"
              >
                {undoing
                  ? <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  : <FiRotateCcw size={15} />
                }
                {!profile?.is_premium && (
                  <span className="absolute -top-1 -right-1 text-[8px] bg-yellow-500 text-black rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">⚡</span>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowBoostModal(true)}
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              boostActive ? 'bg-orange-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-orange-400'
            }`}
            title="Boost tu perfil"
          >
            <FiZap size={16} />
            {boostActive && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
          </button>

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

      {/* Top match of the week banner */}
      <AnimatePresence>
        {topMatch && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 card p-3 bg-gradient-to-r from-brand-500/15 to-purple-500/10 border border-brand-500/20 flex items-center gap-3"
          >
            <div className="relative shrink-0">
              <img
                src={topMatch.other?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(topMatch.other?.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                className="w-11 h-11 rounded-full object-cover border-2 border-brand-500/40"
                alt=""
              />
              <span className="absolute -top-1 -right-1 text-xs">⭐</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-brand-400 font-semibold">Match destacado</p>
              <p className="text-white text-sm font-medium truncate">{topMatch.other?.full_name}</p>
            </div>
            <Link
              to={`/chat/${topMatch.id}`}
              className="shrink-0 text-xs px-3 py-1.5 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors"
            >
              Chatear
            </Link>
            <button onClick={() => setTopMatch(null)} className="text-gray-600 hover:text-gray-400 shrink-0">
              <FiX size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stories row */}
      <div className="flex gap-4 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-1 px-1">
        {(() => {
          const ownGroup = storyGroups.find(g => g.user.id === profile?.id);
          if (ownGroup) {
            return (
              <button
                onClick={() => setOpenStoryIdx(storyGroups.indexOf(ownGroup))}
                className="flex flex-col items-center gap-1.5 shrink-0"
              >
                <StoryRing hasUnseen={ownGroup.has_unseen} isOwn size={52}>
                  <img
                    src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || 'U')}&size=100&background=1a1a2e&color=f43f5e`}
                    className="w-full h-full rounded-full object-cover"
                    alt=""
                  />
                </StoryRing>
                <p className="text-[10px] text-gray-400 text-center">Mi story</p>
              </button>
            );
          }
          return (
            <button
              onClick={() => storyFileRef.current?.click()}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div className="relative" style={{ width: 56, height: 56 }}>
                <div className="w-full h-full rounded-full bg-dark-700 border-2 border-dashed border-dark-500 flex items-center justify-center">
                  <img
                    src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || 'U')}&size=100&background=1a1a2e&color=f43f5e`}
                    className="w-full h-full rounded-full object-cover opacity-50"
                    alt=""
                  />
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center border-2 border-dark-900">
                  <FiPlus size={10} className="text-white" />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 text-center">Añadir</p>
            </button>
          );
        })()}

        {storyGroups
          .filter(g => g.user.id !== profile?.id)
          .map((group) => {
            const realIdx = storyGroups.indexOf(group);
            return (
              <button
                key={group.user.id}
                onClick={() => setOpenStoryIdx(realIdx)}
                className="flex flex-col items-center gap-1.5 shrink-0"
              >
                <StoryRing hasUnseen={group.has_unseen} isOwn={false} size={52}>
                  <img
                    src={group.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.user.full_name)}&size=100&background=1a1a2e&color=f43f5e`}
                    className="w-full h-full rounded-full object-cover"
                    alt=""
                  />
                </StoryRing>
                <p className="text-[10px] text-gray-400 max-w-[52px] truncate text-center">
                  {group.user.full_name?.split(' ')[0]}
                </p>
              </button>
            );
          })}

        <input
          ref={storyFileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleAddStory}
        />
      </div>

      {/* Swipe feed */}
      <AnimatePresence mode="wait">
        {feed.length > 0 ? (
          <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:max-w-5xl lg:mx-auto lg:items-start">

            <div>
              <motion.div
                key={currentProfile.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onMouseDown={() => { longPressTimerRef.current = setTimeout(() => setPreviewProfile(currentProfile), 600); }}
                onMouseUp={() => clearTimeout(longPressTimerRef.current)}
                onMouseLeave={() => clearTimeout(longPressTimerRef.current)}
                onTouchStart={() => { longPressTimerRef.current = setTimeout(() => setPreviewProfile(currentProfile), 600); }}
                onTouchEnd={() => clearTimeout(longPressTimerRef.current)}
              >
                <SwipeCard
                  profile={currentProfile}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onSuperLike={handleSuperLike}
                  isPremium={profile?.is_premium}
                  isOnline={isCurrentOnline}
                  compatibilityPct={compatibilityPct}
                />
              </motion.div>

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
                    {currentProfile.is_verified && <VerifiedBadge size={18} />}
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
            className="text-center py-10 lg:max-w-lg lg:mx-auto"
          >
            {hasActiveFilters ? (
              <>
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-white mb-2">Sin resultados</h3>
                <p className="text-gray-400 text-sm mb-6">Ningún perfil coincide con tus filtros activos</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <button onClick={resetFilters} className="btn-primary px-6">Quitar filtros</button>
                  <button onClick={() => loadFeed(activeFilters)} className="btn-secondary px-4">Reintentar</button>
                </div>
              </>
            ) : (
              <>
                <div className="relative w-24 h-24 mx-auto mb-6">
                  {['💕','🔥','⭐','💫'].map((emoji, i) => (
                    <motion.div
                      key={emoji}
                      className="absolute inset-0 flex items-center justify-center text-4xl"
                      animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2.5, delay: i * 0.6, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {emoji}
                    </motion.div>
                  ))}
                </div>

                <h3 className="text-xl font-bold text-white mb-2">¡Lo has visto todo!</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Nuevos perfiles llegarán pronto. Mientras tanto, explora más Destino.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                  <Link to="/matches" className="card p-4 hover:border-brand-500/40 transition-all group">
                    <div className="text-2xl mb-2">💬</div>
                    <p className="text-white text-sm font-semibold group-hover:text-brand-300 transition-colors">Tus matches</p>
                    <p className="text-gray-500 text-xs">Escribe a quien ya conectaste</p>
                  </Link>
                  <Link to="/video" className="card p-4 hover:border-brand-500/40 transition-all group">
                    <div className="text-2xl mb-2">🎥</div>
                    <p className="text-white text-sm font-semibold group-hover:text-brand-300 transition-colors">Video aleatorio</p>
                    <p className="text-gray-500 text-xs">Conoce gente al instante</p>
                  </Link>
                  <Link to="/shows" className="card p-4 hover:border-brand-500/40 transition-all group">
                    <div className="text-2xl mb-2">🔴</div>
                    <p className="text-white text-sm font-semibold group-hover:text-brand-300 transition-colors">Shows en vivo</p>
                    <p className="text-gray-500 text-xs">Descubre a los creadores</p>
                  </Link>
                  <Link to="/moments" className="card p-4 hover:border-brand-500/40 transition-all group">
                    <div className="text-2xl mb-2">📸</div>
                    <p className="text-white text-sm font-semibold group-hover:text-brand-300 transition-colors">Momentos</p>
                    <p className="text-gray-500 text-xs">Explora el feed de fotos</p>
                  </Link>
                </div>

                <button
                  onClick={() => loadFeed(activeFilters)}
                  className="btn-secondary px-6 flex items-center gap-2 mx-auto"
                >
                  <FiRotateCcw size={14} /> Buscar de nuevo
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {matchData && <MatchNotification match={matchData} onClose={() => setMatchData(null)} />}
      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}

      {/* Profile Preview Modal */}
      <AnimatePresence>
        {previewProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9990] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setPreviewProfile(null)}
          >
            <motion.div
              initial={{ y: 60, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 60, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="w-full max-w-sm bg-dark-800 rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative h-72">
                <img
                  src={previewProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(previewProfile.full_name || 'U')}&size=400&background=1a1a2e&color=f43f5e`}
                  className="w-full h-full object-cover"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent" />
                <button
                  onClick={() => setPreviewProfile(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white"
                >
                  <FiX size={16} />
                </button>
                <div className="absolute bottom-4 left-4">
                  <p className="text-white text-2xl font-black">
                    {previewProfile.full_name}{previewProfile.age && <span className="font-light text-gray-300">, {previewProfile.age}</span>}
                  </p>
                  {previewProfile.country && (
                    <p className="text-gray-300 text-sm flex items-center gap-1 mt-0.5">
                      <FiMapPin size={11} />
                      {previewProfile.country}
                    </p>
                  )}
                </div>
              </div>
              <div className="p-5">
                {previewProfile.bio && <p className="text-gray-300 text-sm mb-4 leading-relaxed">{previewProfile.bio}</p>}
                {previewProfile.interests?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {previewProfile.interests.map(tag => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-dark-700 text-gray-400 border border-white/10">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { handleDislike(previewProfile.id); setPreviewProfile(null); }}
                    className="py-2.5 rounded-xl bg-dark-700 text-gray-300 text-sm font-semibold hover:bg-dark-600 transition-colors"
                  >
                    👎 Pasar
                  </button>
                  <button
                    onClick={() => { handleLike(previewProfile.id); setPreviewProfile(null); }}
                    className="py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
                  >
                    ❤️ Me gusta
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boost Modal */}
      <AnimatePresence>
        {showBoostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9991] bg-black/75 flex items-center justify-center p-4"
            onClick={() => setShowBoostModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs bg-dark-800 rounded-3xl border border-white/10 p-6 text-center shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-5xl mb-3">🚀</div>
              <h2 className="text-xl font-black text-white mb-1">Boost tu perfil</h2>
              <p className="text-gray-400 text-sm mb-5">Aparece primero en el feed durante 30 minutos y recibe más matches</p>
              {boostActive ? (
                <div className="bg-green-500/15 border border-green-500/30 rounded-2xl p-3 mb-4">
                  <p className="text-green-400 font-semibold text-sm">✓ Boost activo ahora</p>
                </div>
              ) : (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 mb-4">
                  <p className="text-orange-300 text-2xl font-black">50 <FiZap className="inline" size={18} /></p>
                  <p className="text-gray-500 text-xs">coins · 30 minutos</p>
                </div>
              )}
              {!boostActive && (
                <button
                  onClick={handleBoost}
                  disabled={boosting}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {boosting
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><FiZap size={14} /> Activar Boost</>
                  }
                </button>
              )}
              <button onClick={() => setShowBoostModal(false)} className="w-full text-gray-600 text-xs mt-3 hover:text-gray-400">
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showTutorial && (
        <TutorialOverlay onDone={() => {
          localStorage.setItem('destino_tutorial_done', '1');
          setShowTutorial(false);
        }} />
      )}

      {openStoryIdx !== null && storyGroups.length > 0 && (
        <StoryViewer
          groups={storyGroups}
          initialGroupIndex={Math.min(openStoryIdx, storyGroups.length - 1)}
          isOwn={storyGroups[Math.min(openStoryIdx, storyGroups.length - 1)]?.user?.id === profile?.id}
          onClose={() => setOpenStoryIdx(null)}
          onNewStory={loadStories}
        />
      )}

      {/* Filtros */}
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

              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Intereses comunes</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_INTERESTS.map(tag => {
                    const selected = (filters.interests || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => setFilters(f => ({
                          ...f,
                          interests: selected
                            ? f.interests.filter(t => t !== tag)
                            : [...(f.interests || []), tag],
                        }))}
                        className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                          selected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
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
