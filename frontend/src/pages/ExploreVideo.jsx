import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiThumbsUp, FiThumbsDown, FiEye, FiShare2,
  FiPlus, FiClock, FiUser, FiCheck, FiCode,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import VRVideoPlayer from '../components/ui/VRVideoPlayer.jsx';
import AdultVideoPlayer from '../components/ui/AdultVideoPlayer.jsx';
import VideoCommentsSection from '../components/ui/VideoCommentsSection.jsx';
import TipModal from '../components/ui/TipModal.jsx';

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

export default function ExploreVideo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [voting, setVoting]     = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [ageOk, setAgeOk]       = useState(isAgeVerified());
  const [captions, setCaptions] = useState([]);
  const [costars, setCostars]   = useState([]);
  const [showTip, setShowTip]   = useState(false);

  const videoRef = useRef(null);
  const viewReportedRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/explore/videos/${id}`);
      setData(data);
      viewReportedRef.current = false;
    } catch (err) {
      if (err.response?.status === 451) {
        toast.error('Contenido no disponible en tu región');
        navigate('/home');
      } else if (err.response?.status === 403 && err.response?.data?.code === 'AGE_VERIFICATION_REQUIRED') {
        setAgeOk(false);
      } else {
        toast.error('Video no encontrado');
        navigate('/explore');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ageOk) return;
    load();
  }, [id, ageOk]);

  // v73: cargar captions + co-stars del video
  useEffect(() => {
    if (!ageOk || !id) return;
    api.get(`/api/adult-video/captions/${id}`).then(r => setCaptions(r.data?.captions || [])).catch(() => {});
    api.get(`/api/adult-video/costars/by-video/${id}`).then(r => setCostars(r.data?.costars || [])).catch(() => {});
  }, [id, ageOk]);

  // Reportar vista cuando el usuario lleva 5 segundos viendo
  useEffect(() => {
    if (!videoRef.current || !data?.video) return;
    const v = videoRef.current;
    const handler = () => {
      if (viewReportedRef.current) return;
      if (v.currentTime >= 5) {
        viewReportedRef.current = true;
        api.post(`/api/explore/videos/${id}/view`, { duration: Math.floor(v.currentTime) }).catch(() => {});
      }
    };
    v.addEventListener('timeupdate', handler);
    return () => v.removeEventListener('timeupdate', handler);
  }, [data?.video?.id]);

  const handleVote = async (value) => {
    if (voting) return;
    setVoting(true);
    try {
      const { data: result } = await api.post(`/api/explore/videos/${id}/rate`, { value });
      setData(d => ({ ...d, video: { ...d.video, ...result } }));
    } catch {
      toast.error('Error al votar');
    } finally {
      setVoting(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      const { data } = await api.get('/api/explore/playlists');
      setPlaylists(data?.playlists || []);
    } catch {}
  };

  const addToPlaylist = async (playlistId) => {
    try {
      await api.post(`/api/explore/playlists/${playlistId}/items`, { video_id: id });
      toast.success('Agregado a la lista');
      setShowPlaylistMenu(false);
    } catch {
      toast.error('Error');
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/#/explore/v/${id}`;
    if (navigator.share) {
      try { await navigator.share({ title: data?.video?.title, url }); }
      catch {}
    } else {
      navigator.clipboard?.writeText(url);
      toast.success('Link copiado');
    }
  };

  if (!ageOk) return <AgeGate onVerified={() => setAgeOk(true)} />;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data?.video) return null;
  const { video, up_next } = data;
  const totalVotes = video.rating_up + video.rating_down;
  const ratingPct  = totalVotes > 0 ? Math.round((video.rating_up / totalVotes) * 100) : null;
  const embedCode  = `<iframe src="${window.location.origin.replace(/^http(s?):/, 'http$1:').replace(/#\/.*$/, '')}/embed/v/${id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;

  return (
    <div className="min-h-screen pb-24 bg-dark-900">
      <div className="max-w-5xl mx-auto">
        {/* v73: Player — AdultVideoPlayer con speed/PiP/loop/sprite/skip-intro/floating-tip */}
        <div className="bg-black relative">
          <div className="aspect-video">
            <AdultVideoPlayer
              video={video}
              captions={captions}
              onTipClick={video.user_id ? () => setShowTip(true) : undefined}
              autoPlay
            />
          </div>
          <button onClick={() => navigate(-1)}
            className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-sm rounded-xl px-2.5 py-1.5 text-white">
            <FiArrowLeft size={16} />
          </button>
        </div>

        {/* Info */}
        <div className="px-4 py-4 space-y-3">
          <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">{video.title}</h1>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><FiEye size={11} /> {fmtViews(video.views_count)} vistas</span>
              <span>·</span>
              <span className="flex items-center gap-1"><FiClock size={11} /> {fmtDuration(video.duration_seconds)}</span>
              {ratingPct !== null && (
                <>
                  <span>·</span>
                  <span className={ratingPct >= 70 ? 'text-green-400' : ratingPct >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                    {ratingPct}% positivo
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Tags */}
          {video.tags?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {video.tags.map(t => (
                <Link key={t.slug} to={`/explore?tag=${t.slug}`}
                  className="text-[11px] bg-dark-800 hover:bg-dark-700 text-brand-300 px-2.5 py-1 rounded-full font-medium">
                  #{t.slug}
                </Link>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleVote(1)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                video.my_vote === 1 ? 'bg-green-500/20 text-green-400' : 'bg-dark-800 text-gray-300 hover:bg-dark-700'
              }`}>
              <FiThumbsUp size={13} /> {video.rating_up}
            </button>
            <button onClick={() => handleVote(-1)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                video.my_vote === -1 ? 'bg-red-500/20 text-red-400' : 'bg-dark-800 text-gray-300 hover:bg-dark-700'
              }`}>
              <FiThumbsDown size={13} /> {video.rating_down}
            </button>
            <button onClick={share}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-dark-800 text-gray-300 hover:bg-dark-700">
              <FiShare2 size={13} /> Compartir
            </button>
            <div className="relative">
              <button
                onClick={() => { setShowPlaylistMenu(s => !s); if (!playlists.length) loadPlaylists(); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-dark-800 text-gray-300 hover:bg-dark-700">
                <FiPlus size={13} /> Guardar
              </button>
              <AnimatePresence>
                {showPlaylistMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                    className="absolute z-20 top-full mt-1 right-0 min-w-[180px] bg-dark-800 border border-white/10 rounded-xl p-1 shadow-2xl"
                  >
                    {playlists.length === 0 && (
                      <p className="text-xs text-gray-500 px-3 py-2">No tienes listas</p>
                    )}
                    {playlists.map(p => (
                      <button key={p.id} onClick={() => addToPlaylist(p.id)}
                        className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 rounded flex items-center justify-between">
                        <span>{p.name}</span>
                        <span className="text-gray-600 text-[10px]">{p.items_count}</span>
                      </button>
                    ))}
                    <Link to="/explore/playlists" className="block px-3 py-2 text-xs text-brand-400 hover:bg-white/5 rounded">
                      Crear nueva lista →
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {video.embed_enabled && (
              <button onClick={() => setShowEmbed(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-dark-800 text-gray-300 hover:bg-dark-700">
                <FiCode size={13} /> Embed
              </button>
            )}
          </div>

          {/* Creator info */}
          <Link to={`/profile/${video.user?.id}`}
            className="flex items-center gap-3 p-3 rounded-xl bg-dark-800 hover:bg-dark-700 transition-colors">
            <img loading="lazy" src={video.user?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(video.user?.full_name || 'U')}
              className="w-10 h-10 rounded-full object-cover" alt="" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-white truncate">{video.user?.full_name}</p>
                {video.user?.is_verified && <VerifiedBadge size={12} />}
              </div>
              <p className="text-[10px] text-gray-500">Ver perfil completo</p>
            </div>
            <FiUser size={14} className="text-gray-500" />
          </Link>

          {/* Descripción */}
          {video.description && (
            <div className="text-sm text-gray-300 whitespace-pre-wrap bg-dark-800/40 rounded-xl p-3">
              {video.description}
            </div>
          )}
        </div>

        {/* Up next */}
        {up_next?.length > 0 && (
          <div className="px-4 mt-4">
            <h2 className="text-sm font-bold text-white mb-3">Siguientes videos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {up_next.map(v => (
                <Link key={v.id} to={`/explore/v/${v.id}`} className="block group">
                  <div className="relative aspect-video bg-dark-800 rounded-lg overflow-hidden">
                    <img src={v.thumbnail_url || ''} alt={v.title}
                      loading="lazy"
                      className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                      {fmtDuration(v.duration_seconds)}
                    </span>
                  </div>
                  <p className="text-xs text-white font-semibold mt-1.5 line-clamp-2 group-hover:text-brand-400">
                    {v.title}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{fmtViews(v.views_count)} vistas</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Embed modal */}
      <AnimatePresence>
        {showEmbed && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) setShowEmbed(false); }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="bg-dark-800 rounded-2xl p-5 max-w-md w-full">
              <h3 className="text-white font-bold mb-2">Código de embed</h3>
              <p className="text-xs text-gray-400 mb-3">Copia este código y pégalo en tu sitio web</p>
              <textarea
                readOnly
                value={embedCode}
                className="w-full bg-dark-900 text-xs text-gray-300 p-3 rounded-lg font-mono h-24 resize-none"
                onClick={e => e.currentTarget.select()}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => { navigator.clipboard?.writeText(embedCode); toast.success('Copiado'); }}
                  className="btn-primary flex-1 text-sm">
                  <FiCheck size={14} className="inline mr-1" /> Copiar
                </button>
                <button onClick={() => setShowEmbed(false)} className="btn-secondary text-sm">Cerrar</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* v73: Co-stars + Comments section */}
      <div className="max-w-5xl mx-auto px-4 mt-6 space-y-8">
        {costars.length > 0 && (
          <div>
            <h2 className="text-white font-bold text-sm mb-3">Con</h2>
            <div className="flex gap-3 flex-wrap">
              {costars.map(cs => (
                <Link key={cs.user?.id} to={`/profile/${cs.user?.id}`}
                  className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                  {cs.user?.avatar_url && <img loading="lazy" src={cs.user.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />}
                  <div>
                    <p className="text-sm text-white font-bold">{cs.user?.full_name}</p>
                    {cs.user?.is_verified && <span className="text-[10px] text-brand-400">✓ Verified</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        <VideoCommentsSection videoId={video.id} videoOwnerId={video.user_id} />
      </div>

      {showTip && video.user_id && (
        <TipModal
          userId={video.user_id}
          userName={video.user?.full_name || 'creator'}
          onClose={() => setShowTip(false)}
          onSent={() => setShowTip(false)}
        />
      )}
    </div>
  );
}
