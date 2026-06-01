import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiArrowLeft, FiHeart, FiX, FiMoreVertical, FiLock, FiZap, FiCheck, FiVideo, FiUserMinus, FiShare2, FiUserPlus, FiUsers, FiGrid, FiMessageCircle, FiGift, FiImage, FiFilm, FiPlay, FiSend } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import BlockReportModal from '../components/ui/BlockReportModal.jsx';
import PaymentModal from '../components/ui/PaymentModal.jsx';
import AgeVerificationModal, { isAgeDeclinedRecently } from '../components/ui/AgeVerificationModal.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import TipModal from '../components/ui/TipModal.jsx';
import TipMenuPublic from '../components/ui/TipMenuPublic.jsx';
import TierPicker from '../components/ui/TierPicker.jsx';
import TierBadge from '../components/ui/TierBadge.jsx';
import GiftSubModal from '../components/ui/GiftSubModal.jsx';
import CreatorContentTabs from '../components/ui/CreatorContentTabs.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import { useAuthStore } from '../store/authStore.js';

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const currentUserId = user?.id;
  const confirm = useConfirm();
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [buyingPhoto, setBuyingPhoto] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null); // { clientSecret, type: 'subscribe'|'photo', photoId?, amount, description }
  const [following, setFollowing]         = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [showFollowers, setShowFollowers]   = useState(false);
  const [followers, setFollowers]           = useState([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [userPosts, setUserPosts] = useState([]);
  // postsTab removido: el rediseño con CreatorContentTabs ya maneja los tabs
  const [videos, setVideos] = useState([]);
  const [buyingVideo, setBuyingVideo] = useState(null);
  const [showTipModal, setShowTipModal]   = useState(false);
  const [galleries, setGalleries]         = useState([]);
  const [openGallery, setOpenGallery]     = useState(null); // { id, title, items: [] }
  const [loadingGallery, setLoadingGallery] = useState(null);
  const [showAgeModal, setShowAgeModal]     = useState(false);
  const [photosBlocked, setPhotosBlocked]   = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm]           = useState({ message: '', price: 50, package_id: null });
  const [sendingRequest, setSendingRequest]     = useState(false);
  const [videoPackages, setVideoPackages]       = useState([]);
  const [videoMinPrice, setVideoMinPrice]       = useState(50);
  const [videoAccepts, setVideoAccepts]         = useState(true);
  const [packagesLoaded, setPackagesLoaded]     = useState(false);
  const [showTierModal, setShowTierModal]   = useState(false);
  const [showGiftModal, setShowGiftModal]   = useState(false);
  const [mySub, setMySub]                   = useState(null);
  const [creatorHasTiers, setCreatorHasTiers] = useState(false);
  const [creatorTiers, setCreatorTiers] = useState([]);
  const [creatorLegacyPrice, setCreatorLegacyPrice] = useState(null);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [creatorShows, setCreatorShows] = useState([]);
  const [loadError, setLoadError] = useState(null); // { status, message }
  const [reloadKey, setReloadKey] = useState(0);

  const loadPhotos = async () => {
    const phRes = await api.get(`/api/profiles/${userId}/photos`).catch(() => ({ data: { photos: [], requires_vip: false } }));
    if (phRes.data.requires_age_verification && !isAgeDeclinedRecently()) {
      setShowAgeModal(true);
      setPhotosBlocked(true);
    } else if (phRes.data.requires_vip || phRes.data.requires_age_verification) {
      setPhotosBlocked(true);
    } else {
      setPhotos(phRes.data.photos || []);
      setPhotosBlocked(false);
    }
  };

  useEffect(() => {
    // 6 requests en paralelo (antes 9). El endpoint creator/profile consolida
    // tiers + my_subscription + subscribers_count + posts_count + shows + paid_photos.
    Promise.all([
      api.get(`/api/profiles/${userId}`),
      api.get(`/api/profiles/${userId}/photos`).catch(() => ({ data: { photos: [], requires_age_verification: false } })),
      api.get(`/api/follows/${userId}/status`).catch(() => ({ data: { following: false, followers_count: 0 } })),
      api.get(`/api/posts/user/${userId}?limit=12`).catch(() => ({ data: { posts: [] } })),
      api.get(`/api/creator/${userId}/galleries`).catch(() => ({ data: { galleries: [] } })),
      api.get(`/api/profiles/${userId}/videos`).catch(() => ({ data: { videos: [] } })),
    ]).then(async ([pRes, phRes, followRes, postsRes, galRes, vidRes]) => {
      const p = pRes.data.profile;
      setProfile(p);
      setSubscribed(!!p.is_subscribed);
      if (phRes.data.requires_age_verification && !isAgeDeclinedRecently()) {
        // Pedir verificación de edad — modal se cierra y vuelve a cargar fotos
        setShowAgeModal(true);
        setPhotosBlocked(true);
      } else if (phRes.data.requires_vip || phRes.data.requires_age_verification) {
        setPhotosBlocked(true);
      } else {
        setPhotos(phRes.data.photos || []);
      }
      setFollowing(followRes.data.following);
      setFollowersCount(followRes.data.followers_count || 0);
      setUserPosts(postsRes.data.posts || []);
      setGalleries(galRes.data.galleries || []);
      setVideos(vidRes.data.videos || []);

      // Solo si es creador: cargar perfil de creador (1 request que devuelve
      // tiers + my_subscription + counters + shows juntos)
      if (p?.is_creator) {
        try {
          const { data } = await api.get(`/api/creator/${userId}/profile`);
          const tiers = data.tiers || [];
          setCreatorTiers(tiers);
          setCreatorHasTiers(tiers.length > 0);
          setCreatorLegacyPrice(data.legacy_price ?? null);
          setSubscribersCount(data.subscribers_count ?? 0);
          setPostsCount(data.posts_count ?? 0);
          setCreatorShows(data.shows || []);
          setMySub(data.my_subscription || null);
        } catch { /* silencioso */ }
      }
    }).catch((err) => {
      const status = err?.response?.status;
      const errData = err?.response?.data;
      console.error('[UserProfile] load error:', status, errData);
      // Solo mostrar "Perfil no encontrado" si es 404 real
      if (status === 404) {
        setLoadError({ status: 404, message: 'Este perfil no existe o fue eliminado' });
      } else if (status === 429) {
        setLoadError({ status: 429, message: 'Demasiadas peticiones. Espera unos segundos.' });
      } else if (status === 401) {
        setLoadError({ status: 401, message: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
      } else if (status >= 500) {
        setLoadError({ status, message: 'Error del servidor. Intenta de nuevo en un momento.' });
      } else if (!err?.response) {
        setLoadError({ status: 0, message: 'Sin conexión. Verifica tu internet.' });
      } else {
        setLoadError({ status: status || 0, message: errData?.error || 'No se pudo cargar el perfil' });
      }
    }).finally(() => setLoading(false));
  }, [userId, reloadKey]);

  const handleToggleFollow = async () => {
    setTogglingFollow(true);
    try {
      if (following) {
        await api.delete(`/api/follows/${userId}`);
        setFollowing(false);
        setFollowersCount(c => Math.max(0, c - 1));
      } else {
        await api.post(`/api/follows/${userId}`);
        setFollowing(true);
        setFollowersCount(c => c + 1);
      }
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setTogglingFollow(false);
    }
  };

  const handleLike = async () => {
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: userId });
      if (data.isMatch) toast.success('¡Es un match! 💕');
      else toast.success('Like enviado');
      navigate(-1);
    } catch {
      toast.error('Error al dar like');
    }
  };

  const handleSubscribe = async (tierOrLegacy) => {
    setSubscribing(true);
    setShowTierModal(false);
    try {
      const body = tierOrLegacy?.legacy ? {} : { tierId: tierOrLegacy?.id };
      const { data } = await api.post(`/api/creator/${userId}/subscribe`, body);
      setPaymentModal({
        clientSecret: data.clientSecret,
        type: 'subscribe',
        amount: `$${parseFloat(data.amount).toFixed(2)}`,
        description: `${data.tierName ? `Tier ${data.tierName} · ` : 'Suscripción a '}${profile.full_name}`,
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al suscribirse');
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      await api.delete(`/api/creator/${userId}/subscribe`);
      setSubscribed(false);
      toast.success('Suscripción cancelada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  };

  const handleBuyPhoto = async (photo) => {
    setBuyingPhoto(photo.id);
    try {
      const { data: piData } = await api.post(`/api/payments/photo/${photo.id}`);
      setPaymentModal({
        clientSecret: piData.clientSecret,
        type: 'photo',
        photoId: photo.id,
        amount: `$${photo.price}`,
        description: 'Foto exclusiva',
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar el pago');
    } finally {
      setBuyingPhoto(null);
    }
  };

  const handleBuyVideo = async (video) => {
    setBuyingVideo(video.id);
    try {
      await api.post(`/api/profiles/videos/${video.id}/purchase`);
      const { data } = await api.get(`/api/profiles/${userId}/videos`);
      setVideos(data.videos || []);
      toast.success('Vídeo desbloqueado');
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Coins insuficientes — recarga en la sección Coins');
      } else {
        toast.error(err.response?.data?.error || 'Error al comprar el vídeo');
      }
    } finally {
      setBuyingVideo(null);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    const modal = paymentModal;
    setPaymentModal(null);
    try {
      if (modal.type === 'subscribe') {
        await api.post(`/api/creator/${userId}/subscribe/confirm`, { paymentIntentId });
        setSubscribed(true);
        toast.success('¡Suscripción activada!');
      } else if (modal.type === 'photo') {
        const { data } = await api.post(`/api/payments/photo/${modal.photoId}/confirm`, { paymentIntentId });
        setPhotos(prev => prev.map(p =>
          p.id === modal.photoId ? { ...p, url: data.url, is_purchased: true } : p
        ));
        toast.success('Foto desbloqueada');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al confirmar el pago');
    }
  };

  const handleOpenGallery = async (gallery) => {
    if (!gallery.unlocked) {
      toast(`Esta galería cuesta ${gallery.price_coins} monedas`, { icon: '🔒' });
    }
    setLoadingGallery(gallery.id);
    try {
      const { data } = await api.get(`/api/creator/galleries/${gallery.id}/items`);
      setOpenGallery({ ...gallery, items: data.items || [] });
    } catch (err) {
      if (err.response?.status === 403) {
        // show unlock dialog
        const ok = await confirm({
          title: `Desbloquear "${gallery.title}"`,
          message: `Esta galería cuesta ${gallery.price_coins} coins. Una vez desbloqueada tendrás acceso permanente.`,
          confirmLabel: `Desbloquear · ${gallery.price_coins} 🪙`,
        });
        if (ok) {
          try {
            const { data: unlockData } = await api.post(`/api/creator/galleries/${gallery.id}/unlock`);
            toast.success(`Galería desbloqueada. Monedas restantes: ${unlockData.coins_remaining}`);
            const { data } = await api.get(`/api/creator/galleries/${gallery.id}/items`);
            setOpenGallery({ ...gallery, items: data.items || [], unlocked: true });
            setGalleries(prev => prev.map(g => g.id === gallery.id ? { ...g, unlocked: true } : g));
          } catch (e) {
            if (e.response?.data?.code === 'INSUFFICIENT_COINS') {
              toast.error('Monedas insuficientes — recarga en la sección Monedas');
            } else {
              toast.error(e.response?.data?.error || 'Error al desbloquear');
            }
          }
        }
      } else {
        toast.error('Error al cargar la galería');
      }
    } finally {
      setLoadingGallery(null);
    }
  };

  const openRequestModal = async () => {
    setShowRequestModal(true);
    if (!packagesLoaded) {
      try {
        const { data } = await api.get(`/api/video-requests/packages/${userId}`);
        setVideoPackages(data.packages || []);
        setVideoMinPrice(data.min_price || 50);
        setVideoAccepts(data.accepts !== false);
        setRequestForm(f => ({ ...f, price: Math.max(data.min_price || 50, f.price) }));
      } catch {}
      setPackagesLoaded(true);
    }
  };

  const handleSendVideoRequest = async () => {
    if (!requestForm.message.trim()) { toast.error('Escribe un mensaje para el creador'); return; }
    const isPackage = !!requestForm.package_id;
    if (!isPackage && requestForm.price < videoMinPrice) {
      toast.error(`El precio mínimo es ${videoMinPrice} monedas`);
      return;
    }
    setSendingRequest(true);
    try {
      const payload = {
        creator_id: userId,
        message: requestForm.message.trim(),
      };
      if (isPackage) payload.package_id = requestForm.package_id;
      else           payload.price = requestForm.price;

      await api.post('/api/video-requests', payload);
      toast.success('Solicitud enviada. Monedas en escrow hasta la entrega.');
      setShowRequestModal(false);
      setRequestForm({ message: '', price: videoMinPrice, package_id: null });
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Monedas insuficientes — recarga en la sección Monedas');
      } else {
        toast.error(err.response?.data?.error || 'Error al enviar la solicitud');
      }
    } finally {
      setSendingRequest(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${profile.full_name} en Destino TV`,
      text: profile.bio || `Mira el perfil de ${profile.full_name}`,
      url: window.location.href,
    };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
      toast.success('Link copiado al portapapeles');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">
        {loadError?.status === 404 ? '🔍' : loadError?.status === 401 ? '🔑' : '⚠️'}
      </div>
      <h2 className="text-white font-bold text-lg mb-2">
        {loadError?.status === 404 ? 'Perfil no encontrado' : 'No se pudo cargar el perfil'}
      </h2>
      <p className="text-gray-400 text-sm mb-6 max-w-sm">
        {loadError?.message || 'Algo salió mal. Intenta de nuevo.'}
      </p>
      <div className="flex gap-2">
        {loadError?.status === 401 ? (
          <button
            onClick={() => navigate('/login')}
            className="bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            Iniciar sesión
          </button>
        ) : loadError?.status !== 404 && (
          <button
            onClick={() => { setLoadError(null); setLoading(true); setReloadKey(k => k + 1); }}
            className="bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            Reintentar
          </button>
        )}
        <button
          onClick={() => navigate(-1)}
          className="bg-dark-700 hover:bg-dark-600 text-gray-300 font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          Volver
        </button>
      </div>
    </div>
  );

  const isOwnProfile = currentUserId && currentUserId === userId;
  const hasSubscriptionOffer = profile.is_creator && !isOwnProfile && (profile.creator_subscription_price || creatorHasTiers);
  // Fotos de pago: is_paid=true AND (is_purchased=true → url visible, is_purchased=false → url null = locked)
  const paidPhotos = photos.filter(p => p.is_paid);
  const freePhotos = photos.filter(p => !p.is_paid);

  const isOnline = profile.last_active && (Date.now() - new Date(profile.last_active).getTime()) < 5 * 60 * 1000;
  const minTierPrice = creatorTiers.length > 0
    ? Math.min(...creatorTiers.map(t => parseFloat(t.price)))
    : (creatorLegacyPrice ?? profile.creator_subscription_price ?? null);
  const canMatch = !isOwnProfile && !profile.is_creator; // bottom bar Pasar/Like solo en perfiles "match-ables"

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="lg:max-w-6xl lg:mx-auto lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-6">
        {/* ═══════════════════ FOTO PRINCIPAL ═══════════════════ */}
        <div className="relative h-[55vh] lg:h-auto lg:rounded-3xl lg:overflow-hidden lg:aspect-[4/5] lg:sticky lg:top-6 lg:self-start">
          <img
            src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=600&background=1a1a2e&color=f43f5e`}
            alt={`Foto de perfil de ${profile.full_name || 'usuario'}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/20 to-transparent lg:from-black/70 lg:via-transparent" />

          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <FiArrowLeft />
          </button>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={handleShare}
              className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <FiShare2 size={17} />
            </button>
            <button
              onClick={() => setShowBlockModal(true)}
              className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <FiMoreVertical />
            </button>
          </div>

          {/* Overlay nombre/badges — solo en mobile, en desktop va en col derecha */}
          <div className="absolute bottom-0 left-0 right-0 p-5 lg:hidden">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
              </h1>
              {isOnline && (
                <span className="flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  En línea
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.premium_tier === 'vip' && (
                <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/30">👑 VIP</span>
              )}
              {(profile.premium_tier === 'premium' || (!profile.premium_tier && profile.is_premium)) && (
                <span className="bg-brand-500/20 text-brand-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand-500/30">⚡ Premium</span>
              )}
              {profile.is_verified && <VerifiedBadge size={18} />}
              {profile.is_creator && (
                <span className="bg-brand-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Creador</span>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════ INFO + ACCIONES ═══════════════════ */}
        <div className="px-5 pt-4 pb-28 lg:pb-12 lg:pt-0 space-y-4">
          {/* HEADER DESKTOP — nombre/badges visibles solo en lg+ */}
          <div className="hidden lg:block mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-4xl font-bold text-white tracking-tight">
                {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
              </h1>
              {isOnline && (
                <span className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/40 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  En línea
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.premium_tier === 'vip' && (
                <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-yellow-500/30">👑 VIP</span>
              )}
              {(profile.premium_tier === 'premium' || (!profile.premium_tier && profile.is_premium)) && (
                <span className="bg-brand-500/20 text-brand-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-brand-500/30">⚡ Premium</span>
              )}
              {profile.is_verified && <VerifiedBadge size={20} />}
              {profile.is_creator && (
                <span className="bg-brand-500/90 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Creador</span>
              )}
              {mySub?.tier && <TierBadge tier={mySub.tier} size="sm" showName />}
            </div>
          </div>

          {/* Stats row + Follow button */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={async () => {
                setShowFollowers(true);
                if (followers.length > 0) return;
                setLoadingFollowers(true);
                try {
                  const { data } = await api.get(`/api/follows/${userId}/followers`);
                  setFollowers(data.followers || []);
                } catch { }
                setLoadingFollowers(false);
              }}
              className="flex items-center gap-1.5 text-gray-300 text-sm hover:text-white transition-colors"
            >
              <FiUsers size={13} className="text-gray-500" />
              <strong className="text-white">{followersCount.toLocaleString()}</strong>
              <span className="text-gray-500">seguidores</span>
            </button>

            {profile.is_creator && subscribersCount > 0 && (
              <span className="flex items-center gap-1.5 text-gray-300 text-sm">
                <FiHeart size={13} className="text-pink-400" />
                <strong className="text-white">{subscribersCount.toLocaleString()}</strong>
                <span className="text-gray-500">suscriptores</span>
              </span>
            )}

            {profile.is_creator && postsCount > 0 && (
              <span className="flex items-center gap-1.5 text-gray-300 text-sm">
                <FiGrid size={13} className="text-gray-500" />
                <strong className="text-white">{postsCount}</strong>
                <span className="text-gray-500">posts</span>
              </span>
            )}

            {profile.profile_views > 0 && (
              <span className="text-gray-500 text-sm flex items-center gap-1">
                👁 {profile.profile_views.toLocaleString()}
              </span>
            )}

            {!isOwnProfile && (
              <button
                onClick={handleToggleFollow}
                disabled={togglingFollow}
                className={`ml-auto px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  following
                    ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                    : 'bg-brand-500 text-white hover:bg-brand-400'
                } disabled:opacity-50`}
              >
                <FiUserPlus size={11} />
                {following ? 'Siguiendo' : 'Seguir'}
              </button>
            )}
          </div>
        {/* Bio (más vistosa) */}
        {profile.bio && (
          <div className="card p-4">
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>
          </div>
        )}

        {/* CTA prominente de suscripción si es creador con tiers/precio */}
        {hasSubscriptionOffer && !subscribed && (
          <button
            onClick={() => setShowTierModal(true)}
            disabled={subscribing}
            className="w-full bg-gradient-to-r from-brand-500 to-pink-500 hover:from-brand-400 hover:to-pink-400 rounded-2xl p-4 flex items-center justify-between gap-3 text-left transition-all shadow-lg shadow-brand-500/20 disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
                <FiHeart className="text-white" size={20} />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Suscribirse</p>
                <p className="text-white/80 text-xs">
                  {creatorTiers.length > 1
                    ? `Desde $${minTierPrice?.toFixed(2)}/mes · ${creatorTiers.length} niveles`
                    : creatorTiers.length === 1
                      ? `${creatorTiers[0].badge_emoji} ${creatorTiers[0].name} · $${minTierPrice?.toFixed(2)}/mes`
                      : `$${minTierPrice?.toFixed(2)}/mes`}
                </p>
              </div>
            </div>
            <FiArrowRight className="text-white" size={18} />
          </button>
        )}

        {/* Preview de tiers para el propio creador (no se puede suscribir a sí mismo) */}
        {isOwnProfile && profile.is_creator && creatorTiers.length > 0 && (
          <div className="card p-4 border-brand-500/20 bg-gradient-to-br from-brand-500/5 to-transparent">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FiHeart className="text-pink-400" size={14} />
                <h3 className="text-white font-semibold text-sm">Tus niveles de suscripción</h3>
              </div>
              <button
                onClick={() => navigate('/creator/dashboard')}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
              >
                Editar <FiArrowRight size={11} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Así verán los fans tus niveles cuando entren a tu perfil:
            </p>
            <div className="space-y-2">
              {creatorTiers
                .slice()
                .sort((a, b) => (a.tier_level || 0) - (b.tier_level || 0))
                .map(tier => (
                  <div
                    key={tier.id}
                    className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                    style={{
                      backgroundColor: `${tier.badge_color}10`,
                      borderLeft: `3px solid ${tier.badge_color}`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{tier.badge_emoji}</span>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-bold truncate">{tier.name}</p>
                        {tier.description && (
                          <p className="text-[10px] text-gray-500 truncate">{tier.description}</p>
                        )}
                      </div>
                    </div>
                    <p className="font-bold text-sm shrink-0" style={{ color: tier.badge_color }}>
                      ${parseFloat(tier.price).toFixed(2)}
                      <span className="text-[10px] text-gray-500 font-normal">/mes</span>
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Mensaje si soy creador pero no tengo tiers configurados */}
        {isOwnProfile && profile.is_creator && creatorTiers.length === 0 && !creatorLegacyPrice && (
          <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-yellow-500/15 rounded-lg flex items-center justify-center shrink-0">
                <FiHeart className="text-yellow-400" size={16} />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-1">No tienes niveles de suscripción</p>
                <p className="text-gray-400 text-xs mb-3">
                  Configura tus tiers para que los fans puedan suscribirse y recibir contenido exclusivo.
                </p>
                <button
                  onClick={() => navigate('/creator/dashboard')}
                  className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  Configurar tiers <FiArrowRight size={11} />
                </button>
              </div>
            </div>
          </div>
        )}

        {subscribed && mySub && (
          <div className="card p-4 bg-green-500/5 border-green-500/30">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <FiCheck className="text-green-400" size={16} />
                <p className="text-green-400 font-semibold text-sm">Estás suscrito</p>
                {mySub.tier && <TierBadge tier={mySub.tier} size="xs" showName />}
                {mySub.is_gift && (
                  <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">🎁 Regalo</span>
                )}
              </div>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="text-[11px] text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <FiUserMinus size={10} />
                {cancelling ? 'Cancelando...' : 'Cancelar'}
              </button>
            </div>
            {mySub.current_period_end && (
              <p className="text-[11px] text-gray-500">
                Acceso hasta {new Date(mySub.current_period_end).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* Info básica del usuario (datos compactos) */}
        <div className="card p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {profile.gender && (
              <div>
                <p className="text-gray-500 text-xs">Género</p>
                <p className="text-white capitalize">{profile.gender}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500 text-xs">Miembro desde</p>
              <p className="text-white">
                {new Date(profile.created_at).toLocaleDateString('es', { month: 'short', year: 'numeric' })}
              </p>
            </div>
            {profile.country && (
              <div>
                <p className="text-gray-500 text-xs">País</p>
                <p className="text-white">{profile.country}</p>
              </div>
            )}
            {profile.is_creator && (
              <div>
                <p className="text-gray-500 text-xs">Tipo</p>
                <p className="text-white">{profile.is_adult_creator ? 'Creador +18' : 'Creador'}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Sección de CREADOR — rediseñada con grupos ──────────────────── */}
        {profile.is_creator && !isOwnProfile && (
          <div className="space-y-3">
            {profile.creator_bio && (
              <div className="card p-4 border-brand-500/20 bg-gradient-to-br from-brand-500/5 to-transparent">
                <p className="text-gray-200 text-sm leading-relaxed">{profile.creator_bio}</p>
              </div>
            )}

            {/* Grupo 1: APOYAR */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                <FiHeart size={11} /> Apoyar al creador
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowTipModal(true)}
                  className="bg-dark-700 hover:bg-dark-600 rounded-xl p-3 text-center transition-colors"
                >
                  <FiGift className="text-yellow-400 mx-auto mb-1.5" size={20} />
                  <p className="text-xs text-white font-medium">Propina</p>
                  <p className="text-[10px] text-gray-500">Envía coins</p>
                </button>
                {hasSubscriptionOffer && (
                  <button
                    onClick={() => setShowGiftModal(true)}
                    className="bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 rounded-xl p-3 text-center transition-colors"
                    title="Regala una suscripción a otro usuario"
                  >
                    <FiGift className="text-pink-400 mx-auto mb-1.5" size={20} />
                    <p className="text-xs text-pink-200 font-medium">Regalar sub</p>
                    <p className="text-[10px] text-pink-300/70">A otro fan</p>
                  </button>
                )}
              </div>
            </div>

            {/* Grupo 2: CONTENIDO */}
            <div className="card p-4">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                <FiVideo size={11} /> Contenido
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/shows"
                  className="bg-dark-700 hover:bg-dark-600 rounded-xl p-3 text-center transition-colors"
                >
                  <FiVideo className="text-brand-400 mx-auto mb-1.5" size={20} />
                  <p className="text-xs text-white font-medium">Ver shows</p>
                  <p className="text-[10px] text-gray-500">Lives + grabados</p>
                </Link>
                <button
                  onClick={openRequestModal}
                  className="bg-dark-700 hover:bg-dark-600 rounded-xl p-3 text-center transition-colors"
                >
                  <FiSend className="text-brand-400 mx-auto mb-1.5" size={20} />
                  <p className="text-xs text-white font-medium">Encargar video</p>
                  <p className="text-[10px] text-gray-500">Personalizado</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tip menu del creador (visible si tiene items) */}
        {profile.is_creator && profile.id !== currentUserId && (
          <TipMenuPublic creatorId={profile.id} creatorName={profile.full_name} />
        )}

        {/* ── Gate: contenido adulto requiere verificación de edad ───── */}
        {photosBlocked && profile.is_adult_creator && (
          <div className="card p-6 text-center border-pink-500/20 bg-pink-500/5">
            <div className="text-4xl mb-3" aria-hidden="true">🔞</div>
            <p className="text-white font-semibold mb-1">Contenido para mayores de 18</p>
            <p className="text-gray-500 text-sm mb-4">
              Este creador publica contenido +18. Verifica tu edad para acceder.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => { sessionStorage.removeItem('age_declined_at'); setShowAgeModal(true); }}
                className="bg-pink-500 hover:bg-pink-400 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                Verificar mi edad
              </button>
              <button
                onClick={() => navigate('/premium')}
                className="bg-dark-700 hover:bg-dark-600 text-gray-300 font-medium text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                O hazte VIP 👑
              </button>
            </div>
          </div>
        )}

        {/* ── Gate VIP genérico (no adult creator) ──────────────── */}
        {photosBlocked && !profile.is_adult_creator && (
          <div className="card p-6 text-center border-yellow-500/20 bg-yellow-500/5">
            <div className="text-4xl mb-3" aria-hidden="true">👑</div>
            <p className="text-white font-semibold mb-1">Contenido exclusivo VIP</p>
            <p className="text-gray-500 text-sm mb-4">Este creador publica contenido solo para miembros VIP.</p>
            <button
              onClick={() => navigate('/premium')}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm px-6 py-2.5 rounded-xl transition-colors"
            >
              Ver plan VIP 👑
            </button>
          </div>
        )}

        {/* ── Contenido del creador estilo OnlyFans: Feed / Fotos / Videos / Galerías / Shows ── */}
        {!photosBlocked && profile.is_creator && (
          <CreatorContentTabs
            creatorId={userId}
            creatorName={profile.full_name}
            isOwnProfile={isOwnProfile}
            subscribed={subscribed}
            paidPhotos={paidPhotos}
            freePhotos={freePhotos}
            videos={videos}
            galleries={galleries}
            userPosts={userPosts}
            shows={creatorShows}
            onBuyPhoto={handleBuyPhoto}
            buyingPhoto={buyingPhoto}
            onBuyVideo={handleBuyVideo}
            buyingVideo={buyingVideo}
            onOpenGallery={handleOpenGallery}
            loadingGallery={loadingGallery}
            onSubscribe={() => setShowTierModal(true)}
          />
        )}

        {/* Para perfiles NO creators, mostrar grid simple de fotos del usuario */}
        {!photosBlocked && !profile.is_creator && freePhotos.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <FiGrid size={13} /> Fotos
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {freePhotos.map(photo => (
                <div key={photo.id} className="aspect-square rounded-xl overflow-hidden bg-dark-700">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      </div>{/* cierra grid wrapper lg:max-w-6xl */}

      {/* Botones de acción fijos — solo en mobile y solo si el perfil es match-eable
          (no creator-only, no propio perfil). En desktop el botón Seguir+Mensaje vive en el header. */}
      {canMatch && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-dark-900/95 backdrop-blur-md border-t border-white/5 flex gap-3 lg:hidden">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <FiX /> Pasar
          </button>
          {profile.match_id && (
            <button
              onClick={() => navigate(`/call/${profile.match_id}`)}
              className="w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center text-green-400 hover:bg-dark-600 transition-colors shrink-0"
            >
              <FiVideo size={18} />
            </button>
          )}
          <button
            onClick={handleLike}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <FiHeart /> Me gusta
          </button>
        </div>
      )}

      {/* Si NO es match-eable y hay match_id, mostrar shortcut a video llamada */}
      {!canMatch && profile.match_id && !isOwnProfile && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-dark-900/95 backdrop-blur-md border-t border-white/5 flex gap-3 lg:hidden">
          <button
            onClick={() => navigate(`/messages?to=${userId}`)}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <FiMessageCircle size={16} /> Mensaje
          </button>
          <button
            onClick={() => navigate(`/call/${profile.match_id}`)}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <FiVideo size={16} /> Videollamada
          </button>
        </div>
      )}

      <AnimatePresence>
        {showBlockModal && (
          <BlockReportModal
            userId={userId}
            userName={profile.full_name}
            onClose={() => setShowBlockModal(false)}
            onBlocked={() => navigate(-1)}
          />
        )}
        {paymentModal && (
          <PaymentModal
            clientSecret={paymentModal.clientSecret}
            amount={paymentModal.amount}
            description={paymentModal.description}
            onSuccess={handlePaymentSuccess}
            onClose={() => setPaymentModal(null)}
          />
        )}
        {showTipModal && (
          <TipModal
            userId={userId}
            userName={profile.full_name}
            onClose={() => setShowTipModal(false)}
          />
        )}
        {showAgeModal && (
          <AgeVerificationModal
            onVerified={() => { setShowAgeModal(false); loadPhotos(); }}
            onClose={() => setShowAgeModal(false)}
          />
        )}
        {showTierModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowTierModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="bg-dark-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-dark-900 px-5 py-4 border-b border-dark-700 flex items-center justify-between">
                <h3 className="text-white font-bold">Suscribirse a {profile?.full_name}</h3>
                <button onClick={() => setShowTierModal(false)} className="text-gray-400 hover:text-white">
                  <FiX size={20} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <TierPicker creatorId={userId} onSelect={handleSubscribe} />
              </div>
            </motion.div>
          </motion.div>
        )}
        {showGiftModal && (
          <GiftSubModal
            creatorId={userId}
            creatorName={profile?.full_name}
            onClose={() => setShowGiftModal(false)}
            onSuccess={() => {/* opcional refresh */}}
          />
        )}
      </AnimatePresence>

      {/* Gallery lightbox */}
      <AnimatePresence>
        {openGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 shrink-0">
              <div>
                <h3 className="text-white font-bold">{openGallery.title}</h3>
                <p className="text-gray-500 text-xs">{openGallery.items?.length || 0} items</p>
              </div>
              <button onClick={() => setOpenGallery(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
                <FiX size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {(openGallery.items || []).map(item => (
                  <div key={item.id} className="aspect-square rounded-xl overflow-hidden bg-dark-800">
                    {item.media_type === 'video'
                      ? <video src={item.media_url} controls className="w-full h-full object-cover" />
                      : <img src={item.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    }
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      {/* ── Modal: encargar video ───────────────────────────── */}
      {showRequestModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowRequestModal(false); }}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="w-full max-w-md bg-dark-800 rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between sticky top-0 bg-dark-800 pb-2">
              <h3 className="text-white font-bold text-lg">Encargar video</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-500 hover:text-white">
                <FiX size={20} />
              </button>
            </div>

            {!videoAccepts ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">Este creador no acepta encargos en este momento.</p>
              </div>
            ) : (
              <>
                <p className="text-gray-400 text-xs">
                  Elige un paquete del catálogo de <span className="text-white font-medium">{profile?.full_name}</span> o pide un video personalizado.
                </p>

                {/* Catálogo de paquetes */}
                {videoPackages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Paquetes disponibles</p>
                    {videoPackages.map(pkg => {
                      const selected = requestForm.package_id === pkg.id;
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => setRequestForm(f => ({ ...f, package_id: selected ? null : pkg.id, price: selected ? videoMinPrice : pkg.price }))}
                          className={`w-full text-left rounded-xl p-3 border transition-all ${selected ? 'bg-brand-500/15 border-brand-500/50' : 'bg-dark-700 border-white/5 hover:border-white/15'}`}
                        >
                          <div className="flex items-center gap-3">
                            {pkg.cover_url && (
                              <img src={pkg.cover_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-white text-sm font-bold truncate">{pkg.title}</p>
                                <span className="flex items-center gap-1 text-yellow-400 text-sm font-black shrink-0">
                                  <FiZap size={12} /> {pkg.price.toLocaleString()}
                                </span>
                              </div>
                              {pkg.description && (
                                <p className="text-gray-500 text-[11px] mt-0.5 line-clamp-2">{pkg.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                                <span>⏱ {Math.round(pkg.max_duration_sec / 60 * 10) / 10} min</span>
                                <span>📅 {pkg.delivery_days}d</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Video personalizado */}
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{videoPackages.length > 0 ? 'O video personalizado' : 'Video personalizado'}</p>
                  <button
                    onClick={() => setRequestForm(f => ({ ...f, package_id: null, price: videoMinPrice }))}
                    className={`w-full text-left rounded-xl p-3 border transition-all ${!requestForm.package_id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-dark-700 border-white/5 hover:border-white/15'}`}
                  >
                    <p className="text-white text-sm font-bold flex items-center justify-between">
                      <span className="flex items-center gap-2">🎬 Video custom</span>
                      <span className="text-[10px] text-gray-500 font-normal">Desde {videoMinPrice} coins</span>
                    </p>
                    <p className="text-gray-500 text-[11px] mt-0.5">Tú decides el precio (mínimo {videoMinPrice} coins)</p>
                  </button>
                </div>

                {/* Mensaje */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Mensaje para el creador *</label>
                  <textarea
                    rows={3}
                    placeholder="Describe qué quieres que diga / haga..."
                    value={requestForm.message}
                    onChange={e => setRequestForm(f => ({ ...f, message: e.target.value }))}
                    maxLength={500}
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 resize-none focus:outline-none focus:border-brand-500/50"
                  />
                  <p className="text-right text-[10px] text-gray-600 mt-0.5">{requestForm.message.length}/500</p>
                </div>

                {/* Precio (solo si es custom) */}
                {!requestForm.package_id && (
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Precio ofrecido</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={videoMinPrice}
                        max={99999}
                        value={requestForm.price}
                        onChange={e => setRequestForm(f => ({ ...f, price: Math.max(videoMinPrice, parseInt(e.target.value) || videoMinPrice) }))}
                        className="flex-1 bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/50"
                      />
                      <FiZap className="text-yellow-400 shrink-0" size={16} />
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-600 text-center">
                  Total: <span className="text-yellow-400 font-bold">⚡{requestForm.price.toLocaleString()}</span> · escrow hasta entrega
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowRequestModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-dark-700 text-gray-400 text-sm font-semibold hover:bg-dark-600 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendVideoRequest}
                    disabled={sendingRequest || !requestForm.message.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingRequest
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><FiSend size={14} /> Enviar</>
                    }
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Modal seguidores */}
      {showFollowers && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={() => setShowFollowers(false)}>
          <div className="bg-dark-800 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white font-semibold text-sm">Seguidores · {followersCount.toLocaleString()}</p>
              <button onClick={() => setShowFollowers(false)} className="text-gray-500 hover:text-white"><FiX size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {loadingFollowers ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : followers.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Sin seguidores aún</p>
              ) : followers.map(f => (
                <Link key={f.id} to={`/profile/${f.id}`} onClick={() => setShowFollowers(false)} className="flex items-center gap-3 py-2.5 hover:bg-white/5 rounded-xl px-2 -mx-2 transition-colors">
                  <img src={f.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.full_name||'U')}&size=64&background=1a1a2e&color=f43f5e`} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                  <p className="text-white text-sm font-medium truncate">{f.full_name}</p>
                  {f.is_verified && <span className="text-brand-400 text-xs ml-auto shrink-0">✓</span>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      </AnimatePresence>
    </div>
  );
}
