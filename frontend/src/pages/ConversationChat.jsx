import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiSend, FiUsers, FiSmile, FiX, FiCornerUpLeft, FiTrash2 } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import StickerPanel from '../components/ui/StickerPanel.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '😮'];

export default function ConversationChat() {
  const { id } = useParams();
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [conv, setConv] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState({}); // { msgId: { emoji: count } }
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { id, content, senderName }
  const [msgMenu, setMsgMenu] = useState(null); // { id, isMe }
  const bottomRef = useRef(null);
  const longPressRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/conversations/${id}`).then(({ data }) => {
      setConv(data.conversation);
      setMembers(data.members);
    }).catch(() => {
      toast.error('No tienes acceso a este grupo');
      navigate('/conversations');
    });

    // Cargar mensajes + reactions
    supabase.from('messages')
      .select(`
        id, sender_id, content, type, sticker_id, created_at,
        sticker:sticker_items!sticker_id(id, image_url, label),
        sender:profiles!sender_id(id, full_name, avatar_url),
        reactions:message_reactions(id, user_id, emoji)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages(data || []);
        const rmap = {};
        (data || []).forEach(m => {
          if (m.reactions?.length) {
            const c = {};
            m.reactions.forEach(r => { c[r.emoji] = (c[r.emoji] || 0) + 1; });
            rmap[m.id] = c;
          }
        });
        setReactions(rmap);
      });

    // Mark read
    api.post(`/api/conversations/${id}/read`).catch(() => {});

    // Realtime
    const channel = supabase.channel(`conv:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        supabase.from('messages')
          .select('id, sender_id, content, type, sticker_id, created_at, sticker:sticker_items!sticker_id(id, image_url, label), sender:profiles!sender_id(id, full_name, avatar_url)')
          .eq('id', payload.new.id).single()
          .then(({ data }) => {
            if (!data) return;
            setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
          });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, async (payload) => {
        // Verificar que la reaction es para un mensaje de esta conversation
        const msgId = payload.new.message_id;
        if (!messages.some(m => m.id === msgId)) return;
        setReactions(prev => {
          const cur = { ...(prev[msgId] || {}) };
          cur[payload.new.emoji] = (cur[payload.new.emoji] || 0) + 1;
          return { ...prev, [msgId]: cur };
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, navigate]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!text.trim() || sending) return;
    const content = replyTo
      ? `> ${replyTo.senderName}: ${(replyTo.content || '').substring(0, 80)}${replyTo.content?.length > 80 ? '…' : ''}\n${text.trim()}`
      : text.trim();
    setSending(true);
    setReplyTo(null);
    try {
      await api.post('/api/messages', { conversationId: id, content, type: 'text' });
      setText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar');
    } finally { setSending(false); }
  };

  const toggleReaction = async (msgId, emoji) => {
    setMsgMenu(null);
    // Optimistic
    setReactions(prev => {
      const cur = { ...(prev[msgId] || {}) };
      cur[emoji] = (cur[emoji] || 0) + 1;
      return { ...prev, [msgId]: cur };
    });
    try {
      await api.post(`/api/messages/${msgId}/reactions`, { emoji });
    } catch { /* silent */ }
  };

  const deleteMessage = async (msgId) => {
    setMsgMenu(null);
    const ok = await confirm({
      title: '¿Borrar mensaje?',
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/messages/${msgId}`, { data: { forAll: true } });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '🗑️ Mensaje eliminado', type: 'text', sticker: null, deleted_for_all: true } : m));
    } catch { toast.error('No se pudo borrar'); }
  };

  const startLongPress = (msgId, isMe) => {
    longPressRef.current = setTimeout(() => setMsgMenu({ id: msgId, isMe }), 500);
  };
  const cancelLongPress = () => clearTimeout(longPressRef.current);

  const sendSticker = async ({ sticker_id }) => {
    try {
      await api.post('/api/messages', { conversationId: id, type: 'sticker', sticker_id });
      setShowStickers(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  if (!conv) return null;

  return (
    <div className="h-screen flex flex-col bg-dark-900 relative">
      {/* Header */}
      <div className="glass border-b border-white/5 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/conversations')} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
          <FiArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/30 flex items-center justify-center text-lg shrink-0">
          {conv.avatar_url ? <img loading="lazy" src={conv.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" /> : '👥'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{conv.name}</p>
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <FiUsers size={9} /> {members.length} miembros
          </p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const isMe = msg.sender_id === user?.id;
          const msgReacts = reactions[msg.id] || {};
          const hasReacts = Object.keys(msgReacts).length > 0;
          // Parse quote (líneas que empiezan con "> ")
          const quoteMatch = msg.content?.match(/^> (.+?)\n([\s\S]+)$/);
          const quote = quoteMatch?.[1];
          const body = quoteMatch?.[2] || msg.content;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`flex items-end gap-1.5 max-w-[80%] ${isMe ? 'flex-row-reverse' : ''}`}
                onMouseDown={() => startLongPress(msg.id, isMe)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress(msg.id, isMe)}
                onTouchEnd={cancelLongPress}
                onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ id: msg.id, isMe }); }}
              >
                {!isMe && (
                  <img loading="lazy" src={msg.sender?.avatar_url || '/avatar-placeholder.png'} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                )}
                {msg.type === 'sticker' && msg.sticker ? (
                  <img loading="lazy" src={msg.sticker.image_url} alt={msg.sticker.label || ''} className="max-w-[140px] max-h-[140px] object-contain" />
                ) : (
                  <div className={`px-3.5 py-2 rounded-2xl text-sm ${isMe ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-br-sm' : 'bg-white/5 border border-white/10 text-gray-100 rounded-bl-sm'}`}>
                    {!isMe && (
                      <p className="text-[10px] text-brand-300 font-bold mb-0.5">{msg.sender?.full_name?.split(' ')[0]}</p>
                    )}
                    {quote && (
                      <div className={`text-[11px] mb-2 px-2 py-1 rounded-lg border-l-2 opacity-70 ${isMe ? 'bg-white/10 border-white/40 text-white/80' : 'bg-white/5 border-brand-400/60 text-gray-300'}`}>
                        {quote}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{body}</p>
                  </div>
                )}
              </div>
              {hasReacts && (
                <div className={`flex gap-0.5 mt-0.5 flex-wrap ${isMe ? 'justify-end' : 'justify-start'} ${!isMe ? 'ml-9' : ''}`}>
                  {Object.entries(msgReacts).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(msg.id, emoji)}
                      className="flex items-center gap-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-1.5 py-0.5 text-xs transition-colors"
                    >
                      <span>{emoji}</span>
                      {count > 1 && <span className="text-gray-400 text-[10px]">{count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-dark-900/60 backdrop-blur-xl border-t border-white/5">
              <div className="flex-1 border-l-2 border-brand-500 pl-2 min-w-0">
                <p className="text-brand-400 text-[10px] font-semibold">{replyTo.senderName}</p>
                <p className="text-gray-400 text-xs truncate">{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-gray-500 hover:text-white hover:bg-white/5 p-1 -m-1 rounded transition-colors shrink-0">
                <FiX size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu (long-press) */}
      <AnimatePresence>
        {msgMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-40 flex items-end justify-center pb-32"
            onClick={() => setMsgMenu(null)}
          >
            <div className="glass-strong rounded-2xl shadow-2xl shadow-black/60 p-2 min-w-[220px]" onClick={e => e.stopPropagation()}>
              <div className="flex gap-1 px-2 py-1.5 border-b border-white/5">
                {REACTION_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(msgMenu.id, emoji)}
                    className="text-xl hover:scale-125 transition-transform active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    const msg = messages.find(m => m.id === msgMenu.id);
                    setReplyTo({ id: msg.id, content: msg.content || (msg.sticker ? '🎟️ Sticker' : ''), senderName: msg.sender?.full_name || 'Alguien' });
                    setMsgMenu(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <FiCornerUpLeft size={14} /> Responder
                </button>
                {msgMenu.isMe && (
                  <button
                    onClick={() => deleteMessage(msgMenu.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <FiTrash2 size={14} /> Borrar
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <form onSubmit={send} className="p-4 border-t border-white/5 shrink-0 flex gap-2 relative">
        <button
          type="button"
          onClick={() => setShowStickers(s => !s)}
          className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-brand-400 hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-90"
          title="Stickers"
        >
          <FiSmile size={16} />
        </button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Escribe un mensaje..."
          maxLength={500}
          className="input-field flex-1 py-2.5"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="btn-primary px-4 py-2.5 shadow-glow disabled:opacity-50"
        >
          <FiSend size={15} />
        </button>

        {showStickers && (
          <StickerPanel onClose={() => setShowStickers(false)} onSend={sendSticker} />
        )}
      </form>
    </div>
  );
}
