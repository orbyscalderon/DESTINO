import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiLock, FiCheck, FiGlobe, FiImage, FiZap, FiX, FiCornerUpLeft, FiClock, FiSearch, FiMic, FiPlay, FiPause, FiTrash2, FiBookmark, FiVideo } from 'react-icons/fi';

function DoubleCheck({ isRead, light = false }) {
  const color = isRead ? 'text-blue-400' : light ? 'text-white/40' : 'text-gray-600';
  return (
    <span className="relative inline-flex items-center shrink-0">
      <FiCheck size={10} className={color} />
      <FiCheck size={10} className={`-ml-[5px] ${color}`} />
    </span>
  );
}

function AudioPlayer({ url, duration, isMe }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const fmt = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else audio.play();
    setPlaying(p => !p);
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[160px] max-w-[220px] ${isMe ? 'bg-gradient-to-br from-brand-500 to-brand-700' : 'bg-dark-700'}`}>
      <audio ref={audioRef} src={url} preload="none"
        onTimeUpdate={e => { setCurrentTime(e.target.currentTime); setProgress(e.target.currentTime / (e.target.duration || 1) * 100); }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
      />
      <button onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isMe ? 'bg-white/20 text-white' : 'bg-brand-500/20 text-brand-400'}`}>
        {playing ? <FiPause size={14} /> : <FiPlay size={14} />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1 rounded-full overflow-hidden ${isMe ? 'bg-white/20' : 'bg-dark-600'}`}>
          <div className={`h-full rounded-full transition-all ${isMe ? 'bg-white/70' : 'bg-brand-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[10px] ${isMe ? 'text-white/60' : 'text-gray-500'}`}>{playing ? fmt(currentTime) : fmt(duration)}</span>
      </div>
      <FiMic size={11} className={isMe ? 'text-white/40' : 'text-gray-600'} />
    </div>
  );
}
import { supabase } from '../../lib/supabase.js';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';
import { useChatStore } from '../../store/chatStore.js';
import MessageLimitBanner from './MessageLimitBanner.jsx';
import PremiumModal from './PremiumModal.jsx';
import { compressChatImage } from '../../lib/imageCompressor.js';
import { useConfirm } from './ConfirmDialog.jsx';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '😮'];

