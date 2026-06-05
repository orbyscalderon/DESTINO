import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAds } from '../hooks/useAds.js';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiMessageCircle, FiFilter } from 'react-icons/fi';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import { useChatStore } from '../store/chatStore.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import { useSwipeNavigation } from '../lib/useSwipeNavigation.js';
import { useTranslation } from 'react-i18next';

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

export default function Messages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, user } = useAuthStore();
  const { clearUnread } = useChatStore();
  const { trackAction } = useAds();

  // Patrón Instagram (DMs): swipe-der vuelve a Inicio (gesto inverso a IG donde
  // tocas la flecha back). No hay swipe-izq.
  useSwipeNavigation({ right: '/home' });

  const openChat = useCallback(async (matchId) => {
    await trackAction();
    navigate(`/chat/${matchId}`);
  }, [trackAction, navigate]);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);

  const loadData = async () => {
    try {
      const { data } = await api.get('/api/matches');
      setMatches(data.matches || []);
      clearUnread();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('messages-list-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        api.get('/api/matches').then(({ data }) => setMatches(data.matches || [])).catch(() => {});
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const totalUnread = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);
  const unreadCount = matches.filter(m => m.unread_count > 0).length;

  let displayMatches = search.trim()
    ? matches.filter(m => m.other.full_name?.toLowerCase().includes(search.toLowerCase()))
    : (filterUnread ? matches.filter(m => m.unread_count > 0) : matches);

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
            <h1 className="text-2xl lg:text-3xl font-black gradient-text">{t('messages_page.title')}</h1>
            {totalUnread > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">{totalUnread} sin leer</p>
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

        {/* Search + filter */}
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
                {!filterUnread && (
                  <span className="bg-brand-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Lista de conversaciones */}
        {matches.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center pt-20"
          >
            <FiMessageCircle className="text-gray-700 mb-4" size={48} />
            <h2 className="text-white font-bold text-lg mb-1">{t('messages_page.no_messages')}</h2>
            <p className="text-gray-500 text-sm mb-6 max-w-xs">
              Haz match con alguien en Descubrir y empieza a chatear
            </p>
            <button
              onClick={() => navigate('/discover')}
              className="btn-primary px-8 py-3 text-sm"
            >
              Ir a Descubrir
            </button>
          </motion.div>
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
    </div>
  );
}

function ExpiryBadge({ expiresAt }) {
  const daysLeft = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
  if (daysLeft <= 0) return <span className="text-[10px] text-red-400 font-semibold">Expiró</span>;
  if (daysLeft <= 2) return (
    <span className="text-[10px] text-orange-400 font-semibold animate-pulse">⏱ {daysLeft}d</span>
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
