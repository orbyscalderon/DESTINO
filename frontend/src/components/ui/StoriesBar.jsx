import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiX, FiTrash2, FiSend } from 'react-icons/fi';
import { useAuthStore } from '../../store/authStore.js';
import { compressImage } from '../../lib/imageCompressor.js';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const STORY_DURATION_MS = 5000;

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function StoryViewer({ groups, initialGroupIdx, onClose, onStoryViewed, onStoryDeleted }) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [viewersTotal, setViewersTotal] = useState(0);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const videoRef = useRef(null);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const { user } = useAuthStore();

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];

  const goNext = useCallback(() => {
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [groupIdx, storyIdx, group?.stories?.length, groups?.length]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
    } else if (groupIdx > 0) {
      const prev = groups[groupIdx - 1];
      setGroupIdx(i => i - 1);
      setStoryIdx(prev.stories.length - 1);
    }
  }, [groupIdx, storyIdx, groups]);

  const loadViewers = async (storyId) => {
    setLoadingViewers(true);
    try {
      const { data } = await api.get(`/api/stories/${storyId}/viewers`);
      setViewers(data.viewers || []);
      setViewersTotal(data.total || 0);
    } catch {}
    setLoadingViewers(false);
  };

  const handleOpenViewers = (e) => {
    e.stopPropagation();
    setPaused(true);
    setShowViewers(true);
    if (story) loadViewers(story.id);
  };

  const isOwnStory = story?.user_id === user?.id || group?.user?.id === user?.id;

  const handleDeleteStory = async (e) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/api/stories/${story.id}`);
      toast.success('Historia eliminada');
      onStoryDeleted?.(story.id);
      onClose();
    } catch {
      toast.error('No se pudo eliminar la historia');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    setShowViewers(false);
    setReplyText('');
  }, [storyIdx, groupIdx]);

  const handleSendReply = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const text = replyText.trim();
    if (!text || sendingReply || !story?.id) return;
    setSendingReply(true);
    setPaused(true);
    try {
      await api.post(`/api/stories/${story.id}/reply`, { content: text });
      setReplyText('');
      toast.success('Mensaje enviado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar');
    } finally {
      setSendingReply(false);
      setPaused(false);
    }
  };

  useEffect(() => {
    if (!story) return;
    if (!story.viewed && story.user?.id !== user?.id) {
      api.post(`/api/stories/${story.id}/view`).catch(() => {});
      onStoryViewed?.(story.id);
    }

    const duration = story.media_type === 'video'
      ? (videoRef.current?.duration ? videoRef.current.duration * 1000 : STORY_DURATION_MS)
      : STORY_DURATION_MS;

    setProgress(0);
    startTimeRef.current = Date.now();

    const tick = () => {
      if (paused) { rafRef.current = requestAnimationFrame(tick); return; }
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        goNext();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [group?.user?.id, storyIdx, paused]);

  useEffect(() => {
    if (videoRef.current && story?.media_type === 'video') {
      videoRef.current.play().catch(() => {});
    }
  }, [story?.id]);

  if (!story) return null;

  const handleTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.35) goPrev(); else goNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none"
      onClick={handleTap}
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Progress bars */}
      <div className="absolute top-safe-top inset-x-0 flex gap-1 px-3 pt-3 z-10 pointer-events-none">
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width: i < storyIdx ? '100%' : i === storyIdx ? `${progress}%` : '0%',
                transition: i === storyIdx ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Avatar + name */}
      <div className="absolute top-8 left-4 flex items-center gap-2 z-10 pointer-events-none">
        <img
          src={group.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.user.full_name || 'U')}&size=64&background=1a1a2e&color=f43f5e`}
          className="w-9 h-9 rounded-full border-2 border-white object-cover"
          alt=""
        />
        <div>
          <p className="text-white font-semibold text-sm leading-none">{group.user.full_name}</p>
          <p className="text-white/50 text-xs mt-0.5">
            {timeAgo(story.created_at)}
            {isOwnStory && story.expires_at && (() => {
              const hoursLeft = Math.max(0, Math.round((new Date(story.expires_at) - Date.now()) / 3600000));
              return <span className="ml-1.5">· expira en {hoursLeft}h</span>;
            })()}
          </p>
        </div>
      </div>

      {/* Close */}
      <button
        className="absolute top-8 right-4 z-10 w-8 h-8 flex items-center justify-center text-white"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <FiX size={20} />
      </button>

      {/* Media */}
      {story.media_type === 'video' ? (
        <video
          ref={videoRef}
          src={story.media_url}
          className="max-h-screen max-w-full w-full object-contain"
          autoPlay
          playsInline
          muted={false}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={story.media_url}
          alt=""
          className="max-h-screen max-w-full w-full object-contain"
          draggable={false}
        />
      )}

      {/* Group navigation arrows (desktop only) */}
      {groupIdx > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 hidden sm:flex w-8 h-8 bg-black/40 rounded-full items-center justify-center text-white"
          onClick={(e) => { e.stopPropagation(); setGroupIdx(i => i - 1); setStoryIdx(0); }}
        >‹</button>
      )}
      {groupIdx < groups.length - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 hidden sm:flex w-8 h-8 bg-black/40 rounded-full items-center justify-center text-white"
          onClick={(e) => { e.stopPropagation(); setGroupIdx(i => i + 1); setStoryIdx(0); }}
        >›</button>
      )}

      {/* Reply input — solo para stories ajenas */}
      {!isOwnStory && (
        <form
          onSubmit={handleSendReply}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => { e.stopPropagation(); setPaused(true); }}
          onTouchStart={(e) => { e.stopPropagation(); setPaused(true); }}
          className="absolute bottom-4 inset-x-0 z-10 px-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            placeholder={`Responder a ${group.user.full_name?.split(' ')[0] || ''}…`}
            className="flex-1 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/50 focus:outline-none focus:border-brand-500"
            maxLength={500}
            disabled={sendingReply}
          />
          {replyText.trim() && (
            <button
              type="submit"
              disabled={sendingReply}
              className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white disabled:opacity-50"
            >
              {sendingReply
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FiSend size={16} />}
            </button>
          )}
        </form>
      )}

      {/* Viewers button + delete — solo para el autor */}
      {isOwnStory && (
        <div className="absolute bottom-6 inset-x-0 z-10 flex items-center justify-center gap-3 px-4">
          <button
            className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full border border-white/20"
            onClick={handleOpenViewers}
          >
            <span>👁</span>
            <span>{story.views_count ?? viewersTotal} {(story.views_count ?? viewersTotal) === 1 ? 'vista' : 'vistas'}</span>
          </button>
          <button
            className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-red-400 text-sm px-3 py-2 rounded-full border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            onClick={handleDeleteStory}
            disabled={deleting}
          >
            {deleting
              ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              : <FiTrash2 size={15} />
            }
          </button>
        </div>
      )}

      {/* Viewers panel */}
      <AnimatePresence>
        {showViewers && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-20 bg-dark-900/95 backdrop-blur-md rounded-t-2xl max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
              <p className="text-white font-semibold text-sm">
                Vistas · <span className="text-gray-400 font-normal">{viewersTotal}</span>
              </p>
              <button
                className="text-gray-400 hover:text-white"
                onClick={() => { setShowViewers(false); setPaused(false); }}
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-2">
              {loadingViewers ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : viewers.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Nadie ha visto esta story todavía</p>
              ) : (
                viewers.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 py-2.5">
                    <img
                      src={v.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(v.full_name || 'U')}&size=64&background=1a1a2e&color=f43f5e`}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                      alt=""
                    />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium leading-none truncate">
                        {v.full_name}
                        {v.is_verified && <span className="ml-1 text-brand-500 text-xs">✓</span>}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">{timeAgo(v.viewed_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function StoriesBar() {
  const { user, profile } = useAuthStore();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerIdx, setViewerIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/api/stories')
      .then(({ data }) => setGroups(data.stories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleStoryViewed = (storyId) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stories: g.stories.map(s => s.id === storyId ? { ...s, viewed: true } : s),
      has_unseen: g.stories.some(s => s.id !== storyId && !s.viewed),
    })));
  };

  const handleStoryDeleted = (storyId) => {
    setGroups(prev =>
      prev
        .map(g => ({ ...g, stories: g.stories.filter(s => s.id !== storyId) }))
        .filter(g => g.stories.length > 0)
    );
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const isVideo = file.type.startsWith('video/');
      const processed = isVideo ? file : await compressImage(file);
      const fd = new FormData();
      fd.append('media', processed);
      const { data } = await api.post('/api/stories', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const myUser = { id: user.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url, is_verified: !!profile?.is_verified };
      const newStory = { ...data.story, user: myUser, viewed: true };

      setGroups(prev => {
        const myGroupIdx = prev.findIndex(g => g.user.id === user.id);
        if (myGroupIdx >= 0) {
          const updated = [...prev];
          updated[myGroupIdx] = {
            ...updated[myGroupIdx],
            stories: [newStory, ...updated[myGroupIdx].stories],
          };
          return updated;
        }
        return [{ user: myUser, stories: [newStory], has_unseen: false }, ...prev];
      });
      toast.success('Story publicada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar story');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="shrink-0 flex flex-col items-center gap-1.5">
            <div className="w-14 h-14 rounded-full bg-dark-700 animate-pulse" />
            <div className="w-10 h-2 bg-dark-700 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0 && !loading) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        <AddStoryButton uploading={uploading} profile={profile} fileRef={fileRef} onUpload={handleUpload} />
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" />
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-white/5">
        <AddStoryButton uploading={uploading} profile={profile} fileRef={fileRef} onUpload={handleUpload} />
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" />

        {groups.map((group, idx) => (
          <button
            key={group.user.id}
            onClick={() => setViewerIdx(idx)}
            className="shrink-0 flex flex-col items-center gap-1.5"
          >
            <div className={`w-14 h-14 rounded-full p-0.5 ${
              group.has_unseen
                ? 'bg-gradient-to-br from-brand-500 to-purple-500'
                : 'bg-dark-600'
            }`}>
              <img
                src={group.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.user.full_name || 'U')}&size=64&background=1a1a2e&color=f43f5e`}
                alt=""
                className="w-full h-full rounded-full object-cover bg-dark-900"
              />
            </div>
            <span className="text-[10px] text-gray-500 leading-none w-14 text-center truncate">
              {group.user.id === user?.id ? 'Tú' : group.user.full_name?.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {viewerIdx !== null && (
          <StoryViewer
            groups={groups}
            initialGroupIdx={viewerIdx}
            onClose={() => setViewerIdx(null)}
            onStoryViewed={handleStoryViewed}
            onStoryDeleted={handleStoryDeleted}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AddStoryButton({ uploading, profile, fileRef, onUpload }) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative w-14 h-14 rounded-full border-2 border-dashed border-gray-600 hover:border-brand-500 transition-colors overflow-hidden flex items-center justify-center"
      >
        {profile?.avatar_url && (
          <img src={profile.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        {uploading
          ? <div className="relative w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          : <div className="relative w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
              <FiPlus size={12} className="text-white" />
            </div>
        }
      </button>
      <span className="text-[10px] text-gray-500 leading-none">Tu story</span>
      <span className="text-[9px] text-gray-600 leading-none">24 horas</span>
    </div>
  );
}