export default function ChatWindow({ matchId, otherUser }) {
  const { user, profile } = useAuthStore();
  const { remaining, limit, setCount, decrementRemaining } = useChatStore();
  const confirm = useConfirm();
  const isPremiumPlus = profile?.premium_tier === 'premium' || profile?.premium_tier === 'vip';
  const [messages, setMessages]         = useState([]);
  const [text, setText]                 = useState('');
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [sending, setSending]           = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [otherTyping, setOtherTyping]   = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [translating, setTranslating]   = useState(false);
  const [lightboxImg, setLightboxImg]   = useState(null);
  const [showPPVPanel, setShowPPVPanel] = useState(false);
  const [ppvFile, setPpvFile]           = useState(null);
  const [ppvPreview, setPpvPreview]     = useState(null);
  const [ppvPrice, setPpvPrice]         = useState('50');
  const [sendingPPV, setSendingPPV]     = useState(false);

  // Nuevas features
  const [replyTo, setReplyTo]           = useState(null);    // { id, content, senderName }
  const [reactions, setReactions]       = useState({});      // { msgId: { emoji: count } }
  const [reactionPicker, setReactionPicker] = useState(null); // msgId
  const [disappearing, setDisappearing] = useState(false);   // filtrar msgs >24h
  const [searchMode, setSearchMode]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');

  // Voz
  const [recording, setRecording]       = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const recordingTimerRef = useRef(null);

  // Delete / context menu
  const [msgMenu, setMsgMenu]           = useState(null); // { id, isMe, x, y }
  const [clearingConv, setClearingConv] = useState(false);
  // Pinned message
  const [pinnedList, setPinnedList]     = useState([]); // hasta 3 mensajes (v63)
  const [pinnedExpanded, setPinnedExpanded] = useState(false);

  // GIF picker
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [gifQuery, setGifQuery]         = useState('');
  const [gifs, setGifs]                 = useState([]);
  const [loadingGifs, setLoadingGifs]   = useState(false);
  const gifDebounceRef = useRef(null);

  const bottomRef       = useRef(null);
  const topRef          = useRef(null);
  const typingTimeoutRef  = useRef(null);
  const typingChannelRef  = useRef(null);
  const reactChannelRef   = useRef(null);
  const translationCache  = useRef({});
  const imageInputRef     = useRef(null);
  const videoInputRef     = useRef(null);
  const [sendingVideo, setSendingVideo] = useState(false);
  const ppvFileRef        = useRef(null);
  const longPressRef      = useRef(null);

  const myLang = profile?.language || 'es';
  const otherLang = otherUser?.language || 'es';
  const languagesDiffer = myLang !== otherLang;

  useEffect(() => {
    loadMessages();
    loadCount();
    loadPinnedMessage();

    const msgChannel = supabase
      .channel(`match-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
          if (autoTranslate && payload.new.sender_id !== user?.id && payload.new.content) {
            translateMessage(payload.new.id, payload.new.content);
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
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

    // Canal de reacciones (broadcast, sin persistencia)
    const reactChannel = supabase
      .channel(`react-${matchId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (payload.userId !== user?.id) applyReaction(payload.msgId, payload.emoji);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;
    reactChannelRef.current  = reactChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(reactChannel);
      clearTimeout(typingTimeoutRef.current);
      clearInterval(recordingTimerRef.current);
    };
  }, [matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  const loadMessages = async () => {
    try {
      const { data } = await api.get(`/api/messages/${matchId}?limit=50`);
      const msgs = data.messages || [];
      setMessages(msgs);
      setHasMore(data.hasMore || false);
      const initialReactions = {};
      msgs.forEach(m => {
        if (m.reactions?.length) {
          const counts = {};
          m.reactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
          initialReactions[m.id] = counts;
        }
      });
      setReactions(initialReactions);
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
      // allSettled para que un mensaje fallando no cancele las traducciones del resto
      await Promise.allSettled(toTranslate.map(m => translateMessage(m.id, m.content)));
      setTranslating(false);
    }
  };

  const handleClearConversation = async () => {
    const ok = await confirm({
      title: '¿Borrar toda la conversación?',
      message: 'Esta acción no se puede deshacer. Se eliminarán todos los mensajes para ambos lados.',
      confirmLabel: 'Borrar conversación',
      destructive: true,
    });
    if (!ok) return;
    setClearingConv(true);
    try {
      await api.delete(`/api/messages/${matchId}/all`);
      setMessages([]);
      setPinnedMsg(null);
      toast.success('Conversación eliminada');
    } catch {
      toast.error('Error al eliminar la conversación');
    } finally {
      setClearingConv(false);
    }
  };

  const sendTypingSignal = useCallback(() => {
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: user?.id } });
  }, [user?.id]);

  const handleTextChange = (e) => {
    setText(e.target.value);
    sendTypingSignal();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    if (!isPremiumPlus && remaining <= 0) { setShowPremiumModal(true); return; }

    const payload = {
      matchId,
      content: replyTo
        ? `> ${replyTo.senderName}: ${replyTo.content.substring(0, 80)}${replyTo.content.length > 80 ? '…' : ''}\n${text.trim()}`
        : text.trim(),
    };

    setSending(true);
    setReplyTo(null);
    try {
      await api.post('/api/messages', payload);
      setText('');
      if (!isPremiumPlus) decrementRemaining();
    } catch (err) {
      if (err.response?.data?.code === 'MESSAGE_LIMIT_REACHED') setShowPremiumModal(true);
    } finally {
      setSending(false);
    }
  };

  // ── Reacciones ─────────────────────────────────────────────────────────────────
  const applyReaction = (msgId, emoji) => {
    setReactions(prev => {
      const current = prev[msgId] || {};
      return { ...prev, [msgId]: { ...current, [emoji]: (current[emoji] || 0) + 1 } };
    });
  };

  const handleReact = (msgId, emoji) => {
    applyReaction(msgId, emoji);
    setReactionPicker(null);
    reactChannelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { msgId, emoji, userId: user?.id } }).catch(() => {});
    api.post(`/api/messages/${msgId}/reactions`, { emoji }).catch(() => {});
  };

  const loadPinnedMessage = async () => {
    try {
      const { data } = await api.get(`/api/messages/${matchId}/pin`);
      setPinnedList(data.pinned_list || (data.pinned ? [data.pinned] : []));
    } catch {}
  };

  const handleDeleteMessage = async (msgId, forAll) => {
    setMsgMenu(null);
    try {
      await api.delete(`/api/messages/${msgId}`, { data: { forAll } });
      if (forAll) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '🗑️ Mensaje eliminado', deleted_for_all: true } : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      }
    } catch { toast.error('No se pudo borrar el mensaje'); }
  };

  const handlePinMessage = async (msgId) => {
    setMsgMenu(null);
    try {
      await api.put(`/api/messages/${matchId}/pin`, { messageId: msgId });
      const msg = messages.find(m => m.id === msgId);
      if (msg) {
        // Push al principio (más reciente), dedupe, max 3 (matchea trigger DB)
        setPinnedList(prev => [msg, ...prev.filter(m => m.id !== msgId)].slice(0, 3));
      }
      toast.success('Mensaje fijado');
    } catch { toast.error('No se pudo fijar el mensaje'); }
  };

  const handleUnpinMessage = async (msgId) => {
    try {
      await api.delete(`/api/messages/${matchId}/pin`, { params: { messageId: msgId } });
      setPinnedList(prev => prev.filter(m => m.id !== msgId));
    } catch {}
  };

  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-brand-500/60');
      setTimeout(() => el.classList.remove('ring-2', 'ring-brand-500/60'), 1800);
    }
  };

  // Long-press / right-click: show context menu (reactions + delete + pin)
  const startLongPress = (msgId, isMe) => {
    longPressRef.current = setTimeout(() => setMsgMenu({ id: msgId, isMe }), 500);
  };
  const cancelLongPress = () => clearTimeout(longPressRef.current);

  // ── GIF ────────────────────────────────────────────────────────────────────────
  const searchGifs = useCallback((q) => {
    clearTimeout(gifDebounceRef.current);
    gifDebounceRef.current = setTimeout(async () => {
      if (!q.trim()) {
        setLoadingGifs(true);
        try {
          const res = await fetch(`https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCY0&limit=16&media_filter=gif`);
          const data = await res.json();
          setGifs(data.results?.map(r => ({ id: r.id, url: r.media_formats?.gif?.url, preview: r.media_formats?.tinygif?.url })) || []);
        } catch { setGifs([]); }
        setLoadingGifs(false);
        return;
      }
      setLoadingGifs(true);
      try {
        const res = await fetch(`https://tenor.googleapis.com/v2/search?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCY0&q=${encodeURIComponent(q)}&limit=16&media_filter=gif`);
        const data = await res.json();
        setGifs(data.results?.map(r => ({ id: r.id, url: r.media_formats?.gif?.url, preview: r.media_formats?.tinygif?.url })) || []);
      } catch { setGifs([]); }
      setLoadingGifs(false);
    }, 400);
  }, []);

  const handleOpenGif = () => {
    setShowGifPanel(v => !v);
    if (!gifs.length) searchGifs('');
  };

  const handleSendGif = async (gif) => {
    if (!isPremiumPlus && remaining <= 0) { setShowPremiumModal(true); return; }
    setShowGifPanel(false);
    try {
      await api.post('/api/messages', { matchId, content: gif.url, type: 'gif' });
      if (!isPremiumPlus) decrementRemaining();
    } catch {}
  };

  // ── Video ──────────────────────────────────────────────────────────────────────
  const handleVideoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 30 * 1024 * 1024) {
      toast.error('Video demasiado grande (máx 30 MB)');
      return;
    }
    if (!isPremiumPlus && remaining <= 0) { setShowPremiumModal(true); return; }
    setSendingVideo(true);
    const fd = new FormData();
    fd.append('video', file);
    fd.append('matchId', matchId);
    try {
      await api.post('/api/messages/video', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!isPremiumPlus) decrementRemaining();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar video');
    } finally {
      setSendingVideo(false);
    }
  };

  // ── Imagen ─────────────────────────────────────────────────────────────────────
  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (!isPremiumPlus && remaining <= 0) { setShowPremiumModal(true); return; }
    setSendingImage(true);
    const compressed = await compressChatImage(file);
    const fd = new FormData();
    fd.append('image', compressed);
    fd.append('matchId', matchId);
    try {
      await api.post('/api/messages/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!isPremiumPlus) decrementRemaining();
    } catch (err) {
      if (err.response?.data?.code === 'MESSAGE_LIMIT_REACHED') setShowPremiumModal(true);
    } finally {
      setSendingImage(false);
    }
  };

  const handlePPVFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setPpvFile(file);
    setPpvPreview(URL.createObjectURL(file));
    setShowPPVPanel(true);
  };

  const handleSendPPV = async () => {
    if (!ppvFile || !ppvPrice) return;
    setSendingPPV(true);
    try {
      const isVideo = ppvFile.type.startsWith('video/');
      const processed = isVideo ? ppvFile : await compressChatImage(ppvFile);
      const fd = new FormData();
      fd.append('media', processed);
      fd.append('matchId', matchId);
      fd.append('ppvPrice', ppvPrice);
      await api.post('/api/messages/ppv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowPPVPanel(false);
      setPpvFile(null);
      if (ppvPreview) URL.revokeObjectURL(ppvPreview);
      setPpvPreview(null);
      setPpvPrice('50');
      toast.success('Mensaje PPV enviado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar PPV');
    } finally {
      setSendingPPV(false);
    }
  };

  const [unlockingPpv, setUnlockingPpv] = useState(null);

  const handleUnlockPPV = async (msg) => {
    if (unlockingPpv === msg.id) return; // protección contra doble click
    setUnlockingPpv(msg.id);
    try {
      const { data } = await api.post(`/api/messages/ppv/${msg.id}/unlock`);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ppv_media_url: data.url } : m));
      toast.success('Contenido desbloqueado');
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Monedas insuficientes — recarga en la sección Monedas');
      } else {
        toast.error(err.response?.data?.error || 'Error al desbloquear');
      }
    } finally {
      setUnlockingPpv(null);
    }
  };

  // ── Voz ────────────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        stream.getTracks().forEach(t => t.stop());
        sendVoiceBlob(blob, recordingSecs);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingSecs(0);
      recordingTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch {
      toast.error('No se pudo acceder al micrófono');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    clearInterval(recordingTimerRef.current);
    setRecording(false);
  };

  const sendVoiceBlob = async (blob, duration) => {
    if (!blob || blob.size === 0) return;
    if (!isPremiumPlus && remaining <= 0) { setShowPremiumModal(true); return; }
    setSendingVoice(true);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
      const fd = new FormData();
      fd.append('audio', blob, `voice.${ext}`);
      fd.append('matchId', matchId);
      fd.append('duration', String(duration));
      await api.post('/api/messages/voice', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!isPremiumPlus) decrementRemaining();
    } catch (err) {
      if (err.response?.data?.code === 'MESSAGE_LIMIT_REACHED') setShowPremiumModal(true);
      else toast.error('Error al enviar audio');
    } finally {
      setSendingVoice(false);
    }
  };

  const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Filtrar mensajes efímeros, borrados, y búsqueda
  const displayMessages = messages.filter(m => {
    if (m.deleted_for_sender && m.sender_id === user.id) return false;
    if (disappearing && Date.now() - new Date(m.created_at).getTime() >= 24 * 60 * 60 * 1000) return false;
    if (searchMode && searchQuery && !m.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Parsear cita en contenido
  const parseQuote = (content) => {
    if (!content?.startsWith('> ')) return { quote: null, body: content };
    const newline = content.indexOf('\n');
    if (newline === -1) return { quote: null, body: content };
    return { quote: content.slice(2, newline), body: content.slice(newline + 1) };
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full relative" onClick={() => { reactionPicker && setReactionPicker(null); msgMenu && setMsgMenu(null); }}>
      {!isPremiumPlus && <MessageLimitBanner remaining={remaining} limit={limit} onUpgrade={() => setShowPremiumModal(true)} />}

      {/* Barra superior: traducción + efímeros */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-white/5 shrink-0 gap-3">
        {languagesDiffer ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
            <FiGlobe size={13} className="shrink-0" />
            <span className="truncate">
              {otherUser?.full_name?.split(' ')[0]} habla{' '}
              <span className="text-white font-medium">{otherLang.toUpperCase()}</span>
            </span>
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle efímeros */}
          <button
            onClick={() => setDisappearing(v => !v)}
            title={disappearing ? 'Mostrando solo últimas 24h' : 'Activar mensajes efímeros'}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-colors ${
              disappearing ? 'bg-purple-500/20 text-purple-400' : 'bg-dark-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            <FiClock size={11} />
            {disappearing ? '24h' : ''}
          </button>

          {/* Toggle traducción */}
          {languagesDiffer && (
            <button
              onClick={handleToggleTranslation}
              disabled={translating}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                autoTranslate ? 'bg-brand-500/20 text-brand-400' : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              {translating ? '...' : autoTranslate ? '✓ Traduciendo' : 'Traducir'}
            </button>
          )}

          {/* Buscar mensajes */}
          <button
            onClick={() => { setSearchMode(v => !v); setSearchQuery(''); }}
            title="Buscar en el chat"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${searchMode ? 'bg-brand-500/20 text-brand-400' : 'bg-dark-700 text-gray-500 hover:text-white'}`}
          >
            <FiSearch size={12} />
          </button>

          {/* Borrar conversación */}
          <button
            onClick={handleClearConversation}
            disabled={clearingConv}
            title="Borrar conversación"
            className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
           aria-label="Eliminar">
            <FiTrash2 size={12} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchMode && (
        <div className="px-4 py-2 bg-dark-800 border-b border-white/5 shrink-0">
          <input
            autoFocus
            className="input-field text-sm py-1.5 w-full"
            placeholder="Buscar mensajes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <p className="text-xs text-gray-500 mt-1">
              {messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase())).length} resultado(s)
            </p>
          )}
        </div>
      )}

      {/* Pinned messages banner (max 3, expandible) */}
      <AnimatePresence>
        {pinnedList.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            {(pinnedExpanded ? pinnedList : pinnedList.slice(0, 1)).map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-4 py-1.5 bg-brand-500/10 border-b border-brand-500/20 hover:bg-brand-500/15 transition-colors cursor-pointer"
                onClick={() => scrollToMessage(p.id)}
              >
                <FiBookmark size={11} className="text-brand-400 shrink-0" />
                <p className="text-xs text-gray-300 truncate flex-1">
                  <span className="text-brand-400 font-medium">Fijado{pinnedList.length > 1 ? ` ${idx + 1}/${pinnedList.length}` : ''}: </span>
                  {p.content || '🎤 Voz'}
                </p>
                {pinnedList.length > 1 && idx === 0 && !pinnedExpanded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setPinnedExpanded(true); }}
                    className="text-[10px] text-brand-400 hover:text-brand-300 font-semibold shrink-0"
                  >
                    +{pinnedList.length - 1} más
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnpinMessage(p.id); }}
                  className="text-gray-500 hover:text-white hover:bg-white/5 p-1 -m-1 rounded transition-colors shrink-0"
                  aria-label="Desfijar"
                >
                  <FiX size={12} />
                </button>
              </div>
            ))}
            {pinnedExpanded && pinnedList.length > 1 && (
              <button
                onClick={() => setPinnedExpanded(false)}
                className="w-full text-center text-[10px] py-1 text-gray-500 hover:text-gray-300 bg-brand-500/5 border-b border-brand-500/10 transition-colors"
              >
                Ocultar
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu overlay */}
      <AnimatePresence>
        {msgMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-40 flex items-end justify-center pb-32"
            onClick={() => setMsgMenu(null)}
          >
            <div className="bg-dark-700 border border-white/10 rounded-2xl shadow-2xl p-2 min-w-[200px]" onClick={e => e.stopPropagation()}>
              {/* Reactions row */}
              <div className="flex gap-1 px-2 py-1.5 border-b border-white/5">
                {REACTION_EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => { handleReact(msgMenu.id, emoji); setMsgMenu(null); }}
                    className="text-xl hover:scale-125 transition-transform active:scale-95">
                    {emoji}
                  </button>
                ))}
              </div>
              {/* Actions */}
              <div className="py-1">
                {(() => {
                  const isPinned = pinnedList.some(p => p.id === msgMenu.id);
                  return (
                    <button
                      onClick={() => {
                        if (isPinned) {
                          handleUnpinMessage(msgMenu.id);
                          setMsgMenu(null);
                        } else {
                          handlePinMessage(msgMenu.id);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-xl"
                    >
                      <FiBookmark size={14} className={isPinned ? 'fill-current text-brand-400' : ''} />
                      {isPinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
                    </button>
                  );
                })()}
                {msgMenu.isMe && (
                  <button onClick={() => handleDeleteMessage(msgMenu.id, true)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl">
                    <FiTrash2 size={14} /> Borrar para todos
                  </button>
                )}
                <button onClick={() => handleDeleteMessage(msgMenu.id, false)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:bg-white/5 rounded-xl">
                  <FiX size={14} /> Borrar para mí
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
          {displayMessages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const cached = !isMe && autoTranslate && msg.content ? translationCache.current[msg.id] : null;
            const msgReacts = reactions[msg.id] || {};
            const hasReacts = Object.keys(msgReacts).length > 0;
            const { quote, body } = parseQuote(cached || msg.content || '');
            const senderName = isMe ? (profile?.full_name || 'Tú') : (otherUser?.full_name || 'Ellos');

            return (
              <motion.div
                key={msg.id}
                id={`msg-${msg.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative scroll-mt-24 rounded-lg transition-shadow duration-300`}
              >
                <div
                  className={`group flex items-end gap-1.5 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                  onMouseDown={() => startLongPress(msg.id, isMe)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(msg.id, isMe)}
                  onTouchEnd={cancelLongPress}
                  onContextMenu={e => { e.preventDefault(); setMsgMenu({ id: msg.id, isMe }); }}
                >
                  {msg.is_ppv ? (
                    // PPV
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      {isMe || msg.ppv_media_url ? (
                        <>
                          <div className="relative rounded-2xl overflow-hidden shadow-lg">
                            {msg.ppv_media_url?.match(/\.(mp4|webm|mov)$/i)
                              ? <video src={msg.ppv_media_url} controls className="max-w-full max-h-60 object-cover" />
                              : <img src={msg.ppv_media_url} alt="PPV" className="max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLightboxImg(msg.ppv_media_url)} loading="lazy" />
                            }
                            <div className="absolute top-2 left-2 bg-brand-500/90 rounded-lg px-2 py-0.5 text-xs text-white flex items-center gap-1">
                              <FiZap size={9} /> {msg.ppv_price} monedas
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                            {isMe && <DoubleCheck isRead={msg.is_read} />}
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl overflow-hidden bg-dark-700 w-48 h-52 flex flex-col items-center justify-center gap-3 border border-white/10 relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 to-dark-900/80" />
                          <FiLock size={28} className="text-brand-400 relative z-10" />
                          <div className="text-center relative z-10">
                            <p className="text-white font-bold">{msg.ppv_price} monedas</p>
                            <p className="text-gray-400 text-xs mt-0.5">Contenido exclusivo</p>
                          </div>
                          <button
                            onClick={() => handleUnlockPPV(msg)}
                            disabled={unlockingPpv === msg.id}
                            className="btn-primary text-xs px-5 py-2 relative z-10 disabled:opacity-60 disabled:cursor-wait"
                          >
                            {unlockingPpv === msg.id
                              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-1" />
                              : <FiZap size={12} className="inline mr-1" />
                            }
                            {unlockingPpv === msg.id ? 'Procesando…' : 'Desbloquear'}
                          </button>
                          <span className="text-[10px] text-gray-600 relative z-10">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  ) : msg.type === 'gif' ? (
                    // GIF
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="rounded-2xl overflow-hidden shadow-lg max-w-[200px]">
                        <img src={msg.content} alt="GIF" className="w-full object-cover" loading="lazy" />
                      </div>
                      <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <DoubleCheck isRead={msg.is_read} />}
                      </div>
                    </div>
                  ) : msg.type === 'voice' ? (
                    // Voz
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <AudioPlayer url={msg.audio_url} duration={msg.audio_duration_s} isMe={isMe} />
                      <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <DoubleCheck isRead={msg.is_read} />}
                      </div>
                    </div>
                  ) : msg.type === 'video' ? (
                    // Video
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <video src={msg.content} controls playsInline className="rounded-2xl max-w-[240px] max-h-72 object-cover shadow-lg" />
                      <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <DoubleCheck isRead={msg.is_read} />}
                      </div>
                    </div>
                  ) : msg.image_url ? (
                    // Imagen
                    <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <button onClick={() => setLightboxImg(msg.image_url)} className="rounded-2xl overflow-hidden shadow-lg hover:opacity-90 transition-opacity">
                        <img src={msg.image_url} alt="Foto" className="max-w-full max-h-60 object-cover" loading="lazy" />
                      </button>
                      <div className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <DoubleCheck isRead={msg.is_read} />}
                      </div>
                    </div>
                  ) : (
                    // Texto
                    <div
                      className={`max-w-full px-3.5 py-2 rounded-2xl text-sm ${
                        isMe ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-br-sm' : 'bg-dark-700 text-gray-100 rounded-bl-sm'
                      }`}
                    >
                      {/* Cita */}
                      {quote && (
                        <div className={`text-[11px] mb-2 px-2 py-1 rounded-lg border-l-2 opacity-70 ${isMe ? 'bg-white/10 border-white/40 text-white/80' : 'bg-white/5 border-brand-400/60 text-gray-300'}`}>
                          {quote}
                        </div>
                      )}
                      <p>{body}</p>
                      <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-white/50' : 'text-gray-500'}`}>
                        <span className="text-[10px]">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && <DoubleCheck isRead={msg.is_read} light />}
                      </div>
                    </div>
                  )}

                  {/* Botón responder (hover) */}
                  {!msg.is_ppv && (
                    <button
                      onClick={() => setReplyTo({ id: msg.id, content: msg.content || '', senderName })}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-all text-gray-500 hover:text-white shrink-0 mb-1"
                      title="Responder"
                    >
                      <FiCornerUpLeft size={11} />
                    </button>
                  )}
                </div>

                {/* Reacciones */}
                {hasReacts && (
                  <div className={`flex gap-0.5 mt-0.5 flex-wrap ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(msgReacts).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(msg.id, emoji)}
                        className="flex items-center gap-0.5 bg-dark-700 hover:bg-dark-600 border border-white/10 rounded-full px-1.5 py-0.5 text-xs transition-colors"
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
        </AnimatePresence>

        {/* Indicador de escritura */}
        <AnimatePresence>
          {otherTyping && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="flex justify-start">
              <div className="bg-dark-700 px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Barra de responder */}
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

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-white/5 shrink-0">
        <div className="flex gap-2">
          <button type="button" onClick={handleOpenGif}
            disabled={!isPremiumPlus && remaining <= 0}
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-200 ease-out-expo active:scale-90 disabled:opacity-40 ${showGifPanel ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-glow-sm' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-brand-400 hover:bg-white/10 hover:border-white/20'}`}
            title="GIF"
          >
            GIF
          </button>

          <button type="button" onClick={() => imageInputRef.current?.click()}
            disabled={sendingImage || (!isPremiumPlus && remaining <= 0)}
            className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-brand-400 hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-90 disabled:opacity-40"
            title="Enviar foto"
          >
            {sendingImage
              ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              : <FiImage size={16} />
            }
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

          <button type="button" onClick={() => videoInputRef.current?.click()}
            disabled={sendingVideo || (!isPremiumPlus && remaining <= 0)}
            className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-brand-400 hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-90 disabled:opacity-40"
            title="Enviar video"
          >
            {sendingVideo
              ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              : <FiVideo size={16} />
            }
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" capture="user" onChange={handleVideoSelect} className="hidden" />

          {profile?.is_creator && (
            <button type="button" onClick={() => ppvFileRef.current?.click()}
              className="w-10 h-10 shrink-0 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 hover:bg-brand-500/30 hover:border-brand-500/50 transition-all duration-200 ease-out-expo active:scale-90"
              title="Enviar contenido PPV"
            >
              <FiZap size={16} />
            </button>
          )}
          <input ref={ppvFileRef} type="file" accept="image/*,video/*" onChange={handlePPVFileSelect} className="hidden" />

          {recording ? (
            <div className="flex items-center gap-2 flex-1 bg-dark-700 rounded-xl px-3 py-2.5">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
              <span className="text-red-400 text-sm font-mono flex-1">{fmtSecs(recordingSecs)}</span>
              <button type="button" onClick={stopRecording} className="text-xs text-gray-400 hover:text-white px-2">Enviar</button>
              <button type="button" onClick={() => { if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); } clearInterval(recordingTimerRef.current); setRecording(false); }} className="text-xs text-gray-600 hover:text-red-400">✕</button>
            </div>
          ) : (
            <>
              <input
                value={text}
                onChange={handleTextChange}
                placeholder={!isPremiumPlus && remaining <= 0 ? 'Límite alcanzado' : replyTo ? 'Escribe tu respuesta...' : 'Escribe un mensaje...'}
                disabled={!isPremiumPlus && remaining <= 0}
                className="input-field flex-1 py-2.5"
                maxLength={500}
              />
              {!text.trim() ? (
                <button type="button" onClick={startRecording}
                  disabled={sendingVoice || (!isPremiumPlus && remaining <= 0)}
                  className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-brand-400 hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-90 disabled:opacity-40"
                  title="Grabar mensaje de voz"
                >
                  {sendingVoice ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /> : <FiMic size={16} />}
                </button>
              ) : (
                <button type="submit"
                  disabled={!text.trim() || sending || (!isPremiumPlus && remaining <= 0)}
                  className="btn-primary px-4 py-2.5 shadow-glow"
                >
                  {!isPremiumPlus && remaining <= 0 ? <FiLock /> : <FiSend />}
                </button>
              )}
            </>
          )}
        </div>
      </form>

      {/* Panel GIF */}
      <AnimatePresence>
        {showGifPanel && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="absolute inset-x-0 bottom-[72px] z-40 glass-strong p-3 rounded-t-2xl shadow-2xl shadow-black/40"
            style={{ maxHeight: 260 }}
          >
            <div className="relative mb-2">
              <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input-field pl-8 py-2 text-sm w-full"
                placeholder="Buscar GIFs..."
                value={gifQuery}
                onChange={e => { setGifQuery(e.target.value); searchGifs(e.target.value); }}
              />
            </div>
            {loadingGifs ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 overflow-y-auto" style={{ maxHeight: 180 }}>
                {gifs.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => handleSendGif(gif)}
                    className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity bg-dark-700"
                  >
                    <img src={gif.preview || gif.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
                {!gifs.length && <p className="col-span-4 text-center text-gray-600 text-sm py-4">Sin resultados</p>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel PPV */}
      <AnimatePresence>
        {showPPVPanel && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="absolute inset-x-0 bottom-0 z-40 glass-strong p-4 rounded-t-2xl shadow-2xl shadow-black/40"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2"><FiZap className="text-brand-400" size={16} /> Contenido PPV de pago</h3>
              <button onClick={() => { setShowPPVPanel(false); setPpvFile(null); if (ppvPreview) URL.revokeObjectURL(ppvPreview); setPpvPreview(null); }} className="text-gray-500 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"><FiX size={18} /></button>
            </div>
            {ppvPreview && (
              <div className="mb-3 rounded-xl overflow-hidden max-h-40">
                {ppvFile?.type.startsWith('video/') ? <video src={ppvPreview} className="w-full max-h-40 object-cover" /> : <img src={ppvPreview} alt="preview" className="w-full max-h-40 object-cover" />}
              </div>
            )}
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <FiZap size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input type="number" className="input-field pl-8" placeholder="Precio en monedas" value={ppvPrice} onChange={e => setPpvPrice(e.target.value)} min="1" />
              </div>
              <button onClick={handleSendPPV} disabled={sendingPPV || !ppvFile || !ppvPrice} className="btn-primary px-5 disabled:opacity-50">
                {sendingPPV ? '...' : 'Enviar'}
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-2">≈ ${(parseInt(ppvPrice || 0) * 0.05).toFixed(2)} USD</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImg(null)}
          >
            <img src={lightboxImg} alt="Foto" className="max-w-full max-h-full rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
