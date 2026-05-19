import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiLock, FiCheck, FiGlobe, FiImage } from 'react-icons/fi';
import { supabase } from '../../lib/supabase.js';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';
import { useChatStore } from '../../store/chatStore.js';
import MessageLimitBanner from './MessageLimitBanner.jsx';
import PremiumModal from './PremiumModal.jsx';
import { compressChatImage } from '../../lib/imageCompressor.js';

export default function ChatWindow({ matchId, otherUser }) {
  const { user, profile } = useAuthStore();
  const { remaining, limit, setCount, decrementRemaining } = useChatStore();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const bottomRef = useRef(null);
  const topRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null);
  const translationCache = useRef({});
  const imageInputRef = useRef(null);

  const myLang = profile?.language || 'es';
  const otherLang = otherUser?.language || 'es';
  const languagesDiffer = myLang !== otherLang;

  useEffect(() => {
    loadMessages();
    loadCount();

    const msgChannel = supabase
      .channel(`match-${matchId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        if (autoTranslate && payload.new.sender_id !== user?.id && payload.new.content) {
          translateMessage(payload.new.id, payload.new.content);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_read: payload.new.is_read } : m));
      })
      .subscribe();

    const typingChannel = supabase
      .channel(`typing-${matchId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== user?.id) {
          setOtherTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
        }
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  const loadMessages = async () => {
    try {
      const { data } = await api.get(`/api/messages/${matchId}?limit=50`);
      setMessages(data.messages || []);
      setHasMore(data.hasMore || false);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0].created_at;
      const { data } = await api.get(`/api/messages/${matchId}?limit=50&before=${encodeURIComponent(oldest)}`);
      if (data.messages?.length > 0) {
        setMessages(prev => [...data.messages, ...prev]);
        setHasMore(data.hasMore || false);
        // Mantener posición de scroll: saltar al primer mensaje que había antes
        setTimeout(() => topRef.current?.scrollIntoView({ block: 'start' }), 50);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const loadCount = async () => {
    const { data } = await api.get('/api/messages/count/today');
    setCount({ count: data.count, remaining: data.remaining, limit: data.limit });
  };

  const translateMessage = async (msgId, content) => {
    if (translationCache.current[msgId]) return;
    try {
      const { data } = await api.post('/api/translate', { text: content, from: otherLang, to: myLang });
      if (data.translated) {
        translationCache.current[msgId] = data.translated;
        setMessages(prev => [...prev]);
      }
    } catch {}
  };

  const handleToggleTranslation = async () => {
    const next = !autoTranslate;
    setAutoTranslate(next);
    if (next) {
      setTranslating(true);
      const toTranslate = messages.filter(m => m.sender_id !== user?.id && m.content && !translationCache.current[m.id]);
      await Promise.all(toTranslate.map(m => translateMessage(m.id, m.content)));
      setTranslating(false);
    }
  };

  const sendTypingSignal = useCallback(() => {
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user?.id },
    });
  }, [user?.id]);

  const handleTextChange = (e) => {
    setText(e.target.value);
    sendTypingSignal();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    if (!profile?.is_premium && remaining <= 0) {
      setShowPremiumModal(true);
      return;
    }

    setSending(true);
    try {
      await api.post('/api/messages', { matchId, content: text.trim() });
      setText('');
      if (!profile?.is_premium) decrementRemaining();
    } catch (err) {
      if (err.response?.data?.code === 'MESSAGE_LIMIT_REACHED') setShowPremiumModal(true);
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    if (!profile?.is_premium && remaining <= 0) {
      setShowPremiumModal(true);
      return;
    }

    setSendingImage(true);
    const compressed = await compressChatImage(file);
    const fd = new FormData();
    fd.append('image', compressed);
    fd.append('matchId', matchId);
    try {
      await api.post('/api/messages/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!profile?.is_premium) decrementRemaining();
    } catch (err) {
      if (err.response?.data?.code === 'MESSAGE_LIMIT_REACHED') setShowPremiumModal(true);
    } finally {
      setSendingImage(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {!profile?.is_premium && <MessageLimitBanner remaining={remaining} limit={limit} onUpgrade={() => setShowPremiumModal(true)} />}

      {/* Banner de traducción */}
      {languagesDiffer && (
        <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <FiGlobe size={13} />
            <span>
              {otherUser?.full_name?.split(' ')[0]} habla{' '}
              <span className="text-white font-medium capitalize">{otherLang.toUpperCase()}</span>
            </span>
          </div>
          <button
            onClick={handleToggleTranslation}
            disabled={translating}
            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
              autoTranslate
                ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30'
                : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            {translating ? 'Traduciendo...' : autoTranslate ? '✓ Traduciendo' : 'Traducir'}
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Botón cargar mensajes anteriores */}
        {hasMore && (
          <div className="text-center">
            <button
              onClick={loadMoreMessages}
              disabled={loadingMore}
              className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50 bg-dark-800 px-4 py-1.5 rounded-full border border-white/10"
            >
              {loadingMore ? 'Cargando...' : 'Ver mensajes anteriores'}
            </button>
          </div>
        )}
        <div ref={topRef} />

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const cached = !isMe && autoTranslate && msg.content ? translationCache.current[msg.id] : null;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {msg.image_url ? (
                  // Mensaje de imagen
                  <div className={`max-w-[65%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <button
                      onClick={() => setLightboxImg(msg.image_url)}
                      className="rounded-2xl overflow-hidden shadow-lg hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={msg.image_url}
                        alt="Foto"
                        className="max-w-full max-h-60 object-cover"
                        loading="lazy"
                      />
                    </button>
                    <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[10px] text-gray-600">
                        {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && (
                        <FiCheck size={11} className={msg.is_read ? 'text-blue-400' : 'text-gray-600'} />
                      )}
                    </div>
                  </div>
                ) : (
                  // Mensaje de texto
                  <div
                    className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                      isMe
                        ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-br-sm'
                        : 'bg-dark-700 text-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {cached ? (
                      <>
                        <p>{cached}</p>
                        <p className="text-[10px] mt-1 opacity-50 italic">{msg.content}</p>
                      </>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-white/50' : 'text-gray-500'}`}>
                      <span className="text-[10px]">
                        {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && (
                        <FiCheck
                          size={11}
                          className={msg.is_read ? 'text-blue-300' : 'text-white/40'}
                        />
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Indicador de escritura */}
        <AnimatePresence>
          {otherTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex justify-start"
            >
              <div className="bg-dark-700 px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1">
                {[0, 150, 300].map(d => (
                  <div
                    key={d}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-white/5">
        <div className="flex gap-2">
          {/* Botón de imagen */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={sendingImage || (!profile?.is_premium && remaining <= 0)}
            className="w-10 h-10 shrink-0 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-brand-400 hover:bg-dark-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Enviar foto"
          >
            {sendingImage
              ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              : <FiImage size={16} />
            }
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          <input
            value={text}
            onChange={handleTextChange}
            placeholder={!profile?.is_premium && remaining <= 0 ? 'Límite alcanzado' : 'Escribe un mensaje...'}
            disabled={!profile?.is_premium && remaining <= 0}
            className="input-field flex-1 py-2.5"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!text.trim() || sending || (!profile?.is_premium && remaining <= 0)}
            className="btn-primary px-4 py-2.5"
          >
            {!profile?.is_premium && remaining <= 0 ? <FiLock /> : <FiSend />}
          </button>
        </div>
      </form>

      {/* Lightbox de imagen */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImg(null)}
          >
            <img
              src={lightboxImg}
              alt="Foto"
              className="max-w-full max-h-full rounded-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
