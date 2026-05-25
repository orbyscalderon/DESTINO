import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCamera, FiEdit2, FiLogOut, FiStar, FiSettings, FiPlus, FiTrash2, FiSearch, FiShield, FiClock, FiLock, FiDollarSign, FiUsers, FiExternalLink, FiZap, FiBarChart2, FiChevronRight, FiMove, FiEyeOff, FiEye, FiShare2, FiFilm, FiPlay } from 'react-icons/fi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { COUNTRIES, LANGUAGES, countryByCode, languageByCode } from '../lib/geodata.js';
import FlagImg from '../components/ui/FlagImg.jsx';
import { compressAvatar, compressImage } from '../lib/imageCompressor.js';

const INTEREST_OPTIONS = [
  '🎵 Música', '🎬 Cine', '📚 Lectura', '✈️ Viajes', '🍳 Cocina',
  '💪 Fitness', '🎮 Gaming', '📸 Fotografía', '🎨 Arte', '🏖️ Playa',
  '🐶 Mascotas', '🌱 Naturaleza', '💃 Baile', '🎭 Teatro', '🏃 Correr',
  '🧘 Yoga', '🍷 Vinos', '☕ Café', '🎸 Guitarra', '🏋️ Gym',
];

const ZODIAC_SIGNS = [
  '♈ Aries', '♉ Tauro', '♊ Géminis', '♋ Cáncer',
  '♌ Leo', '♍ Virgo', '♎ Libra', '♏ Escorpio',
  '♐ Sagitario', '♑ Capricornio', '♒ Acuario', '♓ Piscis',
];


