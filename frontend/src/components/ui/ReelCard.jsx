import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHeart, FiMessageCircle, FiShare2, FiMoreVertical,
  FiPlay, FiVolume2, FiVolumeX, FiCheck, FiBookmark, FiMusic,
} from 'react-icons/fi';
import VerifiedBadge from './VerifiedBadge.jsx';
import api from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';
import toast from 'react-hot-toast';

// Una tarjeta de reel — ocupa toda la altura del viewport (estilo TikTok).
// Autoplay cuando entra en viewport, pause cuando sale. Tap para pause/play.
// Doble tap = like.
//
// Props:
//   reel: { id, video_url, thumbnail_url, caption, duration_seconds, hashtags,
//           likes_count, comments_count, views_count, viewer_liked, user }
//   active: boolean — si esta es la card actualmente visible (autoplay control)
//   muted: boolean — estado global del mute (compartido entre cards)
//   onToggleMute: () => void
//   onViewTracked: (reel_id, watched_seconds) => void
//   onOpenComments?: (reel_id) => void
export default function ReelCard({
  reel, active, muted, onToggleMute, onViewTracked, onOpenComments, onCommentDelta,
}) {
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const heartAnimRef = useRef(0); // contador para forzar animaciones nuevas
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(!!reel.viewer_liked);
  const [saved, setSaved] = useState(!!reel.viewer_saved);
  const [likes, setLikes] = useState(reel.likes_count || 0);
  const [comments, setComments] = useState(reel.comments_count || 0);
  const [showHeart, setShowHeart] = useState(0); // key para re-trigger
  const [progress, setProgress] = useState(0); // 0..1
  const watchedRef = useRef(0);
  const trackSentRef = useRef(false);

  // Sync counts cuando cambia el prop reel (paginación, reorder)
  useEffect(() => {
    setLiked(!!reel.viewer_liked);
    setSaved(!!reel.viewer_saved);
    setLikes(reel.likes_count || 0);
    setComments(reel.comments_count || 0);
  }, [reel.id, reel.viewer_liked, reel.viewer_saved, reel.likes_count, reel.comments_count]);

  // Realtime: suscribirse al channel del reel cuando está activo.
  // Otros viewers que likeen/comenten harán que el contador suba en vivo.
  useEffect(() => {
    if (!active || !reel.id) return;
    const channel = supabase.channel(`reel:${reel.id}`);
    channel
      .on('broadcast', { event: 'like_changed' }, ({ payload }) => {
        if (typeof payload?.likes_count === 'number') setLikes(payload.likes_count);
      })
      .on('broadcast', { event: 'comment_added' }, ({ payload }) => {
        setComments(c => Math.max(0, c + (payload?.delta || 1)));
      })
      .on('broadcast', { event: 'comment_deleted' }, ({ payload }) => {
        setComments(c => Math.max(0, c + (payload?.delta || -1)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active, reel.id]);

  // Autoplay control
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      watchedRef.current = 0;
      trackSentRef.current = false;
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
      // Si dejó la card, mandar el tracking final
      if (watchedRef.current > 0 && !trackSentRef.current) {
        onViewTracked?.(reel.id, watchedRef.current);
        trackSentRef.current = true;
      }
    }
  }, [active, reel.id, onViewTracked]);

  // Progress + watched_seconds tracking
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      const d = v.duration || reel.duration_seconds || 0;
      if (d > 0) setProgress(t / d);
      if (t > watchedRef.current) watchedRef.current = t;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [reel.duration_seconds]);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Doble tap → like
      lastTapRef.current = 0;
      if (!liked) doLike();
      heartAnimRef.current++;
      setShowHeart(heartAnimRef.current);
      return;
    }
    lastTapRef.current = now;
    // Single tap → play/pause
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const doLike = async () => {
    // Optimistic
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes(c => wasLiked ? Math.max(0, c - 1) : c + 1);
    try {
      const { data } = await api.post(`/api/reels/${reel.id}/like`);
      setLiked(!!data.liked);
      setLikes(data.likes_count ?? 0);
    } catch {
      // Revert
      setLiked(wasLiked);
      setLikes(c => wasLiked ? c + 1 : Math.max(0, c - 1));
      toast.error('No se pudo likear');
    }
  };

  const doSave = async () => {
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      const { data } = await api.post(`/api/reels/${reel.id}/save`);
      setSaved(!!data.saved);
      toast.success(data.saved ? 'Guardado' : 'Eliminado de guardados', { duration: 1200 });
    } catch {
      setSaved(wasSaved);
      toast.error('No se pudo guardar');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/#/reels/${reel.id}`;
    const shareData = {
      title: `Reel de ${reel.user?.full_name || 'Destino TV'}`,
      text: reel.caption || 'Mira este reel en Destino TV',
      url,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(url); toast.success('Enlace copiado'); }
    } catch { /* user canceled */ }
  };

  const captionWithLinks = (text) => {
    if (!text) return null;
    return text.split(/(\s+)/).map((piece, i) => {
      if (piece.startsWith('#')) {
        const tag = piece.substring(1);
        return (
          <Link key={i} to={`/reels?tag=${encodeURIComponent(tag)}`} className="text-brand-300 font-semibold">
            {piece}
          </Link>
        );
      }
      return piece;
    });
  };

  return (
    <div
      className="relative h-screen w-full bg-black snap-start snap-always overflow-hidden flex items-center justify-center"
      style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={reel.video_url}
        poster={reel.thumbnail_url}
        loop
        muted={muted}
        playsInline
        onClick={handleTap}
        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
      />

      {/* Gradiente para legibilidad del texto */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      {/* Pause overlay */}
      {!playing && active && (
        <button
          onClick={handleTap}
          aria-label="Reproducir"
          className="absolute inset-0 flex items-center justify-center bg-black/20"
        >
          <div className="w-16 h-16 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center">
            <FiPlay className="text-white ml-1" size={28} />
          </div>
        </button>
      )}

      {/* Double-tap heart animation */}
      <AnimatePresence>
        {showHeart > 0 && (
          <motion.div
            key={showHeart}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1.2 }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute pointer-events-none"
          >
            <FiHeart className="text-pink-500 fill-current drop-shadow-2xl" size={100} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute toggle (top right) */}
      <button
        onClick={onToggleMute}
        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
        className="absolute top-16 right-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white z-10"
      >
        {muted ? <FiVolumeX size={18} /> : <FiVolume2 size={18} />}
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-10">
        <div
          className="h-full bg-white"
          style={{ width: `${(progress * 100).toFixed(2)}%`, transition: 'width 120ms linear' }}
        />
      </div>

      {/* Sidebar de acciones (derecha) */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        {/* Avatar creador */}
        <Link to={`/profile/${reel.user?.id}`} className="relative">
          <img
            src={reel.user?.avatar_url || '/avatar-placeholder.png'}
            alt={`Avatar de ${reel.user?.full_name || 'usuario'}`}
            className="w-12 h-12 rounded-full object-cover border-2 border-white"
          />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
            <FiCheck className="text-white" size={12} />
          </div>
        </Link>

        {/* Like */}
        <button onClick={doLike} className="flex flex-col items-center gap-1" aria-label="Me gusta">
          <FiHeart
            className={liked ? 'text-pink-500 fill-current' : 'text-white'}
            size={32}
          />
          <span className="text-white text-xs font-semibold">{formatCount(likes)}</span>
        </button>

        {/* Comments (placeholder — abre TODO) */}
        <button
          onClick={() => onOpenComments?.(reel.id)}
          className="flex flex-col items-center gap-1"
          aria-label="Comentarios"
        >
          <FiMessageCircle className="text-white" size={32} />
          <span className="text-white text-xs font-semibold">{formatCount(comments)}</span>
        </button>

        {/* Save (bookmark) */}
        <button onClick={doSave} className="flex flex-col items-center gap-1" aria-label={saved ? 'Quitar de guardados' : 'Guardar'}>
          <FiBookmark
            className={saved ? 'text-yellow-400 fill-current' : 'text-white'}
            size={30}
          />
          <span className="text-white text-xs font-semibold">{saved ? 'Guardado' : 'Guardar'}</span>
        </button>

        {/* Share */}
        <button onClick={handleShare} className="flex flex-col items-center gap-1" aria-label="Compartir">
          <FiShare2 className="text-white" size={30} />
        </button>

        {/* Más */}
        <button className="text-white" aria-label="Más opciones">
          <FiMoreVertical size={24} />
        </button>
      </div>

      {/* Info inferior (creador + caption + audio + stats) */}
      <div className="absolute bottom-6 left-4 right-20 z-10 space-y-2">
        <Link to={`/profile/${reel.user?.id}`} className="flex items-center gap-2">
          <span className="text-white font-bold text-base">@{reel.user?.full_name || 'usuario'}</span>
          {reel.user?.is_verified && <VerifiedBadge size={14} />}
        </Link>
        {reel.caption && (
          <p className="text-white text-sm leading-snug max-h-24 overflow-hidden">
            {captionWithLinks(reel.caption)}
          </p>
        )}
        {/* Audio label estilo IG (con ícono musical animado) */}
        {reel.audio_label && (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <FiMusic className="text-white shrink-0 animate-spin-slow" size={11} style={{ animation: 'spin 4s linear infinite' }} />
            <span className="text-white/90 text-[11px] font-medium truncate">{reel.audio_label}</span>
          </div>
        )}
        {reel.views_count > 0 && (
          <p className="text-gray-300 text-[10px]">👁 {formatCount(reel.views_count)} vistas</p>
        )}
      </div>
    </div>
  );
}

function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
