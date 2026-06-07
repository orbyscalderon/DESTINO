import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiHeart, FiMessageCircle, FiImage, FiX, FiLock, FiTrash2, FiCompass, FiUserPlus, FiUserCheck } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import { compressImage } from '../lib/imageCompressor.js';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import StoriesBar from '../components/ui/StoriesBar.jsx';
import FirstTimeTour from '../components/ui/FirstTimeTour.jsx';
import DailyReward from '../components/ui/DailyReward.jsx';
import { PostCardSkeleton } from '../components/ui/Skeleton.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import { useSwipeNavigation } from '../lib/useSwipeNavigation.js';
import toast from 'react-hot-toast';

function PostCard({ post, onLike, onComment, onDelete, currentUserId }) {
  const { t } = useTranslation();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [following, setFollowing] = useState(post.author?.is_followed ?? false);
  const [togglingFollow, setTogglingFollow] = useState(false);

  const handleToggleFollow = async (e) => {
    e.preventDefault();
    setTogglingFollow(true);
    try {
      if (following) {
        await api.delete(`/api/follows/${post.author.id}`);
        setFollowing(false);
      } else {
        await api.post(`/api/follows/${post.author.id}`);
        setFollowing(true);
      }
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setTogglingFollow(false);
    }
  };

  const handleToggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      try {
        const { data } = await api.get(`/api/posts/${post.id}/comments`);
        setComments(data.comments || []);
      } catch {}
      setLoadingComments(false);
    }
    setShowComments(v => !v);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const { data } = await api.post(`/api/posts/${post.id}/comments`, { content: commentText });
      setComments(c => [...c, data.comment]);
      setCommentText('');
      onComment(post.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al comentar');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Link to={`/profile/${post.author?.id}`}>
          <img
            src={post.author?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author?.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
            className="w-9 h-9 rounded-full object-cover"
            alt=""
          />
        </Link>
        <div className="flex-1">
          <Link to={`/profile/${post.author?.id}`} className="text-white font-medium text-sm hover:text-brand-400">
            {post.author?.full_name}
            {post.author?.is_verified && <VerifiedBadge size={14} className="ml-1" />}
          </Link>
          <p className="text-gray-600 text-xs flex items-center gap-2">
            {new Date(post.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
            {post.status === 'pending_review' && (
              <span className="text-yellow-500/70 text-[10px]">{t('home.in_review')}</span>
            )}
          </p>
        </div>
        {post.is_subscribers_only && (
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <FiLock size={9} /> {t('home.subscribers_only')}
          </span>
        )}
        {currentUserId !== post.author?.id && (
          <button
            onClick={handleToggleFollow}
            disabled={togglingFollow}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
              following
                ? 'bg-white/10 text-gray-400 hover:bg-white/20'
                : 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 border border-brand-500/40'
            }`}
          >
            {following ? <FiUserCheck size={11} /> : <FiUserPlus size={11} />}
            {following ? t('home.following') : t('home.follow')}
          </button>
        )}
        {currentUserId === post.author?.id && onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-gray-600 hover:text-red-400 transition-colors p-1"
          >
            <FiTrash2 size={14} />
          </button>
        )}
      </div>

      {post.locked ? (
        <div className="bg-dark-700 h-48 flex flex-col items-center justify-center gap-2">
          <FiLock className="text-gray-500" size={28} />
          <p className="text-gray-500 text-sm">{t('home.locked_for_subs')}</p>
          <Link to={`/profile/${post.author?.id}`} className="btn-primary text-xs px-4 py-1.5">
            {t('home.subscribe')}
          </Link>
        </div>
      ) : post.blurred ? (
        <div className="relative bg-dark-700 h-48 overflow-hidden flex items-center justify-center">
          {post.media_url && (
            <img src={post.media_url} alt="" className="w-full h-full object-cover blur-xl scale-110 opacity-50" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-gray-300 text-sm font-medium">{t('home.adult_content')}</p>
            <Link to={`/profile/${post.author?.id}`} className="text-brand-400 text-xs">{t('home.view_profile')}</Link>
          </div>
        </div>
      ) : post.media_url ? (
        post.media_type === 'video' ? (
          <video src={post.media_url} controls className="w-full max-h-80 object-contain bg-black" />
        ) : (
          <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
        )
      ) : null}

      {post.caption && (
        <p className="px-3 py-2 text-gray-300 text-sm leading-relaxed">{post.caption}</p>
      )}

      <div className="flex items-center gap-4 px-3 py-2 border-t border-white/5">
        <button
          onClick={() => onLike(post.id, post.liked)}
          className={`flex items-center gap-1.5 text-sm transition-all duration-200 ease-out-back active:scale-90 hover:scale-105 ${post.liked ? 'text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.5)]' : 'text-gray-500 hover:text-red-400'}`}
        >
          <FiHeart size={16} className={post.liked ? 'fill-current' : ''} />
          {post.likes_count > 0 && <span>{post.likes_count}</span>}
        </button>
        <button
          onClick={handleToggleComments}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-all duration-200 ease-out-back active:scale-90 hover:scale-105"
        >
          <FiMessageCircle size={16} />
          {post.comments_count > 0 && <span>{post.comments_count}</span>}
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
              {loadingComments ? (
                <div className="flex justify-center py-2">
                  <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-2">{t('home.no_comments')}</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <img
                    src={c.user?.avatar_url || `https://ui-avatars.com/api/?name=${c.user?.full_name}&size=32&background=1a1a2e&color=f43f5e`}
                    className="w-6 h-6 rounded-full shrink-0" alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-xs font-medium">{c.user?.full_name} </span>
                    <span className="text-gray-400 text-xs">{c.content}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
              <input
                className="input-field text-xs py-1.5 flex-1"
                placeholder={t('home.comment_placeholder')}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
              />
              <button onClick={handleAddComment} className="text-brand-400 hover:text-brand-300 text-sm">
                {t('common.send')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { user, profile } = useAuthStore();
  const confirm = useConfirm();

  // Patrón Instagram mobile: en Home swipe-izq abre la Cámara (Stories),
  // swipe-der abre los DMs (Mensajes). Reels se accede por el botón del navbar.
  useSwipeNavigation({ left: '/reels/new', right: '/messages' });

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPost, setNewPost] = useState({ caption: '', is_adult: false, is_subscribers_only: false });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const fileRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => { loadPosts(); }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) loadMorePosts();
      },
      { rootMargin: '200px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore]);

  const loadMorePosts = useCallback(async () => {
    setLoadingMore(true);
    await loadPosts(posts[posts.length - 1]?.created_at);
    setLoadingMore(false);
  });

  const loadPosts = async (before = null) => {
    try {
      const params = before ? `?before=${before}` : '';
      const { data } = await api.get(`/api/posts${params}`);
      setPosts(p => before ? [...p, ...data.posts] : data.posts || []);
      setHasMore(data.hasMore);
    } catch {
      toast.error('Error al cargar el feed');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (postId, liked) => {
    try {
      await api.post(`/api/posts/${postId}/like`);
      setPosts(p => p.map(post =>
        post.id === postId
          ? { ...post, liked: !liked, likes_count: liked ? post.likes_count - 1 : post.likes_count + 1 }
          : post
      ));
    } catch {}
  };

  const handleCommentAdded = (postId) => {
    setPosts(p => p.map(post =>
      post.id === postId ? { ...post, comments_count: post.comments_count + 1 } : post
    ));
  };

  const handleDeletePost = async (postId) => {
    const ok = await confirm({
      title: '¿Eliminar publicación?',
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/posts/${postId}`);
      setPosts(p => p.filter(post => post.id !== postId));
      toast.success('Publicación eliminada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const handleMediaSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const isVideo = file.type.startsWith('video/');
    const processed = isVideo ? file : await compressImage(file);
    setMediaFile(processed);
    setMediaPreview(URL.createObjectURL(processed));
  };

  const handleCreatePost = async () => {
    if (!newPost.caption.trim() && !mediaFile) {
      toast.error('Escribe algo o adjunta una imagen');
      return;
    }
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append('caption', newPost.caption);
      fd.append('is_adult', newPost.is_adult);
      fd.append('is_subscribers_only', newPost.is_subscribers_only);
      if (mediaFile) fd.append('media', mediaFile);
      const { data } = await api.post('/api/posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPosts(p => [data.post, ...p]);
      setShowCreateModal(false);
      setNewPost({ caption: '', is_adult: false, is_subscribers_only: false });
      setMediaFile(null);
      setMediaPreview(null);
      toast.success('Publicado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-10 glass border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-black gradient-text">Destino TV 💕</h1>
        <div className="skeleton w-9 h-9 rounded-xl" />
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {[...Array(3)].map((_, i) => <PostCardSkeleton key={i} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      {/* Header con glass morphism */}
      <div className="sticky top-0 z-10 glass border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-black gradient-text">Destino TV 💕</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-9 h-9 bg-gradient-to-br from-brand-500 to-accent-500 rounded-xl flex items-center justify-center shadow-glow-sm hover:shadow-glow hover:scale-105 active:scale-95 transition-all duration-200 ease-out-expo"
          title={t('home.publish')}
          aria-label={t('home.publish')}
        >
          <FiPlus className="text-white" size={18} />
        </button>
      </div>

      {/* Tour primera vez (se auto-oculta tras verlo) */}
      <FirstTimeTour skipFor={!profile?.username} />

      {/* Recompensa diaria — solo aparece si el user no reclamó hoy */}
      {profile?.username && <DailyReward />}

      {/* Stories */}
      <StoriesBar />

      {/* Banner hacia Descubrir */}
      <div className="max-w-lg mx-auto px-4 pt-3 pb-1">
        <Link
          to="/discover"
          className="flex items-center gap-3 bg-gradient-to-r from-brand-500/15 to-accent-500/10 border border-brand-500/20 rounded-2xl px-4 py-3 hover:border-brand-500/40 hover:from-brand-500/20 hover:to-accent-500/15 hover:-translate-y-0.5 transition-all duration-200 ease-out-expo group active:scale-[0.99]"
        >
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0 group-hover:bg-brand-500/30 transition-colors">
            <FiCompass size={16} className="text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">{t('home.discover_people')}</p>
            <p className="text-gray-500 text-xs">{t('home.discover_hint')}</p>
          </div>
          <span className="text-gray-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all text-sm">→</span>
        </Link>
      </div>

      {/* Feed de posts */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <FiImage className="text-gray-700 mx-auto mb-3" size={40} />
            <p className="text-gray-500 mb-1">{t('home.feed_empty')}</p>
            <p className="text-gray-600 text-sm mb-4">{t('home.be_first')}</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
              {t('home.publish_something')}
            </button>
          </motion.div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onComment={handleCommentAdded}
                onDelete={handleDeletePost}
                currentUserId={user?.id}
              />
            ))}
            <div ref={sentinelRef} className="py-4 flex justify-center">
              {loadingMore && (
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal crear post */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 glass-strong flex items-end sm:items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="glass-strong rounded-3xl p-5 w-full max-w-lg shadow-2xl shadow-black/60"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{t('home.new_post')}</h3>
                <button
                  onClick={() => { setShowCreateModal(false); setMediaPreview(null); setMediaFile(null); }}
                  aria-label={t('common.close')}
                  className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>

              <textarea
                className="input-field resize-none w-full mb-3"
                rows={3}
                placeholder={t('home.share_placeholder')}
                value={newPost.caption}
                onChange={e => setNewPost(p => ({ ...p, caption: e.target.value }))}
              />

              {mediaPreview && (
                <div className="relative mb-3 rounded-xl overflow-hidden">
                  <img src={mediaPreview} alt="" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={() => { setMediaPreview(null); setMediaFile(null); }}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center"
                  >
                    <FiX size={12} className="text-white" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => fileRef.current.click()}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Adjuntar imagen"
                >
                  <FiImage size={20} />
                </button>
                {profile?.is_creator && (
                  <button
                    onClick={() => setNewPost(p => ({ ...p, is_subscribers_only: !p.is_subscribers_only }))}
                    className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${newPost.is_subscribers_only ? 'bg-purple-500/20 text-purple-400' : 'bg-dark-700 text-gray-500'}`}
                  >
                    <FiLock size={10} /> {t('home.subscribers_only')}
                  </button>
                )}
                {profile?.is_adult_creator && (
                  <button
                    onClick={() => setNewPost(p => ({ ...p, is_adult: !p.is_adult }))}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${newPost.is_adult ? 'bg-red-500/20 text-red-400' : 'bg-dark-700 text-gray-500'}`}
                  >
                    18+
                  </button>
                )}
              </div>

              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaSelect} />

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCreateModal(false); setMediaPreview(null); setMediaFile(null); }}
                  className="btn-secondary flex-1"
                >
                  {t('common.cancel')}
                </button>
                <button onClick={handleCreatePost} disabled={creating} className="btn-primary flex-1">
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : t('home.publish')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
