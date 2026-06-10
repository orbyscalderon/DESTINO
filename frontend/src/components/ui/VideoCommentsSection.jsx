import { useEffect, useState } from 'react';
import { FiHeart, FiCornerDownRight, FiMoreVertical, FiTrash2, FiBookmark } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';

export default function VideoCommentsSection({ videoId, videoOwnerId }) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  const load = async (reset = false) => {
    const c = reset ? 0 : cursor;
    try {
      const r = await api.get(`/api/adult-video/comments/${videoId}?cursor=${c}&limit=20`);
      setComments(prev => reset ? r.data?.comments : [...prev, ...(r.data?.comments || [])]);
      setCursor(r.data?.nextCursor ?? c);
      setHasMore(r.data?.nextCursor != null);
    } catch {}
  };
  useEffect(() => { load(true); }, [videoId]);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await api.post('/api/adult-video/comments', {
        video_id: videoId, content: text.trim(),
        parent_id: replyingTo?.id || null,
      });
      setText('');
      setReplyingTo(null);
      load(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setPosting(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold">{comments.length} comentarios</h2>

      {user ? (
        <div className="space-y-2">
          {replyingTo && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              Respondiendo a <span className="text-brand-400">@{replyingTo.user?.username || 'user'}</span>
              <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-white">cancelar</button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Escribe un comentario…"
              className="flex-1 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm resize-y"
            />
            <button
              onClick={post}
              disabled={posting || !text.trim()}
              className="px-4 self-end py-2 rounded-xl bg-brand-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {posting ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Inicia sesión para comentar</p>
      )}

      <div className="space-y-3">
        {comments.map(c => (
          <Comment
            key={c.id} c={c} videoOwnerId={videoOwnerId}
            onReply={() => setReplyingTo(c)}
            onChange={() => load(true)}
          />
        ))}
        {hasMore && (
          <button onClick={() => load(false)} className="text-sm text-gray-400 hover:text-white">
            Cargar más
          </button>
        )}
      </div>
    </div>
  );
}

function Comment({ c, videoOwnerId, onReply, onChange }) {
  const { user } = useAuthStore();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(c.likes_count || 0);
  const [replies, setReplies] = useState(null);
  const [showReplies, setShowReplies] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleLike = async () => {
    setLiked(l => !l);
    setLikeCount(n => liked ? n - 1 : n + 1);
    try {
      const r = await api.post(`/api/adult-video/comments/${c.id}/like`);
      if (r.data?.liked !== !liked) {
        // server diff — revert
        setLiked(r.data.liked);
        setLikeCount(c.likes_count + (r.data.liked ? 1 : 0));
      }
    } catch {}
  };

  const togglePin = async () => {
    await api.patch(`/api/adult-video/comments/${c.id}`, { is_pinned: !c.is_pinned });
    onChange?.();
  };

  const del = async () => {
    if (!confirm('¿Eliminar comentario?')) return;
    await api.delete(`/api/adult-video/comments/${c.id}`);
    onChange?.();
  };

  const loadReplies = async () => {
    if (replies) { setShowReplies(s => !s); return; }
    const r = await api.get(`/api/adult-video/comments/${c.video_id || ''}/${c.id}/replies`).catch(() => null);
    setReplies(r?.data?.replies || []);
    setShowReplies(true);
  };

  const canPin    = user?.id === videoOwnerId;
  const canDelete = user?.id === c.user?.id || user?.id === videoOwnerId;

  return (
    <div className={`flex gap-3 ${c.is_pinned ? 'p-3 -mx-3 rounded-xl bg-brand-500/5 border border-brand-500/20' : ''}`}>
      <img
        src={c.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user?.full_name || '?')}`}
        alt="" className="w-8 h-8 rounded-full object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white font-bold">{c.user?.full_name || 'user'}</span>
          {c.user?.is_verified && <span className="text-brand-400">✓</span>}
          {c.is_pinned && <span className="text-brand-400">📌 fijado</span>}
          <span className="text-gray-500">·</span>
          <span className="text-gray-500">{new Date(c.created_at).toLocaleDateString('es')}</span>
          {c.edited_at && <span className="text-gray-600 italic">(editado)</span>}
        </div>
        <p className="text-gray-200 text-sm mt-1 break-words">{c.content}</p>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <button onClick={toggleLike} className={`flex items-center gap-1 ${liked ? 'text-rose-400' : 'text-gray-500 hover:text-rose-400'}`}>
            <FiHeart size={12} fill={liked ? 'currentColor' : 'none'} /> {likeCount}
          </button>
          <button onClick={onReply} className="flex items-center gap-1 text-gray-500 hover:text-white">
            <FiCornerDownRight size={12} /> Responder
          </button>
          {(canPin || canDelete) && (
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)} className="text-gray-500 hover:text-white">
                <FiMoreVertical size={12} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-dark-800 border border-white/10 rounded-lg p-1 min-w-[120px] z-10">
                  {canPin && (
                    <button onClick={() => { togglePin(); setMenuOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 rounded flex items-center gap-2">
                      <FiBookmark size={11} /> {c.is_pinned ? 'Desfijar' : 'Fijar'}
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => { del(); setMenuOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 rounded text-rose-400 flex items-center gap-2">
                      <FiTrash2 size={11} /> Borrar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {showReplies && replies?.length > 0 && (
          <div className="mt-3 space-y-2 pl-3 border-l border-white/10">
            {replies.map(r => (
              <div key={r.id} className="flex gap-2">
                <img src={r.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user?.full_name || '?')}`}
                  className="w-6 h-6 rounded-full" />
                <div className="flex-1 text-xs">
                  <span className="text-white font-bold">{r.user?.full_name}</span>
                  <span className="text-gray-500"> · {new Date(r.created_at).toLocaleDateString('es')}</span>
                  <p className="text-gray-200 mt-0.5">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
