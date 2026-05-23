import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAds } from '../hooks/useAds.js';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart, FiSearch, FiX, FiMessageCircle, FiFilter } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import { useChatStore } from '../store/chatStore.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return d.toLocaleDateString('es', { weekday: 'short' });
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
}

function isNew(dateStr) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr)) < 86400000;
}

function messagePreview(msg, myId) {
  if (!msg) return null;
  const prefix = msg.sender_id === myId ? 'Tú: ' : '';
  const content = msg.content || '';
  if (msg.type === 'gif' || content.match(/tenor\.com|giphy\.com/i)) return `${prefix}GIF`;
  if (msg.message_type === 'image' || content.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return `${prefix}📷 Foto`;
  if (msg.message_type === 'video') return `${prefix}🎥 Video`;
  if (msg.message_type === 'audio') return `${prefix}🎤 Audio`;
  if (msg.message_type === 'gift') return `${prefix}🎁 Regalo`;
  return prefix + content;
}


export default function Matches() {
  const navigate = useNavigate();
  const { profile, user } = useAuthStore();
  const { clearUnread } = useChatStore();
  const { trackAction } = useAds();

  const openChat = useCallback(async (matchId) => {
    await trackAction(); // intersticial cada 5 chats abiertos para usuarios gratuitos
    navigate(`/chat/${matchId}`);
  }, [trackAction, navigate]);
  const [matches, setMatches] = useState([]);
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('matches');
  const [search, setSearch] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);

  const loadData = async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        api.get('/api/matches'),
        profile?.is_premium ? api.get('/api/matches/likes') : Promise.resolve({ data: { likes: [] } }),
      ]);
      setMatches(mRes.data.matches || []);
      setLikes(lRes.data.likes || []);
      clearUnread();
    } finally {
      setLoading(false);
    }
  };

  const handleLikeBack = async (targetId) => {
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: targetId });
      if (data.isMatch) {
        toast.success('¡Es un match! 💕');
        setLikes(prev => prev.filter(l => l.id !== targetId));
        loadData();
      } else {
        toast.success('Like enviado');
        setLikes(prev => prev.filter(l => l.id !== targetId));
      }
    } catch {
      toast.error('Error al dar like');
    }
  };

  useEffect(() => { loadData(); }, [profile]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('matches-list-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        api.get('/api/matches').then(({ data }) => setMatches(data.matches || [])).catch(() => {});
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const newMatches = matches.filter(m => !m.last_message);
  const chatMatches = matches.filter(m => m.last_message);

  let displayMatches = search.trim()
    ? matches.filter(m => m.other.full_name?.toLowerCase().includes(search.toLowerCase()))
    : (filterUnread ? matches.filter(m => m.unread_count > 0) : chatMatches);

  const totalUnread = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);
  const unreadCount = matches.filter(m => m.unread_count > 0).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 lg:px-10 lg:pt-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black gradient-text">Mensajes</h1>
            {totalUnread > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">{totalUnread} mensaje{totalUnread > 1 ? 's' : ''} sin leer</p>
            )}
          </div>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-brand-500 text-white text-xs font-bold px-2.5 py-1 rounded-full"
            >
              {totalUnread}
            </motion.span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl mb-5 max-w-xs">
          <button
            onClick={() => setTab('matches')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'matches' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Matches {matches.length > 0 && <span className="ml-1 opacity-80">({matches.length})</span>}
          </button>
          <button
            onClick={() => setTab('likes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'likes' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Likes {profile?.is_premium ? (likes.length > 0 ? `(${likes.length})` : '') : '🔒'}
          </button>
        </div>

        {/* ── MATCHES TAB ── */}
        {tab === 'matches' && (
          <div>
            {/* New matches strip */}
            <AnimatePresence>
              {newMatches.length > 0 && !search && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">Nuevos matches</span>
                    <span className="bg-brand-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{newMatches.length}</span>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                    {newMatches.map((m, i) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06 }}
                      >
                        <button onClick={() => openChat(m.id)} className="flex flex-col items-center gap-1.5 w-16 shrink-0 group">
                          <div className="relative w-16 h-16">
                            {/* Gradient ring */}
                            <div className="absolute inset-0 rounded-full p-[2px]"
                              style={{ background: 'linear-gradient(135deg, #f43f5e, #fb923c, #f43f5e)' }}>
                              <div className="w-full h-full rounded-full overflow-hidden bg-dark-900">
                                <img
                                  src={m.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.other.full_name || '?')}&size=120&background=1a1a2e&color=f43f5e`}
                                  alt={m.other.full_name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                            {m.other.is_online && (
                              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-dark-900" />
                            )}
                            {isNew(m.created_at) && (
                              <span className="absolute -top-1 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">NUEVO</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 font-medium text-center truncate w-full group-hover:text-white transition-colors">
                            {m.other.full_name?.split(' ')[0]}
                          </p>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                  <div className="border-b border-white/5 mt-3" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search + filter row */}
            {matches.length > 0 && (
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <FiSearch size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setFilterUnread(false); }}
                    placeholder="Buscar…"
                    className="input-field pl-9 pr-9 py-2.5 text-sm w-full"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <FiX size={14} />
                    </button>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => { setFilterUnread(v => !v); setSearch(''); }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      filterUnread
                        ? 'bg-brand-500 text-white'
                        : 'bg-dark-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <FiFilter size={12} />
                    No leídos
                    {!filterUnread && <span className="bg-brand-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadCount}</span>}
                  </button>
                )}
              </div>
            )}

            {/* Chat list */}
            {matches.length === 0 ? (
              <EmptyMatches />
            ) : displayMatches.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                {search ? (
                  <>
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-gray-400">Sin resultados para "{search}"</p>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-gray-400">Sin mensajes sin leer</p>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="flex flex-col">
                {displayMatches.map((match, i) => (
                  <MatchRow key={match.id} match={match} i={i} myId={user?.id} onOpen={openChat} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LIKES TAB ── */}
        {tab === 'likes' && (
          <div>
            {!profile?.is_premium ? (
              <LikesPremiumGate count={likes.length} />
            ) : likes.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
                <div className="text-5xl mb-3">💛</div>
                <p className="text-gray-400">Nadie te ha dado like aún</p>
                <p className="text-gray-600 text-sm mt-1">¡Sigue siendo tú mismo!</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {likes.map((like, i) => (
                  <LikeCard key={like.id} like={like} i={i} onLikeBack={handleLikeBack} />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function ExpiryBadge({ expiresAt }) {
  const daysLeft = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
  if (daysLeft <= 0) return <span className="text-[10px] text-red-400 font-semibold">Expiró</span>;
  if (daysLeft <= 2) return (
    <span className="text-[10px] text-orange-400 font-semibold animate-pulse">
      ⏱ {daysLeft}d
    </span>
  );
  return <span className="text-[10px] text-gray-600">⏱ {daysLeft}d</span>;
}

function MatchRow({ match, i, myId, onOpen }) {
  const preview = messagePreview(match.last_message, myId);
  const online = match.other?.is_online;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.03 }}
    >
      <button
        onClick={() => onOpen(match.id)}
        className={`w-full flex items-center gap-3.5 px-2 py-3 rounded-2xl transition-all hover:bg-white/5 active:scale-[0.99] group ${
          match.unread_count > 0 ? 'bg-brand-500/6' : ''
        }`}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className={`w-14 h-14 rounded-full overflow-hidden ring-2 transition-all ${
            match.unread_count > 0 ? 'ring-brand-500/40' : 'ring-transparent group-hover:ring-white/10'
          }`}>
            <img
              src={match.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(match.other.full_name || '?')}&size=120&background=1a1a2e&color=f43f5e`}
              alt={match.other.full_name}
              className="w-full h-full object-cover"
            />
          </div>
          {online && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-900" />
          )}
          {match.other.is_premium && !online && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[9px] border-2 border-dark-900">⚡</div>
          )}
          {match.other.is_verified && <VerifiedBadge size={17} overlay />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className={`font-semibold truncate ${
                match.unread_count > 0 ? 'text-white' : 'text-gray-200 group-hover:text-white'
              }`}>
                {match.other.full_name}
              </p>
              {online && (
                <span className="shrink-0 text-[9px] text-green-400 font-bold uppercase tracking-wide">• en línea</span>
              )}
            </div>
            <span className={`text-[11px] shrink-0 ${match.unread_count > 0 ? 'text-brand-400 font-semibold' : 'text-gray-600'}`}>
              {formatTime(match.last_message?.created_at || match.created_at)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm truncate ${
              match.unread_count > 0 ? 'text-gray-300 font-medium' : 'text-gray-500'
            }`}>
              {preview || <span className="italic text-gray-600 text-xs">Di hola 👋</span>}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {match.expires_at && !match.last_message && (
                <ExpiryBadge expiresAt={match.expires_at} />
              )}
              {match.unread_count > 0 ? (
                <span className="min-w-[20px] h-5 bg-brand-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1">
                  {match.unread_count > 9 ? '9+' : match.unread_count}
                </span>
              ) : (
                <FiMessageCircle size={14} className="text-gray-700 group-hover:text-gray-500 transition-colors" />
              )}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

function EmptyMatches() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center pt-16 pb-8 px-4"
    >
      {/* Animated hearts illustration */}
      <div className="relative w-28 h-28 mb-6">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-brand-500 rounded-full blur-2xl"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl"
          >💔</motion.span>
        </div>
      </div>

      <h2 className="text-white font-bold text-lg mb-1">Aún no tienes matches</h2>
      <p className="text-gray-500 text-sm mb-8 max-w-xs">
        Cuando alguien te dé like y tú le des like de vuelta, aparecerán aquí
      </p>

      {/* Tip cards */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-xs mb-8">
        {[
          { icon: '📸', text: 'Sube más fotos' },
          { icon: '✍️', text: 'Completa tu bio' },
          { icon: '⚡', text: 'Activa un boost' },
        ].map(({ icon, text }) => (
          <div key={text} className="bg-dark-800 rounded-xl p-3 flex flex-col items-center gap-1.5">
            <span className="text-xl">{icon}</span>
            <p className="text-[10px] text-gray-500 font-medium text-center leading-tight">{text}</p>
          </div>
        ))}
      </div>

      <Link to="/" className="btn-primary px-8 py-3 text-sm">
        Explorar personas
      </Link>
    </motion.div>
  );
}

function LikesPremiumGate({ count }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12 px-4"
    >
      {/* Blurred avatars */}
      <div className="flex justify-center gap-2 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-16 h-16 rounded-full bg-dark-700 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-2xl opacity-30">👤</div>
            <div className="absolute inset-0 backdrop-blur-sm" />
          </div>
        ))}
      </div>

      <div className="text-4xl mb-3">👀</div>
      <h3 className="font-bold text-white text-lg mb-2">
        {count > 0 ? `${count} persona${count > 1 ? 's' : ''}` : 'Alguien'} te gustó
      </h3>
      <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
        Hazte Premium para ver quién te dio like antes de hacer swipe
      </p>
      <Link to="/premium" className="btn-primary px-8 py-3 text-sm">
        Ver quién me gustó ✨
      </Link>
    </motion.div>
  );
}

function LikeCard({ like, i, onLikeBack }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: i * 0.04 }}
      className="card p-4 text-center hover:border-brand-500/30 transition-all group"
    >
      <div className="relative inline-block mb-3">
        <div className="w-20 h-20 rounded-full overflow-hidden mx-auto ring-2 ring-transparent group-hover:ring-brand-500/30 transition-all">
          <img
            src={like.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(like.full_name || '?')}&size=120&background=1a1a2e&color=f43f5e`}
            alt={like.full_name}
            className="w-full h-full object-cover"
          />
        </div>
        {like.is_verified && <VerifiedBadge size={20} overlay />}
        {like.is_super_like && (
          <div className="absolute top-0 left-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-dark-800">⭐</div>
        )}
        {like.is_online && (
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-dark-800" />
        )}
      </div>

      <p className="text-sm font-semibold text-white truncate mb-0.5">{like.full_name}</p>
      {like.age && <p className="text-[11px] text-gray-500 mb-1">{like.age} años</p>}

      {like.is_super_like
        ? <span className="text-[10px] text-blue-400 font-bold">⭐ Super Like</span>
        : <FiHeart className="text-brand-500 mx-auto mt-0.5" size={13} />
      }

      <button
        onClick={() => onLikeBack(like.id)}
        className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-brand-600/30 to-brand-500/20 text-brand-400 text-xs font-semibold hover:from-brand-600/50 hover:to-brand-500/40 active:scale-95 transition-all border border-brand-500/20"
      >
        Like back ❤️
      </button>
    </motion.div>
  );
}
