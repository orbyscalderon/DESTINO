import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiHeart, FiMessageCircle, FiImage, FiX, FiLock, FiTrash2, FiShare2, FiHash, FiTrendingUp } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { compressImage } from '../lib/imageCompressor.js';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import StoriesBar from '../components/ui/StoriesBar.jsx';
import { PostCardSkeleton } from '../components/ui/Skeleton.jsx';
import toast from 'react-hot-toast';

function renderCaption(caption, onHashtagClick) {
  if (!caption) return null;
  const parts = caption.split(/(#[\wÀ-ž]+)/g);
  return parts.map((part, i) =>
    part.startsWith('#') ? (
      <button
        key={i}
        onClick={() => onHashtagClick(part.slice(1))}
        className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
      >
        {part}
      </button>
    ) : part
  );
}

async function sharePost(post) {
  const url = window.location.origin + `/#/moments`;
  const text = post.caption?.substring(0, 100) || 'Mira este momento en Destino TV';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Destino TV', text, url });
    } catch {}
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Enlace copiado');
  }
}

function PostCard({ post, onLike, onComment, onDelete, onPurchased, currentUserId, onHashtagClick }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [buying, setBuying] = useState(false);
  const cardRef = useRef(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!cardRef.current || viewedRef.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        api.post(`/api/posts/${post.id}/view`).catch(() => {});
      }
    }, { threshold: 0.5 });
    obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, [post.id]);

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

  const handleBuyPost = async () => {
    setBuying(true);
    try {
      await api.post(`/api/posts/${post.id}/purchase`);
      toast.success('Post desbloqueado');
      onPurchased?.(post.id);
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error(`Coins insuficientes — necesitas ${post.price}`);
      } else {
        toast.error(err.response?.data?.error || 'Error al comprar');
      }
    } finally {
      setBuying(false);
    }
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
    <motion.div ref={cardRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      {/* Header del post */}
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
            {new Date(post.created_at).toLocaleDateString()}
            {post.status === 'pending_review' && (
              <span className="text-yellow-500/70 text-[10px]">En revisión</span>
            )}
          </p>
        </div>
        {post.is_subscribers_only && (
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <FiLock size={9} /> Suscriptores
          </span>
        )}
        {currentUserId === post.author?.id && onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-gray-600 hover:text-red-400 transition-colors p-1"
            title="Eliminar post"
          >
            <FiTrash2 size={14} />
          </button>
        )}
      </div>

      {/* Media */}
      {post.locked ? (
        <div className="bg-dark-700 h-48 flex flex-col items-center justify-center gap-2">
          <FiLock className="text-gray-500" size={28} />
          {post.is_paid && post.price > 0 ? (
            <>
              <p className="text-gray-400 text-sm font-medium">Contenido de pago</p>
              <button
                onClick={handleBuyPost}
                disabled={buying}
                className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
              >
                {buying ? '...' : `🪙 Comprar — ${post.price} coins`}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-sm">Solo para suscriptores</p>
              <Link to={`/profile/${post.author?.id}`} className="btn-primary text-xs px-4 py-1.5">
                Suscribirse
              </Link>
            </>
          )}
        </div>
      ) : post.blurred ? (
        <div className="relative bg-dark-700 h-48 overflow-hidden flex items-center justify-center">
          {post.media_url && (
            <img src={post.media_url} alt="" className="w-full h-full object-cover blur-xl scale-110 opacity-50" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-gray-300 text-sm font-medium">Contenido adulto</p>
            <Link to={`/profile/${post.author?.id}`} className="text-brand-400 text-xs">Ver perfil</Link>
          </div>
        </div>
      ) : post.media_url ? (
        post.media_type === 'video' ? (
          <video src={post.media_url} controls className="w-full max-h-80 object-contain bg-black" />
        ) : (
          <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
        )
      ) : null}

      {/* Caption con hashtags */}
      {post.caption && (
        <p className="px-3 py-2 text-gray-300 text-sm leading-relaxed">
          {renderCaption(post.caption, onHashtagClick)}
        </p>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-white/5">
        <button
          onClick={() => onLike(post.id, post.liked)}
          className={`flex items-center gap-1.5 text-sm transition-colors ${post.liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
        >
          <FiHeart size={16} className={post.liked ? 'fill-current' : ''} />
          {post.likes_count > 0 && <span>{post.likes_count}</span>}
        </button>
        <button
          onClick={handleToggleComments}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <FiMessageCircle size={16} />
          {post.comments_count > 0 && <span>{post.comments_count}</span>}
        </button>
        <button
          onClick={() => sharePost(post)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors ml-auto"
          title="Compartir"
        >
          <FiShare2 size={15} />
        </button>
      </div>

      {/* Comentarios */}
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
                <p className="text-gray-600 text-xs text-center py-2">Sin comentarios aún</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  <img src={c.user?.avatar_url || `https://ui-avatars.com/api/?name=${c.user?.full_name}&size=32&background=1a1a2e&color=f43f5e`}
                    className="w-6 h-6 rounded-full shrink-0" alt="" />
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
                placeholder="Comentar..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
              />
              <button onClick={handleAddComment} className="text-brand-400 hover:text-brand-300 text-sm">
                Enviar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Moments() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPost, setNewPost] = useState({ caption: '', is_adult: false, is_subscribers_only: false });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [activeHashtag, setActiveHashtag] = useState(null);
  const [trending, setTrending] = useState([]);
  const [showTrending, setShowTrending] = useState(false);
  const fileRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => { loadPosts(); }, []);

  useEffect(() => {
    if (activeHashtag) {
      api.get(`/api/posts/hashtag/${encodeURIComponent(activeHashtag)}`)
        .then(({ data }) => { setPosts(data.posts || []); setHasMore(false); })
        .catch(() => {});
    } else {
      loadPosts();
    }
  }, [activeHashtag]);

  useEffect(() => {
    api.get('/api/posts/trending-hashtags')
      .then(({ data }) => setTrending(data.trending || []))
      .catch(() => {});
  }, []);

  // IntersectionObserver — auto-load next page when sentinel enters viewport
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
    } catch { toast.error('Error al cargar el feed'); }
    finally { setLoading(false); }
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
    if (!window.confirm('¿Eliminar esta publicación?')) return;
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
    setMediaPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(processed); });
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
      setMediaPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      toast.success('Publicado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al publicar');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-black gradient-text">Momentos</h1>
        <div className="w-9 h-9 bg-brand-500 rounded-xl" />
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {[...Array(3)].map((_, i) => <PostCardSkeleton key={i} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeHashtag && (
              <button onClick={() => setActiveHashtag(null)} className="text-brand-400 hover:text-white">
                ←
              </button>
            )}
            <h1 className="text-lg font-black gradient-text">
              {activeHashtag ? `#${activeHashtag}` : 'Momentos'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTrending(v => !v)}
              className="w-9 h-9 bg-dark-700 rounded-xl flex items-center justify-center hover:bg-dark-600 transition-colors"
              title="Trending"
            >
              <FiTrendingUp className="text-yellow-400" size={16} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center hover:bg-brand-600 transition-colors"
            >
              <FiPlus className="text-white" size={18} />
            </button>
          </div>
        </div>

        {/* Trending hashtags */}
        {showTrending && trending.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
            {trending.slice(0, 12).map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => { setActiveHashtag(tag); setShowTrending(false); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-400 text-xs hover:bg-brand-500/30 transition-colors border border-brand-500/20"
              >
                <FiHash size={9} /> {tag}
                <span className="text-gray-500 ml-0.5">·{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stories */}
      {!activeHashtag && <StoriesBar />}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <FiImage className="text-gray-700 mx-auto mb-3" size={40} />
            <p className="text-gray-500">No hay publicaciones aún</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4 text-sm">
              Publicar algo
            </button>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onComment={handleCommentAdded}
                onDelete={handleDeletePost}
                onPurchased={(id) => setPosts(prev => prev.map(p => p.id === id ? { ...p, locked: false } : p))}
                currentUserId={user?.id}
                onHashtagClick={tag => setActiveHashtag(tag)}
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="card p-5 w-full max-w-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Nuevo Momento</h3>
                <button onClick={() => { setShowCreateModal(false); setMediaPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); setMediaFile(null); }}>
                  <FiX className="text-gray-400" size={20} />
                </button>
              </div>

              <textarea
                className="input-field resize-none w-full mb-3"
                rows={3}
                placeholder="¿Qué quieres compartir?"
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
                <button onClick={() => fileRef.current.click()} className="text-gray-400 hover:text-white transition-colors">
                  <FiImage size={20} />
                </button>
                {profile?.is_creator && (
                  <button
                    onClick={() => setNewPost(p => ({ ...p, is_subscribers_only: !p.is_subscribers_only }))}
                    className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${newPost.is_subscribers_only ? 'bg-purple-500/20 text-purple-400' : 'bg-dark-700 text-gray-500'}`}
                  >
                    <FiLock size={10} /> Solo suscriptores
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
                <button onClick={() => { setShowCreateModal(false); setMediaPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); setMediaFile(null); }} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handleCreatePost} disabled={creating} className="btn-primary flex-1">
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : 'Publicar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
