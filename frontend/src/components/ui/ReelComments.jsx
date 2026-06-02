import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FiX, FiSend, FiTrash2 } from 'react-icons/fi';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';
import VerifiedBadge from './VerifiedBadge.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import toast from 'react-hot-toast';

// Drawer modal de comments para un reel. Se desliza desde abajo en mobile,
// es un panel lateral en desktop.
//
// Props:
//   reelId: string | null   — si null, no se muestra
//   reelOwnerId?: string    — para permisos de borrado
//   onClose: () => void
//   onCommentAdded?: (delta: 1 | -1) => void  — para que el padre actualice comments_count
export default function ReelComments({ reelId, reelOwnerId, onClose, onCommentAdded }) {
  const { user } = useAuthStore();
  const confirm = useConfirm();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(null);
  const inputRef = useRef(null);

  const open = !!reelId;

  // Cargar comments al abrir
  useEffect(() => {
    if (!reelId) {
      setComments([]);
      cursorRef.current = null;
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

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/api/reels/${reelId}/comments`, { content });
      setComments(prev => [data.comment, ...prev]);
      setText('');
      onCommentAdded?.(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar el comentario');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId) => {
    const ok = await confirm({
      title: '¿Borrar este comentario?',
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/reels/${reelId}/comments/${commentId}`);
      setComments(prev => prev.filter(c => c.id !== commentId));
      onCommentAdded?.(-1);
    } catch {
      toast.error('No se pudo borrar');
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center sm:items-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Comentarios del reel"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="bg-dark-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl h-[85vh] sm:h-[70vh] flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <h3 className="text-white font-bold">Comentarios</h3>
              <button
                onClick={onClose}
                aria-label="Cerrar comentarios"
                className="text-gray-400 hover:text-white p-1 -m-1"
              >
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
                <div className="text-center py-12 text-gray-500 text-sm">
                  Sé el primero en comentar 💬
                </div>
              ) : (
                <ul className="space-y-3 py-2">
                  {comments.map(c => {
                    const canDelete = c.user?.id === user?.id || reelOwnerId === user?.id;
                    return (
                      <li key={c.id} className="flex gap-2.5">
                        <Link to={`/profile/${c.user?.id}`} className="shrink-0">
                          <img
                            src={c.user?.avatar_url || '/avatar-placeholder.png'}
                            alt={`Avatar de ${c.user?.full_name || 'usuario'}`}
                            loading="lazy"
                            className="w-8 h-8 rounded-full object-cover bg-dark-600"
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
                          <p className="text-gray-200 text-sm leading-snug whitespace-pre-line break-words">
                            {c.content}
                          </p>
                        </div>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            aria-label="Borrar comentario"
                            className="shrink-0 text-gray-600 hover:text-red-400 p-1"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        )}
                      </li>
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
            <div className="p-3 border-t border-white/5 shrink-0">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Agrega un comentario..."
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
