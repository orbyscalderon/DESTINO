import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiSend, FiUsers, FiSmile } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import StickerPanel from '../components/ui/StickerPanel.jsx';
import toast from 'react-hot-toast';

export default function ConversationChat() {
  const { id } = useParams();
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [conv, setConv] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/conversations/${id}`).then(({ data }) => {
      setConv(data.conversation);
      setMembers(data.members);
    }).catch(() => {
      toast.error('No tienes acceso a este grupo');
      navigate('/conversations');
    });

    // Cargar mensajes
    supabase.from('messages')
      .select('id, sender_id, content, type, sticker_id, created_at, sticker:sticker_items!sticker_id(id, image_url, label), sender:profiles!sender_id(id, full_name, avatar_url)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => setMessages(data || []));

    // Mark read
    api.post(`/api/conversations/${id}/read`).catch(() => {});

    // Realtime
    const channel = supabase.channel(`conv:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        // Fetch hidratada
        supabase.from('messages')
          .select('id, sender_id, content, type, sticker_id, created_at, sticker:sticker_items!sticker_id(id, image_url, label), sender:profiles!sender_id(id, full_name, avatar_url)')
          .eq('id', payload.new.id).single()
          .then(({ data }) => { if (data) setMessages(prev => [...prev, data]); });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, navigate]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post('/api/messages', { conversationId: id, content: text, type: 'text' });
      setText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar');
    } finally { setSending(false); }
  };

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
    <div className="h-screen flex flex-col bg-dark-900">
      {/* Header */}
      <div className="glass border-b border-white/5 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/conversations')} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
          <FiArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/30 flex items-center justify-center text-lg shrink-0">
          {conv.avatar_url ? <img src={conv.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" /> : '👥'}
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
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-end gap-1.5 max-w-[80%] ${isMe ? 'flex-row-reverse' : ''}`}>
                {!isMe && (
                  <img src={msg.sender?.avatar_url || '/avatar-placeholder.png'} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                )}
                {msg.type === 'sticker' && msg.sticker ? (
                  <img src={msg.sticker.image_url} alt={msg.sticker.label || ''} className="max-w-[140px] max-h-[140px] object-contain" />
                ) : (
                  <div className={`px-3.5 py-2 rounded-2xl text-sm ${isMe ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-br-sm' : 'bg-white/5 border border-white/10 text-gray-100 rounded-bl-sm'}`}>
                    {!isMe && (
                      <p className="text-[10px] text-brand-300 font-bold mb-0.5">{msg.sender?.full_name?.split(' ')[0]}</p>
                    )}
                    <p>{msg.content}</p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

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
