import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiChevronLeft, FiChevronRight, FiPlus, FiSend } from 'react-icons/fi';
import { compressImage } from '../../lib/imageCompressor.js';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// StoryViewer — recibe `groups` (array de { user, stories }) y `initialGroupIndex`
export default function StoryViewer({ groups, initialGroupIndex = 0, onClose, onNewStory, isOwn }) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const navigate = useNavigate();
  const progressRef = useRef(null);
  const fileRef = useRef(null);
  const DURATION = 5000; // 5 segundos por foto

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

  const currentGroup = groups[groupIdx];
  const currentStory = currentGroup?.stories[storyIdx];

  useEffect(() => {
    setProgress(0);
    if (currentStory && !currentStory.viewed) {
      api.post(`/api/stories/${currentStory.id}/view`).catch(() => {});
    }
  }, [groupIdx, storyIdx]);

  useEffect(() => {
    if (paused || !currentStory || currentStory.media_type === 'video') return;

    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / DURATION, 1);
      setProgress(pct);
      if (pct < 1) {
        progressRef.current = requestAnimationFrame(tick);
      } else {
        goNext();
      }
    };
    progressRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(progressRef.current);
  }, [groupIdx, storyIdx, paused]);

  const goNext = () => {
    if (storyIdx < (currentGroup?.stories.length || 1) - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
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

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const isVideo = file.type.startsWith('video/');
    const processed = isVideo ? file : await compressImage(file);
    const fd = new FormData();
    fd.append('media', processed);
    try {
      await api.post('/api/stories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Story publicada');
      onNewStory?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar la story');
    }
    setShowAdd(false);
  };

  if (!currentGroup || !currentStory) return null;

  const timeLeft = currentStory.expires_at
    ? Math.max(0, Math.round((new Date(currentStory.expires_at) - Date.now()) / 3600000))
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div
        className="relative w-full max-w-sm h-full sm:h-[90vh] sm:rounded-2xl overflow-hidden bg-black"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* Barras de progreso */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {currentGroup.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width: i < storyIdx ? '100%' : i === storyIdx ? `${progress * 100}%` : '0%',
                }}
              />
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
          <p className="text-white text-sm font-medium flex-1">{currentGroup.user.full_name}</p>
          <p className="text-white/60 text-xs">{timeLeft}h</p>
          <button onClick={onClose} className="text-white/80 hover:text-white ml-1">
            <FiX size={20} />
          </button>
        </div>

        {/* Media */}
        {currentStory.media_type === 'video' ? (
          <video
            key={currentStory.id}
            src={currentStory.media_url}
            autoPlay
            className="w-full h-full object-contain"
            onEnded={goNext}
          />
        ) : (
          <img
            key={currentStory.id}
            src={currentStory.media_url}
            alt=""
            className="w-full h-full object-contain"
          />
        )}

        {/* Botones de navegación */}
        <button
          onClick={goPrev}
          className="absolute left-0 top-0 w-1/3 h-full z-10"
        />
        <button
          onClick={goNext}
          className="absolute right-0 top-0 w-1/3 h-full z-10"
        />

        {/* Input de respuesta — solo si NO es propia */}
        {!isOwn && currentStory && (
          <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center gap-2">
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
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center disabled:opacity-50 transition-colors"
              >
                {sendingReply
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <FiSend size={16} className="text-white" />
                }
              </button>
            )}
          </div>
        )}

        {/* Botón añadir story (solo propia) */}
        {isOwn && groupIdx === 0 && (
          <button
            onClick={() => { setShowAdd(true); fileRef.current?.click(); }}
            className="absolute bottom-6 right-4 z-20 w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center"
          >
            <FiPlus className="text-white" size={20} />
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}
