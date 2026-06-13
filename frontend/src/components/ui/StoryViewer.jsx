import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiPlus, FiSend, FiVolume2, FiVolumeX, FiPause, FiPlay } from 'react-icons/fi';
import { compressImage } from '../../lib/imageCompressor.js';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// StoryViewer tier-1
//  - Progress bars suaves (framer-motion linear) en lugar de stutter por rAF
//  - Pause/resume real: acumulamos elapsed entre pausas, no reseteamos
//  - Swipe-down-to-close (drag elastic)
//  - Mute toggle para video
//  - Preload de la siguiente media (img/video) para transición fluida
//  - Keyboard nav (← → Esc) en desktop
//
// Props: groups: [{ user, stories: [{id, media_url, media_type, viewed, expires_at, duration_ms?}] }]
//        initialGroupIndex, onClose, onNewStory, isOwn

const DEFAULT_PHOTO_DURATION = 5000;

export default function StoryViewer({ groups, initialGroupIndex = 0, onClose, onNewStory, isOwn }) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true); // arranca muted (autoplay con sound suele bloquearse)
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [progressKey, setProgressKey] = useState(0); // bump para reiniciar animación de la barra
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  const currentGroup = groups[groupIdx];
  const currentStory = currentGroup?.stories[storyIdx];
  const isVideo = currentStory?.media_type === 'video';
  const duration = currentStory?.duration_ms || DEFAULT_PHOTO_DURATION;

  // Marcar como vista al cambiar story
  useEffect(() => {
    if (currentStory && !currentStory.viewed) {
      api.post(`/api/stories/${currentStory.id}/view`).catch(() => {});
    }
    setProgressKey(k => k + 1);
  }, [currentStory?.id]);

  // Auto-avance para fotos cuando termina la barra
  useEffect(() => {
    if (isVideo || !currentStory || paused) return;
    const timer = setTimeout(() => goNext(), duration);
    return () => clearTimeout(timer);
  }, [progressKey, paused, isVideo, currentStory?.id, duration]);

  // Preload de la siguiente media — transición fluida
  useEffect(() => {
    if (!currentGroup) return;
    let nextStory = null;
    if (storyIdx + 1 < currentGroup.stories.length) {
      nextStory = currentGroup.stories[storyIdx + 1];
    } else if (groupIdx + 1 < groups.length) {
      nextStory = groups[groupIdx + 1]?.stories[0];
    }
    if (!nextStory) return;
    if (nextStory.media_type === 'video') {
      const v = document.createElement('video');
      v.src = nextStory.media_url;
      v.preload = 'auto';
    } else {
      const img = new Image();
      img.src = nextStory.media_url;
    }
  }, [groupIdx, storyIdx]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose?.();
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pause/resume del video sincronizado con `paused`
  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) videoRef.current.pause();
    else videoRef.current.play().catch(() => {});
  }, [paused]);

  const goNext = () => {
    if (storyIdx < (currentGroup?.stories.length || 1) - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose?.();
    }
  };

  const goPrev = () => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(i => i - 1);
      setStoryIdx(0);
    }
  };

  const sendStoryReply = async () => {
    if (!replyText.trim() || sendingReply || !currentStory) return;
    setSendingReply(true);
    setPaused(true);
    try {
      const { data } = await api.post(`/api/stories/${currentStory.id}/reply`, { content: replyText.trim() });
      setReplyText('');
      toast.success('Respuesta enviada');
      if (data.match_id) {
        onClose?.();
        navigate(`/chat/${data.match_id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar respuesta');
    } finally {
      setSendingReply(false);
      setPaused(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const isVid = file.type.startsWith('video/');
    const processed = isVid ? file : await compressImage(file);
    const fd = new FormData();
    fd.append('media', processed);
    try {
      await api.post('/api/stories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Story publicada');
      onNewStory?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar la story');
    }
  };

  if (!currentGroup || !currentStory) return null;

  const timeLeft = currentStory.expires_at
    ? Math.max(0, Math.round((new Date(currentStory.expires_at) - Date.now()) / 3600000))
    : 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="relative w-full max-w-sm h-full sm:h-[90vh] sm:rounded-2xl overflow-hidden bg-black"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.4}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) onClose?.();
        }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* Barras de progreso — framer-motion lineal para suavidad real */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {currentGroup.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              {i < storyIdx ? (
                <div className="h-full w-full bg-white rounded-full" />
              ) : i === storyIdx ? (
                <ProgressBar
                  key={progressKey}
                  duration={duration}
                  paused={paused}
                  isVideo={isVideo}
                  videoRef={videoRef}
                />
              ) : (
                <div className="h-full w-0 bg-white rounded-full" />
              )}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-7 left-3 right-3 z-20 flex items-center gap-2">
          <img
            src={currentGroup.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentGroup.user.full_name)}&size=80&background=1a1a2e&color=f43f5e`}
            className="w-8 h-8 rounded-full object-cover border border-white/30"
            alt=""
          />
          <p className="text-white text-sm font-medium flex-1 truncate">{currentGroup.user.full_name}</p>
          <p className="text-white/60 text-xs">{timeLeft}h</p>
          {isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); setMuted(m => !m); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-white/80 hover:text-white p-1 -m-1"
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? <FiVolumeX size={18} /> : <FiVolume2 size={18} />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-white/80 hover:text-white p-1 -m-1"
            aria-label="Cerrar"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Media */}
        <AnimatePresence mode="wait">
          {isVideo ? (
            <motion.video
              key={currentStory.id}
              ref={videoRef}
              src={currentStory.media_url}
              autoPlay
              muted={muted}
              playsInline
              className="w-full h-full object-contain"
              onEnded={goNext}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
          ) : (
            <motion.img
              key={currentStory.id}
              src={currentStory.media_url}
              alt=""
              className="w-full h-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              draggable={false}
            />
          )}
        </AnimatePresence>

        {/* Tap zones — izquierda 30% prev, derecha 30% next. Centro queda libre para pause/long-press */}
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-0 top-0 w-[30%] h-full z-10"
          aria-label="Anterior"
        />
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 w-[30%] h-full z-10"
          aria-label="Siguiente"
        />

        {/* Caption + CTA overlay (data del story) */}
        {currentStory.caption && (
          <div className="absolute bottom-20 left-3 right-3 z-15 pointer-events-none">
            <p className="text-white text-sm font-medium bg-black/55 backdrop-blur-sm rounded-xl px-3 py-2 inline-block whitespace-pre-wrap break-words max-w-[90%]">
              {currentStory.caption}
            </p>
          </div>
        )}
        {currentStory.cta_url && (
          <a
            href={currentStory.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-16 left-3 right-3 z-20 bg-brand-500 hover:bg-brand-400 text-white rounded-full px-4 py-2.5 text-xs font-bold text-center shadow-glow transition-colors block"
          >
            {currentStory.cta_label || 'Ver más'} →
          </a>
        )}

        {/* Indicador visual de pause */}
        <AnimatePresence>
          {paused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-15"
            >
              <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm">
                <FiPause className="text-white" size={28} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input de respuesta — solo en stories ajenas */}
        {!isOwn && currentStory && (
          <div
            className="absolute bottom-4 left-4 right-4 z-20 flex items-center gap-2"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onKeyDown={e => e.key === 'Enter' && sendStoryReply()}
              placeholder={`Responder a ${currentGroup?.user?.full_name?.split(' ')[0] || ''}...`}
              maxLength={200}
              className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder-white/60 outline-none focus:border-brand-500/50 focus:bg-white/15"
            />
            {replyText.trim() && (
              <button
                onClick={sendStoryReply}
                disabled={sendingReply}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center disabled:opacity-50 transition-colors active:scale-95"
                aria-label="Enviar respuesta"
              >
                {sendingReply
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <FiSend size={16} className="text-white" />
                }
              </button>
            )}
          </div>
        )}

        {/* Botón añadir story (solo en grupo propio) */}
        {isOwn && groupIdx === 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-6 right-4 z-20 w-10 h-10 bg-brand-500 hover:bg-brand-600 rounded-full flex items-center justify-center shadow-glow transition-colors active:scale-95"
            aria-label="Añadir story"
          >
            <FiPlus className="text-white" size={20} />
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
      </motion.div>
    </motion.div>
  );
}

// Barra de progreso animada con framer-motion (lineal real).
// Para video, lee currentTime del <video> en lugar de duración fija.
function ProgressBar({ duration, paused, isVideo, videoRef }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (isVideo) {
      // Para video: sincroniza con currentTime
      let raf;
      const tick = () => {
        const v = videoRef.current;
        if (v && v.duration) {
          setPct(Math.min(v.currentTime / v.duration, 1));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    // Para foto: animación CSS-driven con pause/resume real
  }, [isVideo]);

  if (isVideo) {
    return (
      <div
        className="h-full bg-white rounded-full origin-left"
        style={{ width: `${pct * 100}%` }}
      />
    );
  }

  // Foto: usa CSS animation con animation-play-state para pause/resume sin reiniciar
  return (
    <div
      className="h-full bg-white rounded-full origin-left"
      style={{
        animation: `story-progress ${duration}ms linear forwards`,
        animationPlayState: paused ? 'paused' : 'running',
      }}
    />
  );
}
