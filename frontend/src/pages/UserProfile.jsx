import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiHeart, FiX, FiMoreVertical, FiLock, FiZap, FiCheck, FiVideo, FiUserMinus, FiShare2, FiUserPlus, FiUsers, FiGrid, FiMessageCircle, FiGift, FiImage, FiFilm, FiPlay } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import BlockReportModal from '../components/ui/BlockReportModal.jsx';
import PaymentModal from '../components/ui/PaymentModal.jsx';
import AgeVerificationModal from '../components/ui/AgeVerificationModal.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import TipModal from '../components/ui/TipModal.jsx';

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
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
  const [userPosts, setUserPosts] = useState([]);
  const [postsTab, setPostsTab] = useState('photos'); // 'photos' | 'posts' | 'videos'
  const [videos, setVideos] = useState([]);
  const [buyingVideo, setBuyingVideo] = useState(null);
  const [showTipModal, setShowTipModal]   = useState(false);
  const [galleries, setGalleries]         = useState([]);
  const [openGallery, setOpenGallery]     = useState(null); // { id, title, items: [] }
  const [loadingGallery, setLoadingGallery] = useState(null);
  const [showAgeModal, setShowAgeModal]     = useState(false);
  const [photosBlocked, setPhotosBlocked]   = useState(false);

  const loadPhotos = async () => {
    const phRes = await api.get(`/api/profiles/${userId}/photos`).catch(() => ({ data: { photos: [], requires_age_verification: false } }));
    if (phRes.data.requires_age_verification) {
      setPhotosBlocked(true);
    } else {
      setPhotos(phRes.data.photos || []);
      setPhotosBlocked(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get(`/api/profiles/${userId}`),
      api.get(`/api/profiles/${userId}/photos`).catch(() => ({ data: { photos: [], requires_age_verification: false } })),
      api.get(`/api/follows/${userId}/status`).catch(() => ({ data: { following: false, followers_count: 0 } })),
      api.get(`/api/posts/user/${userId}?limit=12`).catch(() => ({ data: { posts: [] } })),
      api.get(`/api/creator/${userId}/galleries`).catch(() => ({ data: { galleries: [] } })),
      api.get(`/api/profiles/${userId}/videos`).catch(() => ({ data: { videos: [] } })),
    ]).then(([pRes, phRes, followRes, postsRes, galRes, vidRes]) => {
      const p = pRes.data.profile;
      setProfile(p);
      setSubscribed(!!p.is_subscribed);
      if (phRes.data.requires_age_verification) {
        setPhotosBlocked(true);
      } else {
        setPhotos(phRes.data.photos || []);
      }
      setFollowing(followRes.data.following);
      setFollowersCount(followRes.data.followers_count || 0);
      setUserPosts(postsRes.data.posts || []);
      setGalleries(galRes.data.galleries || []);
      setVideos(vidRes.data.videos || []);
    }).catch(() => toast.error('Perfil no encontrado'))
      .finally(() => setLoading(false));
  }, [userId]);

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

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { data } = await api.post(`/api/creator/${userId}/subscribe`);
      setPaymentModal({
        clientSecret: data.clientSecret,
        type: 'subscribe',
        amount: `$${parseFloat(profile.creator_subscription_price).toFixed(2)}`,
        description: `Suscripción a ${profile.full_name}`,
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
        if (confirm(`Desbloquear galería "${gallery.title}" por ${gallery.price_coins} monedas?`)) {
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

  const handleShare = async () => {
    const shareData = {
      title: `${profile.full_name} en Destino`,
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

  if (!profile) return null;

  const hasSubscriptionOffer = profile.is_creator && profile.creator_subscription_price;
  // Fotos de pago: is_paid=true AND (is_purchased=true → url visible, is_purchased=false → url null = locked)
  const paidPhotos = photos.filter(p => p.is_paid);
  const freePhotos = photos.filter(p => !p.is_paid);

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Foto principal */}
      <div className="relative h-[55vh]">
        <img
          src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=600&background=1a1a2e&color=f43f5e`}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
        >
          <FiArrowLeft />
        </button>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            onClick={handleShare}
            className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
          >
            <FiShare2 size={17} />
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
          >
            <FiMoreVertical />
          </button>
        </div>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold text-white">
              {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
            </h1>
            {profile.last_active && (Date.now() - new Date(profile.last_active).getTime()) < 5 * 60 * 1000 && (
              <span className="flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                En línea
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {profile.is_premium && (
              <span className="bg-yellow-500/80 text-black text-xs font-bold px-2 py-0.5 rounded-full">⚡ PREMIUM</span>
            )}
            {profile.is_verified && <VerifiedBadge size={20} />}
            {profile.is_creator && (
              <span className="bg-brand-500/80 text-white text-xs font-bold px-2 py-0.5 rounded-full">Creador</span>
            )}
            <span className="bg-dark-700/80 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <FiUsers size={9} /> {followersCount.toLocaleString()}
            </span>
            {profile.profile_views > 0 && (
              <span className="bg-dark-700/80 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full">
                👁 {profile.profile_views.toLocaleString()}
              </span>
            )}
          </div>

          {/* Follow button */}
          <button
            onClick={handleToggleFollow}
            disabled={togglingFollow}
            className={`mt-3 px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              following
                ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                : 'bg-brand-500/80 text-white hover:bg-brand-500'
            } disabled:opacity-50`}
          >
            <FiUserPlus size={11} />
            {following ? 'Siguiendo' : 'Seguir'}
          </button>
        </div>
      </div>

      {/* Info + Creator */}
      <div className="px-6 pt-4 pb-28 space-y-4">
        {profile.bio && (
          <div className="card p-4">
            <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
          </div>
        )}

        <div className="card p-4 text-sm space-y-2">
          {profile.gender && (
            <div className="flex justify-between">
              <span className="text-gray-500">Género</span>
              <span className="text-white capitalize">{profile.gender}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">En Destino desde</span>
            <span className="text-white">
              {new Date(profile.created_at).toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* ── Sección de creador ──────────────────────────── */}
        {profile.is_creator && (
          <div className="card p-5 border-brand-500/20">
            <div className="flex items-center gap-2 mb-3">
              <FiVideo className="text-brand-400" size={16} />
              <h2 className="font-semibold text-gray-300">Contenido de creador</h2>
            </div>

            {profile.creator_bio && (
              <p className="text-gray-400 text-sm mb-4">{profile.creator_bio}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              {/* Ver shows */}
              <Link
                to="/shows"
                className="flex-1 min-w-[80px] bg-dark-700 rounded-xl p-3 text-center hover:bg-dark-600 transition-colors"
              >
                <FiVideo className="text-brand-400 mx-auto mb-1" size={18} />
                <p className="text-xs text-gray-400">Ver shows</p>
              </Link>

              {/* Propina */}
              <button
                onClick={() => setShowTipModal(true)}
                className="flex-1 min-w-[80px] bg-dark-700 rounded-xl p-3 text-center hover:bg-dark-600 transition-colors"
              >
                <FiGift className="text-yellow-400 mx-auto mb-1" size={18} />
                <p className="text-xs text-gray-400">Propina</p>
              </button>

              {/* Suscripción mensual */}
              {hasSubscriptionOffer && (
                subscribed ? (
                  <div className="flex-1 min-w-[80px] space-y-2">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                      <FiCheck className="text-green-400 mx-auto mb-1" size={18} />
                      <p className="text-xs text-green-400 font-medium">Suscrito</p>
                    </div>
                    <button
                      onClick={handleCancelSubscription}
                      disabled={cancelling}
                      className="w-full text-[11px] text-gray-500 hover:text-red-400 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <FiUserMinus size={11} />
                      {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="flex-1 min-w-[120px] btn-primary py-3 text-sm disabled:opacity-60"
                  >
                    {subscribing ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      <>Suscribir · ${parseFloat(profile.creator_subscription_price).toFixed(2)}/mes</>
                    )}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ── Gate de verificación de edad ────────────────── */}
        {photosBlocked && (
          <div className="card p-6 text-center border-red-500/20">
            <div className="text-4xl mb-3">🔞</div>
            <p className="text-white font-semibold mb-1">Contenido para adultos</p>
            <p className="text-gray-500 text-sm mb-4">Este creador publica contenido solo para mayores de 18 años.</p>
            <button
              onClick={() => setShowAgeModal(true)}
              className="btn-primary text-sm px-6 py-2.5"
            >
              Verificar mi edad para ver el contenido
            </button>
          </div>
        )}

        {/* ── Fotos exclusivas (de pago) ───────────────────── */}
        {!photosBlocked && paidPhotos.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <FiLock size={13} /> Fotos exclusivas
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {paidPhotos.map(photo => {
                // url existe sólo si ya está comprada (backend la oculta si no)
                const unlocked = !!photo.url || photo.is_purchased;
                return (
                  <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-dark-700">
                    {unlocked ? (
                      <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <>
                        {/* Fondo blur decorativo */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 to-dark-800" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
                          <FiLock className="text-brand-400" size={22} />
                          <p className="text-white text-xs font-bold">${photo.price}</p>
                          <button
                            onClick={() => handleBuyPhoto(photo)}
                            disabled={buyingPhoto === photo.id}
                            className="text-[10px] bg-brand-500 hover:bg-brand-600 text-white px-3 py-1 rounded-lg mt-0.5 transition-colors disabled:opacity-60"
                          >
                            {buyingPhoto === photo.id ? '...' : 'Desbloquear'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Galerías privadas ───────────────────────────── */}
        {galleries.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <FiImage size={13} /> Galerías
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {galleries.map(gallery => (
                <button
                  key={gallery.id}
                  onClick={() => handleOpenGallery(gallery)}
                  disabled={loadingGallery === gallery.id}
                  className="relative rounded-2xl overflow-hidden bg-dark-700 aspect-[3/2] text-left hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {gallery.cover_url ? (
                    <img src={gallery.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-dark-600">
                      <FiImage className="text-gray-600" size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
                  {!gallery.unlocked && (
                    <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                      <FiLock size={11} className="text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p className="text-white text-xs font-semibold truncate">{gallery.title}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-400 text-[10px]">{gallery.items_count} items</span>
                      {!gallery.unlocked && gallery.price_coins > 0 && (
                        <span className="text-brand-400 text-[10px] font-bold flex items-center gap-0.5">
                          <FiZap size={8} /> {gallery.price_coins}
                        </span>
                      )}
                    </div>
                  </div>
                  {loadingGallery === gallery.id && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Fotos / Momentos / Vídeos ──────────────── */}
        {!photosBlocked && (freePhotos.length > 0 || userPosts.length > 0 || videos.length > 0) && (
          <div>
            <div className="flex gap-0 mb-3 bg-dark-700/60 rounded-xl p-1">
              <button
                onClick={() => setPostsTab('photos')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  postsTab === 'photos' ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <FiGrid size={12} /> Fotos {freePhotos.length > 0 && `(${freePhotos.length})`}
              </button>
              <button
                onClick={() => setPostsTab('posts')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  postsTab === 'posts' ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <FiMessageCircle size={12} /> Momentos {userPosts.length > 0 && `(${userPosts.length})`}
              </button>
              {videos.length > 0 && (
                <button
                  onClick={() => setPostsTab('videos')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    postsTab === 'videos' ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <FiFilm size={12} /> Vídeos ({videos.length})
                </button>
              )}
            </div>

            {postsTab === 'photos' && freePhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {freePhotos.map(photo => (
                  <div key={photo.id} className="aspect-square rounded-xl overflow-hidden bg-dark-700">
                    <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            )}

            {postsTab === 'posts' && (
              userPosts.length === 0 ? (
                <p className="text-center text-gray-600 text-sm py-6">Sin publicaciones aún</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {userPosts.map(post => (
                    <div key={post.id} className="relative aspect-square rounded-xl overflow-hidden bg-dark-700">
                      {post.locked ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <FiLock className="text-gray-600" size={20} />
                        </div>
                      ) : post.blurred ? (
                        <div className="w-full h-full flex items-center justify-center bg-dark-600">
                          <span className="text-xs text-gray-500">18+</span>
                        </div>
                      ) : post.media_url ? (
                        <img src={post.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-gray-400 text-[10px] text-center line-clamp-4">{post.caption}</p>
                        </div>
                      )}
                      {post.likes_count > 0 && (
                        <div className="absolute bottom-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                          <FiHeart size={8} className="text-red-400 fill-current" />
                          <span className="text-white text-[9px]">{post.likes_count}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {postsTab === 'videos' && (
              <div className="grid grid-cols-2 gap-2">
                {videos.map(vid => {
                  const unlocked = !!vid.url;
                  return (
                    <div key={vid.id} className="relative aspect-video rounded-xl overflow-hidden bg-dark-700">
                      {unlocked ? (
                        <>
                          <video src={vid.url} className="w-full h-full object-cover" preload="metadata" controls />
                          {vid.title && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-2">
                              <p className="text-white text-[10px] font-medium truncate">{vid.title}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 to-dark-800 flex flex-col items-center justify-center gap-2 p-3">
                            <FiPlay size={22} className="text-white/60" />
                            <FiLock size={14} className="text-brand-400" />
                            {vid.title && <p className="text-white text-[10px] font-medium text-center truncate w-full">{vid.title}</p>}
                            <div className="flex items-center gap-1 text-yellow-400">
                              <FiZap size={10} />
                              <span className="text-xs font-bold">{vid.price} coins</span>
                            </div>
                            <button
                              onClick={() => handleBuyVideo(vid)}
                              disabled={buyingVideo === vid.id}
                              className="text-[10px] bg-brand-500 hover:bg-brand-600 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-60"
                            >
                              {buyingVideo === vid.id ? '...' : 'Desbloquear'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botones de acción fijos */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-dark-900/95 backdrop-blur-md border-t border-white/5 flex gap-3">
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
      </AnimatePresence>
    </div>
  );
}
