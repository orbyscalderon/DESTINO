import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FiX, FiSend, FiTrash2, FiHeart, FiCornerDownRight } from 'react-icons/fi';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';
import VerifiedBadge from './VerifiedBadge.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import toast from 'react-hot-toast';

// Drawer de comments con replies (1 nivel) + likes a comments.
// Props:
//   reelId, reelOwnerId, onClose, onCommentAdded
export default function ReelComments({ reelId, reelOwnerId, onClose, onCommentAdded, inline = false }) {
  const { user } = useAuthStore();
  const confirm = useConfirm();
  const [comments, setComments] = useState([]);  // raíz
  const [repliesByParent, setRepliesByParent] = useState({}); // { parentId: [reply, ...] }
  const [expandedReplies, setExpandedReplies] = useState(new Set()); // parentIds desplegados
  const [loadingReplies, setLoadingReplies] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, full_name }
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(null);
  const inputRef = useRef(null);

  const open = !!reelId;

  // Cargar comments al abrir
  useEffect(() => {
    if (!reelId) {
      setComments([]); setRepliesByParent({}); setExpandedReplies(new Set());
      setReplyTo(null); cursorRef.current = null;
      return;
    }
    let cancel = false;
    setLoading(true);
    api.get(`/api/reels/${reelId}/comments?limit=20`)
      .then(({ data }) => {
        if (cancel) return;
        setComments(data.comments || []);
        cursorRef.current = data.next_cursor;
        setHasMore(!!data.next_cursor);
      })
      .catch(() => { if (!cancel) toast.error('Error al cargar comentarios'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reelId]);

  // Esc + body lock
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const loadMore = async () => {
    if (!cursorRef.current || loading) return;
    setLoading(true);
    try {
      const { data } = await api.get(
        `/api/reels/${reelId}/comments?limit=20&cursor=${encodeURIComponent(cursorRef.current)}`
      );
      setComments(prev => {
        const seen = new Set(prev.map(c => c.id));
        return [...prev, ...(data.comments || []).filter(c => !seen.has(c.id))];
      });
      cursorRef.current = data.next_cursor;
      setHasMore(!!data.next_cursor);
    } catch {} finally { setLoading(false); }
  };

  const toggleReplies = async (parentId) => {
    if (expandedReplies.has(parentId)) {
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      return;
    }
    // Expand + load replies si no cargadas
    setExpandedReplies(prev => new Set(prev).add(parentId));
    if (!repliesByParent[parentId]) {
      setLoadingReplies(prev => new Set(prev).add(parentId));
      try {
        const { data } = await api.get(
          `/api/reels/${reelId}/comments/${parentId}/replies?limit=50`
        );
        setRepliesByParent(prev => ({ ...prev, [parentId]: data.replies || [] }));
      } catch {
        toast.error('No se pudieron cargar las respuestas');
      } finally {
        setLoadingReplies(prev => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const body = { content };
      if (replyTo) body.parent_comment_id = replyTo.id;
      const { data } = await api.post(`/api/reels/${reelId}/comments`, body);

      if (replyTo) {
        // Reply: agregar a repliesByParent + incrementar reply_count del padre
        setRepliesByParent(prev => ({
          ...prev,
          [replyTo.id]: [...(prev[replyTo.id] || []), data.comment],
        }));
        setComments(prev => prev.map(c =>
          c.id === replyTo.id ? { ...c, reply_count: (c.reply_count || 0) + 1 } : c
        ));
        setExpandedReplies(prev => new Set(prev).add(replyTo.id));
        setReplyTo(null);
      } else {
        setComments(prev => [data.comment, ...prev]);
      }

      setText('');
      onCommentAdded?.(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar el comentario');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (commentId, isReply, parentId) => {
    const ok = await confirm({
      title: '¿Borrar este comentario?',
      message: isReply
        ? 'Esta acción no se puede deshacer.'
        : 'Esta acción no se puede deshacer. Las respuestas también se borrarán.',
      confirmLabel: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      const { data } = await api.delete(`/api/reels/${reelId}/comments/${commentId}`);
      if (isReply && parentId) {
        setRepliesByParent(prev => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter(r => r.id !== commentId),
        }));
        setComments(prev => prev.map(c =>
          c.id === parentId ? { ...c, reply_count: Math.max(0, (c.reply_count || 0) - 1) } : c
        ));
      } else {
        setComments(prev => prev.filter(c => c.id !== commentId));
        // También limpiamos las replies si las teníamos cacheadas
        setRepliesByParent(prev => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
      }
      onCommentAdded?.(-(data?.removed_count || 1));
    } catch {
      toast.error('No se pudo borrar');
    }
  };

  // Toggle like en un comment (raíz o reply)
  const handleLikeComment = async (commentId, isReply, parentId) => {
    // Optimistic
    const updater = (c) => c.id === commentId
      ? { ...c, viewer_liked: !c.viewer_liked, likes_count: Math.max(0, (c.likes_count || 0) + (c.viewer_liked ? -1 : 1)) }
      : c;

    if (isReply && parentId) {
      setRepliesByParent(prev => ({
        ...prev,
        [parentId]: (prev[parentId] || []).map(updater),
      }));
    } else {
      setComments(prev => prev.map(updater));
    }

    try {
      const { data } = await api.post(`/api/reels/comments/${commentId}/like`);
      const sync = (c) => c.id === commentId
        ? { ...c, viewer_liked: !!data.liked, likes_count: data.likes_count ?? 0 }
        : c;
      if (isReply && parentId) {
        setRepliesByParent(prev => ({ ...prev, [parentId]: (prev[parentId] || []).map(sync) }));
      } else {
        setComments(prev => prev.map(sync));
      }
    } catch {
      // Revert (re-aplicar el optimistic invierte)
      if (isReply && parentId) {
        setRepliesByParent(prev => ({ ...prev, [parentId]: (prev[parentId] || []).map(updater) }));
      } else {
        setComments(prev => prev.map(updater));
      }
      toast.error('No se pudo dar like');
    }
  };

  const formatTime = (d) => {
    const ms = Date.now() - new Date(d).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'ahora';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const day = Math.floor(h / 24);
    if (day < 7) return `${day}d`;
    return new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };

  const startReply = (comment) => {
    setReplyTo({ id: comment.id, full_name: comment.user?.full_name || 'usuario' });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Render del cuerpo (header + lista + input). Se reusa entre modo inline
  // (desktop split-view) y modo drawer (mobile).
  const body = (
    <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <h3 className="text-white font-bold">Comentarios</h3>
              <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-white p-1 -m-1">
                <FiX size={20} />
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading && comments.length === 0 ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">Sé el primero en comentar 💬</div>
              ) : (
                <ul className="space-y-3 py-2">
                  {comments.map(c => {
                    const isExpanded = expandedReplies.has(c.id);
                    const replies = repliesByParent[c.id] || [];
                    const isLoadingReplies = loadingReplies.has(c.id);
                    return (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        user={user}
                        reelOwnerId={reelOwnerId}
                        onLike={() => handleLikeComment(c.id, false)}
                        onReply={() => startReply(c)}
                        onDelete={() => handleDeleteComment(c.id, false)}
                        formatTime={formatTime}
                        replyCount={c.reply_count || 0}
                        isExpanded={isExpanded}
                        onToggleReplies={() => toggleReplies(c.id)}
                        isLoadingReplies={isLoadingReplies}
                        replies={replies}
                        onLikeReply={(rid) => handleLikeComment(rid, true, c.id)}
                        onDeleteReply={(rid) => handleDeleteComment(rid, true, c.id)}
                        onReplyToReply={(replyUser) => {
                          // Reply a reply → en realidad responde al raíz pero menciona al usuario
                          setReplyTo({ id: c.id, full_name: replyUser?.full_name || 'usuario' });
                          setText(`@${replyUser?.full_name || ''} `);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                      />
                    );
                  })}
                  {hasMore && (
                    <li className="flex justify-center py-3">
                      <button
                        onClick={loadMore}
                        disabled={loading}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                      >
                        {loading ? 'Cargando...' : 'Cargar más'}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-white/5 shrink-0">
              {replyTo && (
                <div className="px-4 py-2 bg-dark-800 flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    Respondiendo a <strong className="text-brand-400">@{replyTo.full_name}</strong>
                  </span>
                  <button onClick={() => setReplyTo(null)} aria-label="Cancelar respuesta" className="text-gray-500 hover:text-white">
                    <FiX size={14} />
                  </button>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-3 flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={replyTo ? `Responder a @${replyTo.full_name}...` : 'Agrega un comentario...'}
                  maxLength={500}
                  className="flex-1 bg-dark-800 rounded-full px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label="Enviar comentario"
                  className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <FiSend size={16} />
                  }
                </button>
              </form>
            </div>
    </>
  );

  if (inline) {
    if (!reelId) return null;
    return (
      <div className="bg-dark-900 w-full h-full flex flex-col" role="region" aria-label="Comentarios del reel">
        {body}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center sm:items-center"
          onClick={onClose}
          role="dialog" aria-modal="true" aria-label="Comentarios del reel"
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="bg-dark-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl h-[85vh] sm:h-[70vh] flex flex-col"
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── CommentItem ─────────────────────────────────────────────────────

function CommentItem({
  comment: c, user, reelOwnerId, onLike, onReply, onDelete, formatTime,
  replyCount, isExpanded, onToggleReplies, isLoadingReplies, replies,
  onLikeReply, onDeleteReply, onReplyToReply,
}) {
  const canDelete = c.user?.id === user?.id || reelOwnerId === user?.id;
  return (
    <li>
      <CommentRow
        comment={c}
        canDelete={canDelete}
        onLike={onLike}
        onReply={onReply}
        onDelete={onDelete}
        formatTime={formatTime}
      />
      {/* Toggle ver respuestas */}
      {replyCount > 0 && (
        <button
          onClick={onToggleReplies}
          className="text-[11px] text-gray-400 hover:text-gray-200 font-medium ml-10 mt-1.5 flex items-center gap-1"
        >
          <span className="block w-6 h-px bg-gray-600" />
          {isExpanded
            ? `Ocultar respuestas`
            : `Ver ${replyCount} ${replyCount === 1 ? 'respuesta' : 'respuestas'}`}
        </button>
      )}
      {/* Replies */}
      {isExpanded && (
        <div className="ml-10 mt-2 space-y-2.5">
          {isLoadingReplies ? (
            <div className="flex py-3">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            replies.map(r => {
              const replyCanDelete = r.user?.id === user?.id || reelOwnerId === user?.id;
              return (
                <CommentRow
                  key={r.id}
                  comment={r}
                  canDelete={replyCanDelete}
                  onLike={() => onLikeReply(r.id)}
                  onReply={() => onReplyToReply(r.user)}
                  onDelete={() => onDeleteReply(r.id)}
                  formatTime={formatTime}
                  isReply
                />
              );
            })
          )}
        </div>
      )}
    </li>
  );
}

function CommentRow({ comment: c, canDelete, onLike, onReply, onDelete, formatTime, isReply = false }) {
  return (
    <div className="flex gap-2.5">
      <Link to={`/profile/${c.user?.id}`} className="shrink-0">
        <img
          src={c.user?.avatar_url || '/avatar-placeholder.png'}
          alt={`Avatar de ${c.user?.full_name || 'usuario'}`}
          loading="lazy"
          className={`${isReply ? 'w-7 h-7' : 'w-8 h-8'} rounded-full object-cover bg-dark-600`}
        />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Link to={`/profile/${c.user?.id}`} className="text-white text-xs font-bold truncate">
            {c.user?.full_name || 'Usuario'}
          </Link>
          {c.user?.is_verified && <VerifiedBadge size={11} />}
          <span className="text-[10px] text-gray-500">· {formatTime(c.created_at)}</span>
        </div>
        <p className="text-gray-200 text-sm leading-snug whitespace-pre-line break-words">{c.content}</p>
        <div className="flex items-center gap-4 mt-1.5">
          {!isReply && (
            <button
              onClick={onReply}
              aria-label="Responder"
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300"
            >
              <FiCornerDownRight size={11} /> Responder
            </button>
          )}
          {isReply && (
            <button
              onClick={onReply}
              aria-label="Responder"
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300"
            >
              Responder
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              aria-label="Borrar"
              className="text-[11px] text-gray-500 hover:text-red-400 flex items-center gap-1"
            >
              <FiTrash2 size={10} /> Borrar
            </button>
          )}
        </div>
      </div>
      {/* Like en la derecha */}
      <button
        onClick={onLike}
        aria-label="Me gusta"
        className="shrink-0 flex flex-col items-center gap-0.5 -my-1 p-1"
      >
        <FiHeart
          size={isReply ? 13 : 14}
          className={c.viewer_liked ? 'text-pink-500 fill-current' : 'text-gray-500 hover:text-gray-300'}
        />
        {(c.likes_count || 0) > 0 && (
          <span className={`text-[10px] ${c.viewer_liked ? 'text-pink-400' : 'text-gray-500'}`}>
            {c.likes_count}
          </span>
        )}
      </button>
    </div>
  );
}
