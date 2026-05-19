import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import { useChatStore } from '../store/chatStore.js';

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

export default function Matches() {
  const { profile, user } = useAuthStore();
  const { setUnreadTotal, clearUnread } = useChatStore();
  const [matches, setMatches] = useState([]);
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('matches');

  const loadData = async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        api.get('/api/matches'),
        profile?.is_premium ? api.get('/api/matches/likes') : Promise.resolve({ data: { likes: [] } }),
      ]);
      const loaded = mRes.data.matches || [];
      setMatches(loaded);
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

  useEffect(() => {
    loadData();
  }, [profile]);

  // Realtime: actualizar unread count y último mensaje cuando llega un mensaje nuevo
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('matches-list-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => {
        // Re-fetch matches para actualizar último mensaje y unread
        api.get('/api/matches').then(({ data }) => {
          setMatches(data.matches || []);
        }).catch(() => {});
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalUnread = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);

  return (
    <div className="min-h-screen px-4 pt-8 pb-6 lg:px-10 lg:pt-10">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl lg:text-3xl font-black gradient-text">Tus Matches</h1>
          {totalUnread > 0 && (
            <span className="bg-brand-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {totalUnread} nuevo{totalUnread > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl mb-6 max-w-sm lg:max-w-xs">
          <button
            onClick={() => setTab('matches')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'matches' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Matches ({matches.length})
          </button>
          <button
            onClick={() => setTab('likes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'likes' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Likes {profile?.is_premium ? `(${likes.length})` : '🔒'}
          </button>
        </div>

        {tab === 'matches' && (
          <div>
            {matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-3">💔</div>
                <p className="text-gray-400">Aún no tienes matches</p>
                <p className="text-gray-600 text-sm mt-1">Sigue haciendo swipe en el inicio</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {matches.map((match, i) => (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Link
                      to={`/chat/${match.id}`}
                      className={`flex items-center gap-4 p-4 card transition-all hover:border-brand-500/30 group ${
                        match.unread_count > 0 ? 'border-brand-500/20 bg-brand-500/5' : ''
                      }`}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={match.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(match.other.full_name)}&size=100&background=1a1a2e&color=f43f5e`}
                          alt={match.other.full_name}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                        {match.other.is_premium && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[9px]">⚡</div>
                        )}
                        {match.other.is_verified && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[9px] text-white font-bold">✓</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`font-semibold truncate transition-colors ${
                            match.unread_count > 0 ? 'text-white' : 'text-white group-hover:text-brand-400'
                          }`}>
                            {match.other.full_name}
                          </p>
                          <span className="text-gray-500 text-xs shrink-0">
                            {formatTime(match.last_message?.created_at || match.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className={`text-sm truncate ${
                            match.unread_count > 0 ? 'text-gray-200 font-medium' : 'text-gray-500'
                          }`}>
                            {match.last_message
                              ? (match.last_message.sender_id === user?.id ? 'Tú: ' : '') + match.last_message.content
                              : 'Toca para chatear'}
                          </p>
                          {match.unread_count > 0 && (
                            <span className="shrink-0 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                              {match.unread_count > 9 ? '9+' : match.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'likes' && (
          <div>
            {!profile?.is_premium ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-3">👀</div>
                <h3 className="font-bold text-white mb-2">
                  {likes.length > 0 ? `${likes.length} personas` : 'Alguien'} te dio like
                </h3>
                <p className="text-gray-400 text-sm mb-6">Hazte Premium para verlos</p>
                <Link to="/premium" className="btn-primary px-6">Ver quién me dio like</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {likes.map((like, i) => (
                  <motion.div
                    key={like.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="card p-4 text-center hover:border-brand-500/30 transition-all"
                  >
                    <div className="relative inline-block mb-3">
                      <img
                        src={like.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(like.full_name)}&size=100&background=1a1a2e&color=f43f5e`}
                        alt={like.full_name}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                      {like.is_verified && (
                        <div className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-dark-800">✓</div>
                      )}
                      {like.is_super_like && (
                        <div className="absolute top-0 left-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-dark-800">⭐</div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate">{like.full_name}</p>
                    {like.is_super_like
                      ? <span className="text-[10px] text-blue-400 font-bold">⭐ Super Like</span>
                      : <FiHeart className="text-brand-500 mx-auto mt-1" size={14} />
                    }
                    <button
                      onClick={() => handleLikeBack(like.id)}
                      className="mt-2 w-full py-1.5 rounded-lg bg-brand-500/20 text-brand-400 text-xs font-medium hover:bg-brand-500/30 transition-colors"
                    >
                      Like back ❤️
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