export default function Profile() {
  const { user, profile, fetchProfile, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pricingPhoto, setPricingPhoto] = useState(null); // { id, is_paid, price }
  const [videos, setVideos] = useState([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [pricingVideo, setPricingVideo] = useState(null); // { id, is_paid, price, title }
  const [videoTab, setVideoTab] = useState('gallery'); // 'gallery' | 'requests'
  const [videoRequests, setVideoRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [form, setForm] = useState({
    username: profile?.username || '',
    full_name: profile?.full_name || '',
    age: profile?.age || '',
    bio: profile?.bio || '',
    gender: profile?.gender || '',
    country: profile?.country || '',
    language: profile?.language || 'es',
    height: profile?.height || '',
    zodiac: profile?.zodiac || '',
    interests: profile?.interests || [],
  });
  const [countrySearch, setCountrySearch] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [incognito, setIncognito] = useState(false);
  const [togglingIncognito, setTogglingIncognito] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [coinsBalance, setCoinsBalance] = useState(0);
  const [streak, setStreak] = useState(0);
  const [boostSecsLeft, setBoostSecsLeft] = useState(0);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (profile?.streak_count !== undefined) setStreak(profile.streak_count);
    if (profile?.is_incognito !== undefined) setIncognito(profile.is_incognito);
  }, [profile?.streak_count, profile?.is_incognito]);

  useEffect(() => {
    if (!profile?.boosted_until) { setBoostSecsLeft(0); return; }
    const update = () => {
      const secs = Math.max(0, Math.floor((new Date(profile.boosted_until) - Date.now()) / 1000));
      setBoostSecsLeft(secs);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [profile?.boosted_until]);

  useEffect(() => {
    if (user?.id) {
      loadPhotos();
      loadVideos();
      api.get('/api/verification/status')
        .then(({ data }) => setVerificationStatus(data.verification?.status || null))
        .catch(() => {});
      api.get(`/api/follows/${user.id}/status`)
        .then(({ data }) => setFollowersCount(data.followers_count || 0))
        .catch(() => {});
      api.get('/api/coins/balance')
        .then(({ data }) => setCoinsBalance(data.coins || 0))
        .catch(() => {});
    }
  }, [user?.id]);

  // Al volver de Stripe Identity, consultar el resultado
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('verification') === 'complete') {
      navigate('/profile', { replace: true });
      setVerifying(true);
      api.post('/api/verification/check')
        .then(({ data }) => {
          setVerificationStatus(data.status);
          if (data.status === 'approved') {
            toast.success('¡Identidad verificada!');
            fetchProfile(user?.id);
          } else {
            toast('Verificación en proceso. Stripe la revisará pronto.', { icon: '🕐' });
          }
        })
        .catch(() => toast.error('Error al confirmar la verificación'))
        .finally(() => setVerifying(false));
    }
  }, [location.search]);

  const loadPhotos = async () => {
    try {
      const { data } = await api.get(`/api/profiles/${user.id}/photos`);
      setPhotos(data.photos || []);
    } catch {}
  };

  const loadVideos = async () => {
    try {
      const { data } = await api.get(`/api/profiles/${user.id}/videos`);
      setVideos(data.videos || []);
    } catch {}
  };

  const loadVideoRequests = async () => {
    setLoadingRequests(true);
    try {
      const { data } = await api.get('/api/video-requests/received');
      setVideoRequests(data.requests || []);
    } catch {} finally {
      setLoadingRequests(false);
    }
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploadingVideo(true);
    setVideoUploadProgress(0);
    const fd = new FormData();
    fd.append('video', file);
    fd.append('title', '');
    fd.append('is_paid', 'false');
    fd.append('price', '0');
    try {
      await api.post('/api/profiles/videos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      await loadVideos();
      toast.success('Video subido');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir el video');
    } finally {
      setUploadingVideo(false);
      setVideoUploadProgress(0);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    try {
      await api.delete(`/api/profiles/videos/${videoId}`);
      setVideos(v => v.filter(vid => vid.id !== videoId));
      toast.success('Video eliminado');
    } catch {
      toast.error('Error al eliminar el video');
    }
  };

  const handleSaveVideoPricing = async () => {
    if (!pricingVideo) return;
    try {
      await api.put(`/api/profiles/videos/${pricingVideo.id}/pricing`, {
        is_paid: pricingVideo.is_paid,
        price: pricingVideo.price,
      });
      setVideos(v => v.map(vid =>
        vid.id === pricingVideo.id
          ? { ...vid, is_paid: pricingVideo.is_paid, price: pricingVideo.price }
          : vid
      ));
      setPricingVideo(null);
      toast.success('Precio actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el precio');
    }
  };

  const handleVideoRequestAction = async (requestId, action) => {
    try {
      if (action === 'accept') await api.put(`/api/video-requests/${requestId}/accept`);
      if (action === 'reject') await api.put(`/api/video-requests/${requestId}/reject`);
      await loadVideoRequests();
      toast.success(action === 'accept' ? 'Solicitud aceptada' : 'Solicitud rechazada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const handleSave = async () => {
    if (form.username && !/^[a-z0-9_]{3,20}$/.test(form.username)) {
      return toast.error('Username: 3-20 caracteres, solo letras minúsculas, números y _');
    }
    setSaving(true);
    try {
      // Filtrar campos vacíos para no enviar strings vacíos al backend
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      await api.put(`/api/profiles/${user.id}`, payload);
      await fetchProfile(user.id);
      setEditing(false);
      toast.success('Perfil actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressAvatar(file);
    const fd = new FormData();
    fd.append('avatar', compressed);
    try {
      await api.post('/api/profiles/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await fetchProfile(user.id);
      toast.success('Foto actualizada');
    } catch {
      toast.error('Error al subir foto');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploadingPhoto(true);
    const compressed = await compressImage(file);
    const fd = new FormData();
    fd.append('photo', compressed);
    try {
      await api.post('/api/profiles/photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadPhotos();
      toast.success('Foto añadida');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleStartVerification = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post('/api/verification/start');
      window.location.href = data.url; // Redirect a Stripe Identity
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar la verificación');
      setVerifying(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    try {
      await api.delete(`/api/profiles/photos/${photoId}`);
      setPhotos(p => p.filter(ph => ph.id !== photoId));
      toast.success('Foto eliminada');
    } catch {
      toast.error('Error al eliminar foto');
    }
  };

  const handleDragStart = (idx) => setDragIdx(idx);

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setPhotos(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      setDragIdx(idx);
      return next;
    });
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await api.put('/api/profiles/photos/order', { photoIds: photos.map(p => p.id) });
    } catch {}
  };

  const toggleInterest = (tag) => {
    setForm(f => {
      const curr = f.interests || [];
      return {
        ...f,
        interests: curr.includes(tag) ? curr.filter(t => t !== tag) : curr.length < 8 ? [...curr, tag] : curr,
      };
    });
  };

  const handleSavePhotoPricing = async () => {
    if (!pricingPhoto) return;
    try {
      await api.put(`/api/profiles/photos/${pricingPhoto.id}/pricing`, {
        is_paid: pricingPhoto.is_paid,
        price: pricingPhoto.price,
      });
      setPhotos(p => p.map(ph =>
        ph.id === pricingPhoto.id
          ? { ...ph, is_paid: pricingPhoto.is_paid, price: pricingPhoto.price }
          : ph
      ));
      setPricingPhoto(null);
      toast.success('Precio actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el precio');
    }
  };

  const handleToggleIncognito = async () => {
    setTogglingIncognito(true);
    const next = !incognito;
    try {
      await api.put('/api/profiles/incognito', { enabled: next });
      setIncognito(next);
      toast.success(next ? 'Modo incógnito activado — no aparecerás en búsquedas' : 'Modo incógnito desactivado');
    } catch {
      toast.error('Error al cambiar el modo');
    } finally {
      setTogglingIncognito(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/#/profile/${user?.id}`;
    const shareData = { title: `${profile?.full_name} en Destino`, text: profile?.bio || 'Mira mi perfil en Destino', url };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Link copiado al portapapeles');
    }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-8 lg:px-10 lg:pt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Mi Perfil</h1>
        <div className="flex gap-2">
          <Link to="/settings" className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <FiSettings size={16} />
          </Link>
          <button onClick={logout} className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors">
            <FiLogOut size={16} />
          </button>
        </div>
      </div>

      {/* Layout: columna en móvil, 2 columnas en desktop */}
      <div className="max-w-4xl mx-auto lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start">

        {/* Columna izquierda: avatar + badges */}
        <div className="lg:sticky lg:top-8 space-y-3">

          {/* Hero card */}
          <div className="card p-5 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-transparent to-transparent pointer-events-none" />

            {/* Avatar */}
            <div className="relative inline-block mb-3">
              <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-full p-0.5 bg-gradient-to-br from-brand-500 to-purple-600 mx-auto">
                <img
                  src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || 'U')}&size=200&background=1a1a2e&color=f43f5e`}
                  alt=""
                  className="w-full h-full rounded-full object-cover bg-dark-900"
                />
              </div>
              <button
                onClick={() => fileRef.current.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center hover:bg-brand-600 transition-colors shadow-lg border-2 border-dark-900"
              >
                <FiCamera size={13} className="text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>

            {/* Nombre + badges */}
            <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
              <p className="text-lg font-black text-white">{profile?.full_name || '—'}</p>
              {profile?.is_verified && <VerifiedBadge size={20} />}
            </div>
            <p className="text-gray-500 text-sm mb-4">@{profile?.username || '—'}</p>

            {/* Badges */}
            <div className="flex justify-center flex-wrap gap-2 mb-4">
              {profile?.is_premium && (
                <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full border border-yellow-500/30">
                  ⚡ Premium
                </span>
              )}
              {profile?.is_creator && (
                <span className="bg-purple-500/20 text-purple-400 text-xs font-bold px-3 py-1 rounded-full border border-purple-500/30">
                  🎥 Creador
                </span>
              )}
              {profile?.is_adult_creator && (
                <span className="bg-red-500/15 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/20">18+</span>
              )}
              {streak >= 2 && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-orange-500/20 text-orange-400 text-xs font-bold px-3 py-1 rounded-full border border-orange-500/30 cursor-default"
                  title={`${streak} días de racha activa`}
                >
                  🔥 {streak} {streak === 1 ? 'día' : 'días'}
                </motion.span>
              )}
              {boostSecsLeft > 0 && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-orange-500/20 text-orange-400 text-xs font-bold px-3 py-1 rounded-full border border-orange-500/30 flex items-center gap-1"
                  title="Boost activo — tu perfil aparece primero"
                >
                  <FiZap size={10} />
                  {`${Math.floor(boostSecsLeft / 60)}:${String(boostSecsLeft % 60).padStart(2, '0')}`}
                </motion.span>
              )}
            </div>

            {/* Stats rápidos */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-dark-700/60 rounded-xl py-2">
                <p className="text-white font-black text-lg">{photos.length}</p>
                <p className="text-gray-500 text-[10px]">Fotos</p>
              </div>
              <div className="bg-dark-700/60 rounded-xl py-2">
                <p className="text-white font-black text-lg">{followersCount}</p>
                <p className="text-gray-500 text-[10px]">Seguidores</p>
              </div>
              <div className="bg-dark-700/60 rounded-xl py-2">
                <p className="text-yellow-400 font-black text-lg">{coinsBalance.toLocaleString()}</p>
                <p className="text-gray-500 text-[10px]">Coins</p>
              </div>
            </div>
          </div>

          {/* Barra de completitud del perfil */}
          {(() => {
            const steps = [
              { label: 'Foto de perfil', done: !!profile?.avatar_url,  pct: 20 },
              { label: 'Nombre',         done: !!profile?.full_name,   pct: 10 },
              { label: 'Edad',           done: !!profile?.age,         pct: 10 },
              { label: 'Biografía',      done: !!profile?.bio,         pct: 15 },
              { label: 'Género',         done: !!profile?.gender,      pct: 10 },
              { label: 'País',           done: !!profile?.country,     pct: 10 },
              { label: 'Idioma',         done: !!profile?.language,    pct: 10 },
              { label: 'Fotos extra',    done: photos.length > 0,      pct: 15 },
            ];
            const total = steps.filter(s => s.done).reduce((a, s) => a + s.pct, 0);
            if (total === 100) return null;
            const missing = steps.filter(s => !s.done);
            return (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">Completitud del perfil</p>
                  <span className={`text-sm font-black ${total >= 80 ? 'text-green-400' : total >= 50 ? 'text-yellow-400' : 'text-brand-400'}`}>{total}%</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                  <motion.div
                    className={`h-full rounded-full ${total >= 80 ? 'bg-green-500' : total >= 50 ? 'bg-yellow-400' : 'bg-brand-500'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${total}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <div className="space-y-1">
                  {missing.slice(0, 3).map(s => (
                    <button key={s.label} onClick={() => setEditing(true)} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-left">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0" />
                      <span>Añadir {s.label.toLowerCase()} +{s.pct}%</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Accesos rápidos */}
          <div className="card divide-y divide-white/5">
            <Link to="/coins" className="flex items-center gap-3 p-3.5 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                <FiZap size={14} className="text-yellow-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Mis Coins</p>
                <p className="text-xs text-gray-500">{coinsBalance.toLocaleString()} disponibles</p>
              </div>
              <FiChevronRight size={14} className="text-gray-600" />
            </Link>
            {profile?.is_creator && (
              <Link to="/creator/dashboard" className="flex items-center gap-3 p-3.5 hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 bg-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <FiBarChart2 size={14} className="text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Panel de Creador</p>
                  <p className="text-xs text-gray-500">Ingresos, shows y analytics</p>
                </div>
                <FiChevronRight size={14} className="text-gray-600" />
              </Link>
            )}
            <button
              onClick={handleToggleIncognito}
              disabled={togglingIncognito}
              className="flex items-center gap-3 p-3.5 w-full text-left hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${incognito ? 'bg-purple-500/20' : 'bg-dark-600'}`}>
                {incognito ? <FiEyeOff size={14} className="text-purple-400" /> : <FiEye size={14} className="text-gray-400" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Modo incógnito</p>
                <p className="text-xs text-gray-500">{incognito ? 'Activado — no apareces en búsquedas' : 'Desactivado — visible para todos'}</p>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors shrink-0 ${incognito ? 'bg-purple-500' : 'bg-dark-600'}`}>
                <div className={`w-3.5 h-3.5 bg-white rounded-full m-0.5 transition-transform ${incognito ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-3 p-3.5 w-full text-left hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 bg-dark-600 rounded-xl flex items-center justify-center shrink-0">
                <FiShare2 size={14} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Compartir perfil</p>
                <p className="text-xs text-gray-500">Envía tu link a quien quieras</p>
              </div>
            </button>

            <Link to="/settings" className="flex items-center gap-3 p-3.5 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 bg-dark-600 rounded-xl flex items-center justify-center shrink-0">
                <FiSettings size={14} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Configuración</p>
                <p className="text-xs text-gray-500">Privacidad, contraseña, notificaciones</p>
              </div>
              <FiChevronRight size={14} className="text-gray-600" />
            </Link>
          </div>

          {/* CTA Premium */}
          {!profile?.is_premium && (
            <Link to="/premium" className="card p-4 flex items-center gap-3 hover:border-yellow-500/30 transition-colors bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                <FiStar className="text-yellow-400" />
              </div>
              <div>
                <p className="font-medium text-white text-sm">Hazte Premium</p>
                <p className="text-gray-500 text-xs">Matches ilimitados · Ver quién te dio like</p>
              </div>
            </Link>
          )}

          {/* Verificación de identidad — solo usuarios Premium */}
          {profile?.is_premium && !profile?.is_verified && (
            <div className="card p-4">
              {verificationStatus === 'pending' ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <FiClock className="text-blue-400" size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">Verificación en proceso</p>
                    <p className="text-gray-500 text-xs">Stripe está revisando tu identidad</p>
                  </div>
                </div>
              ) : verificationStatus === 'rejected' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <FiShield className="text-red-400" size={18} />
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">Verificación no aprobada</p>
                      <p className="text-gray-500 text-xs">Intenta de nuevo con documentos más claros</p>
                    </div>
                  </div>
                  <button onClick={handleStartVerification} disabled={verifying} className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                    {verifying
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><FiExternalLink size={14} /> Reintentar con Stripe</>
                    }
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <FiShield className="text-blue-400" size={18} />
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">Verificar identidad</p>
                      <p className="text-gray-500 text-xs">Selfie + documento oficial · verificado por Stripe</p>
                    </div>
                  </div>
                  <button onClick={handleStartVerification} disabled={verifying} className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                    {verifying
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><FiExternalLink size={14} /> Verificar con Stripe</>
                    }
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Seguidores */}
          <div className="card p-4 flex items-center gap-3">
            <FiUsers className="text-brand-400" size={18} />
            <div>
              <p className="text-sm font-medium text-white">{followersCount.toLocaleString()} seguidores</p>
              <p className="text-xs text-gray-500">
                {followersCount === 0 ? 'Aún no tienes seguidores' : 'Personas que te siguen'}
              </p>
            </div>
          </div>
        </div>

        {/* Columna derecha: info + galería */}
        <div className="mt-6 lg:mt-0 space-y-4">
          {/* Info / Edición */}
          <div className="card p-5 lg:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-300">Información</h3>
              <button
                onClick={() => setEditing(v => !v)}
                className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1"
              >
                <FiEdit2 size={12} /> {editing ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            <div className="space-y-4">
              {editing ? (
                <>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">@</span>
                    <input
                      className="input-field pl-7"
                      placeholder="username"
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      maxLength={20}
                    />
                    {form.username.length > 0 && !/^[a-z0-9_]{3,20}$/.test(form.username) && (
                      <p className="text-xs text-brand-400 mt-1">3-20 caracteres, sin espacios ni mayúsculas</p>
                    )}
                  </div>
                  <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                    <input
                      className="input-field"
                      placeholder="Nombre"
                      value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    />
                    <input
                      className="input-field"
                      type="number"
                      placeholder="Edad"
                      value={form.age}
                      onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['male', 'female', 'other'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, gender: g }))}
                        className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                          form.gender === g ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                        }`}
                      >
                        {g === 'male' ? 'Hombre' : g === 'female' ? 'Mujer' : 'Otro'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input-field resize-none"
                    rows={4}
                    placeholder="Bio — cuéntale algo a los demás"
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    maxLength={500}
                  />

                  {/* País */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">País</p>
                    <div className="relative mb-1.5">
                      <FiSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        className="input-field pl-8 py-2 text-sm"
                        placeholder="Buscar país..."
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                      />
                    </div>
                    {countrySearch && (
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-white/5 bg-dark-800 divide-y divide-white/5 mb-1.5">
                        {COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => { setForm(f => ({ ...f, country: c.code, language: c.lang })); setCountrySearch(''); }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-300 hover:bg-dark-700"
                          >
                            <span>{c.flag}</span><span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.country && (
                      <p className="text-xs text-brand-400 flex items-center gap-1.5">
                        <FlagImg code={form.country} className="w-5 h-3.5 rounded-sm object-cover" />
                        {countryByCode(form.country)?.name}
                      </p>
                    )}
                  </div>

                  {/* Idioma */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Idioma principal</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {LANGUAGES.map(l => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, language: l.code }))}
                          className={`py-2 rounded-xl text-xs font-medium transition-all ${
                            form.language === l.code ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Altura y Signo zodiacal */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Altura (cm)</p>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="Ej: 175"
                        min="140" max="220"
                        value={form.height}
                        onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Signo zodiacal</p>
                      <select
                        className="input-field"
                        value={form.zodiac}
                        onChange={e => setForm(f => ({ ...f, zodiac: e.target.value }))}
                      >
                        <option value="">Seleccionar</option>
                        {ZODIAC_SIGNS.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Intereses */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Intereses <span className="text-gray-600 normal-case">(máx. 8)</span></p>
                      <span className="text-xs text-gray-600">{(form.interests || []).length}/8</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {INTEREST_OPTIONS.map(tag => {
                        const selected = (form.interests || []).includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleInterest(tag)}
                            className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                              selected
                                ? 'bg-brand-500/30 text-brand-300 border border-brand-500/50'
                                : 'bg-dark-700 text-gray-400 border border-white/5 hover:border-white/20'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button onClick={handleSave} disabled={saving} className="btn-primary w-full lg:w-auto lg:px-8">
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </>
              ) : (
                <>
                  <div className="grid lg:grid-cols-2 gap-4">
                    {[
                      { label: 'Nombre', value: profile?.full_name },
                      { label: 'Username', value: profile?.username ? `@${profile.username}` : null },
                      { label: 'Edad', value: profile?.age },
                      { label: 'Género', value: profile?.gender === 'male' ? 'Hombre' : profile?.gender === 'female' ? 'Mujer' : profile?.gender === 'other' ? 'Otro' : null },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-dark-700/50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                        <p className="text-white font-medium">{value || '—'}</p>
                      </div>
                    ))}
                    {profile?.country && (
                      <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-0.5">País</p>
                        <p className="text-white font-medium flex items-center gap-1.5">
                          <FlagImg code={profile.country} className="w-5 h-3.5 rounded-sm object-cover" />
                          {countryByCode(profile.country)?.name}
                        </p>
                      </div>
                    )}
                    {profile?.language && (
                      <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-0.5">Idioma</p>
                        <p className="text-white font-medium">{languageByCode(profile.language)?.name || profile.language}</p>
                      </div>
                    )}
                    {profile?.bio && (
                      <div className="lg:col-span-2 bg-dark-700/50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-1">Bio</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
                      </div>
                    )}
                    {(profile?.height || profile?.zodiac) && (
                      <>
                        {profile?.height && (
                          <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                            <p className="text-xs text-gray-500 mb-0.5">Altura</p>
                            <p className="text-white font-medium">{profile.height} cm</p>
                          </div>
                        )}
                        {profile?.zodiac && (
                          <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                            <p className="text-xs text-gray-500 mb-0.5">Signo</p>
                            <p className="text-white font-medium">{profile.zodiac}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {profile?.interests?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-2">Intereses</p>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.interests.map(tag => (
                          <span key={tag} className="text-xs px-3 py-1 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/25">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Galería de fotos */}
          <div className="card p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-300">Fotos del perfil</h3>
                {profile?.is_creator ? (
                  <p className="text-xs text-brand-400 mt-0.5">Mantén presionada una foto para ponerle precio</p>
                ) : (
                  <p className="text-xs text-gray-600 mt-0.5">Las ven las personas en sus matches</p>
                )}
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-lg bg-dark-700 text-gray-500">
                {photos.length} fotos
              </span>
            </div>

            <p className="text-xs text-gray-600 mb-2 flex items-center gap-1"><FiMove size={10} /> Arrastra para reordenar</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {photos.map((photo, idx) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`relative group aspect-square cursor-grab active:cursor-grabbing ${dragIdx === idx ? 'opacity-50 scale-95' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full h-full object-cover rounded-xl pointer-events-none"
                  />
                  {/* Badge de precio si es foto de pago */}
                  {photo.is_paid && (
                    <div className="absolute top-1.5 left-1.5 bg-brand-500 rounded-lg px-1.5 py-0.5 flex items-center gap-0.5">
                      <FiLock size={8} className="text-white" />
                      <span className="text-white text-[9px] font-bold">${photo.price}</span>
                    </div>
                  )}
                  {idx === 0 && (
                    <div className="absolute bottom-1.5 left-1.5 bg-black/60 rounded-lg px-1.5 py-0.5">
                      <span className="text-white text-[9px] font-bold">Principal</span>
                    </div>
                  )}
                  {/* Botones de acción al hacer hover */}
                  <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {profile?.is_creator && (
                      <button
                        onClick={() => setPricingPhoto({ id: photo.id, is_paid: photo.is_paid || false, price: photo.price || '' })}
                        className="w-7 h-7 bg-brand-500/80 rounded-full flex items-center justify-center hover:bg-brand-500"
                      >
                        <FiDollarSign size={12} className="text-white" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/80"
                    >
                      <FiTrash2 size={11} className="text-white" />
                    </button>
                  </div>
                </motion.div>
              ))}

              <button
                onClick={() => photoRef.current.click()}
                disabled={uploadingPhoto}
                className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1.5 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
              >
                {uploadingPhoto ? (
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <FiPlus className="text-gray-500" size={22} />
                    <span className="text-gray-600 text-[10px]">Agregar</span>
                  </>
                )}
              </button>
            </div>

            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />

            {/* Enlace al panel de creador */}
            {!profile?.is_creator && (
              <Link
                to="/become-creator"
                className="mt-4 flex items-center justify-center gap-2 text-xs text-brand-400 hover:text-brand-300"
              >
                <FiDollarSign size={12} /> Monetizar mis fotos
              </Link>
            )}
          </div>

          {/* ── Galería de vídeos ──────────────────────────── */}
          <div className="card p-5 lg:p-6">
            {!profile?.is_creator ? (
              <div className="flex flex-col items-center text-center py-4 gap-3">
                <FiFilm size={28} className="text-gray-700" />
                <div>
                  <p className="text-sm font-semibold text-white">Vídeos de pago</p>
                  <p className="text-xs text-gray-500 mt-0.5">Activa el modo creador para subir y vender vídeos</p>
                </div>
                <Link to="/become-creator" className="btn-primary text-xs px-5 py-2">Ser Creador</Link>
              </div>
            ) : (
              <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-300 flex items-center gap-2"><FiFilm size={15} /> Vídeos</h3>
                  <p className="text-xs text-gray-600 mt-0.5">Los fans pueden comprarlos con coins</p>
                </div>
                <div className="flex gap-1">
                  {['gallery','requests'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => { setVideoTab(tab); if (tab === 'requests') loadVideoRequests(); }}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-all ${videoTab === tab ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'}`}
                    >
                      {tab === 'gallery' ? 'Mis vídeos' : 'Solicitudes'}
                    </button>
                  ))}
                </div>
              </div>

              {videoTab === 'gallery' && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {videos.map(vid => (
                      <div key={vid.id} className="relative group aspect-video bg-dark-700 rounded-xl overflow-hidden">
                        <video
                          src={vid.url}
                          className="w-full h-full object-cover"
                          preload="metadata"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <FiPlay size={20} className="text-white/70" />
                        </div>
                        {vid.is_paid && (
                          <div className="absolute top-1.5 left-1.5 bg-brand-500 rounded-lg px-1.5 py-0.5 flex items-center gap-0.5">
                            <FiLock size={8} className="text-white" />
                            <span className="text-white text-[9px] font-bold">{vid.price}c</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl">
                          <button
                            onClick={() => setPricingVideo({ id: vid.id, is_paid: vid.is_paid || false, price: vid.price || '', title: vid.title || '' })}
                            className="w-8 h-8 bg-brand-500/80 rounded-full flex items-center justify-center hover:bg-brand-500"
                          >
                            <FiDollarSign size={12} className="text-white" />
                          </button>
                          <button
                            onClick={() => handleDeleteVideo(vid.id)}
                            className="w-8 h-8 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/80"
                          >
                            <FiTrash2 size={12} className="text-white" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => videoRef.current.click()}
                      disabled={uploadingVideo}
                      className="aspect-video rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1.5 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all overflow-hidden relative"
                    >
                      {uploadingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-brand-400 text-[10px] font-semibold">{videoUploadProgress}%</span>
                          {videoUploadProgress > 0 && (
                            <div className="absolute bottom-0 left-0 h-1 bg-brand-500 transition-all" style={{ width: `${videoUploadProgress}%` }} />
                          )}
                        </>
                      ) : (
                        <>
                          <FiPlus className="text-gray-500" size={20} />
                          <span className="text-gray-600 text-[10px]">Subir vídeo</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    ref={videoRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </>
              )}

              {videoTab === 'requests' && (
                <div className="space-y-3">
                  {loadingRequests ? (
                    <div className="flex justify-center py-6">
                      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : videoRequests.length === 0 ? (
                    <p className="text-center text-gray-500 text-sm py-6">Sin solicitudes pendientes</p>
                  ) : videoRequests.map(req => (
                    <div key={req.id} className="bg-dark-700/50 rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={req.requester?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requester?.full_name || '?')}&size=60&background=1a1a2e&color=f43f5e`}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                          alt=""
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white truncate">{req.requester?.full_name}</p>
                            <span className="text-yellow-400 text-xs font-bold shrink-0">{req.price} coins</span>
                          </div>
                          {req.message && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{req.message}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                              req.status === 'accepted' ? 'bg-blue-500/20 text-blue-400' :
                              req.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {req.status === 'pending' ? 'Pendiente' : req.status === 'accepted' ? 'Aceptada' : req.status === 'completed' ? 'Completada' : 'Rechazada'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleVideoRequestAction(req.id, 'reject')}
                            className="flex-1 py-1.5 rounded-lg bg-dark-600 text-gray-400 text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          >
                            Rechazar
                          </button>
                          <button
                            onClick={() => handleVideoRequestAction(req.id, 'accept')}
                            className="flex-1 py-1.5 rounded-lg bg-brand-500 text-white text-xs hover:bg-brand-600 transition-colors"
                          >
                            Aceptar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
            )}
          </div>

          {/* Modal de pricing de foto */}
          {pricingPhoto && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6 w-full max-w-sm"
              >
                <h3 className="text-lg font-bold text-white mb-4">Precio de la foto</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm">Foto de pago</span>
                    <button
                      onClick={() => setPricingPhoto(p => ({ ...p, is_paid: !p.is_paid }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${pricingPhoto.is_paid ? 'bg-brand-500' : 'bg-dark-600'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${pricingPhoto.is_paid ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  {pricingPhoto.is_paid && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input
                        className="input-field pl-7"
                        type="number"
                        placeholder="Precio"
                        value={pricingPhoto.price}
                        onChange={e => setPricingPhoto(p => ({ ...p, price: e.target.value }))}
                        min="0.01"
                        step="0.01"
                        max="999"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setPricingPhoto(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleSavePhotoPricing} className="btn-primary flex-1">Guardar</button>
                </div>
              </motion.div>
            </div>
          )}
          {/* Modal de pricing de vídeo */}
          {pricingVideo && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6 w-full max-w-sm"
              >
                <h3 className="text-lg font-bold text-white mb-4">Precio del vídeo</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm">Vídeo de pago</span>
                    <button
                      onClick={() => setPricingVideo(p => ({ ...p, is_paid: !p.is_paid }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${pricingVideo.is_paid ? 'bg-brand-500' : 'bg-dark-600'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${pricingVideo.is_paid ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  {pricingVideo.is_paid && (
                    <div className="relative">
                      <FiZap className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-400" size={14} />
                      <input
                        className="input-field pl-8"
                        type="number"
                        placeholder="Precio en coins"
                        value={pricingVideo.price}
                        onChange={e => setPricingVideo(p => ({ ...p, price: e.target.value }))}
                        min="1"
                        max="9999"
                      />
                      <p className="text-xs text-gray-500 mt-1">Recibirás el 80% (el 20% es la comisión de la plataforma)</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={() => setPricingVideo(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleSaveVideoPricing} className="btn-primary flex-1">Guardar</button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
