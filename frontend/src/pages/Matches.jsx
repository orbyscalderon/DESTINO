import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart, FiMessageCircle, FiSend, FiClock } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { EmptyHeart } from '../components/ui/illustrations/index.js';
import LazyImage from '../components/ui/LazyImage.jsx';

function isNew(dateStr) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr)) < 172800000; // 48 h
}

function useMatchCountdown(expiresAt) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const ms = new Date(expiresAt) - Date.now();
      if (ms <= 0) { setLabel('Expirado'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      if (h >= 24) setLabel(`${Math.floor(h / 24)}d`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else setLabel(`${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return label;
}

export default function Matches() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  const [newMatches, setNewMatches] = useState([]);
  const [likes, setLikes] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('matches');

  const loadData = async () => {
    try {
      const [mRes, lRes, sRes] = await Promise.all([
        api.get('/api/matches'),
        profile?.is_premium
          ? api.get('/api/matches/likes')
          : Promise.resolve({ data: { likes: [] } }),
        api.get('/api/matches/sent'),
      ]);
      const all = mRes.data.matches || [];
      // "Nuevos" = sin mensaje Y creados en últimas 48 h; el resto sigue visible pero sin badge
      setNewMatches(all.filter(m => !m.last_message && isNew(m.created_at)));
      setLikes(lRes.data.likes || []);
      setSent(sRes.data.sent || []);
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

  useEffect(() => { loadData(); }, [profile?.is_premium]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 lg:px-10 lg:pt-10 relative">
      <div className="absolute top-12 right-1/4 w-64 h-64 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl lg:text-3xl font-black gradient-text">{t('matches.title')}</h1>
          {newMatches.length > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-brand-500 text-white text-xs font-bold px-2.5 py-1 rounded-full"
            >
              {newMatches.length} nuevo{newMatches.length > 1 ? 's' : ''}
            </motion.span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl mb-5">
          <button
            onClick={() => setTab('matches')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'matches' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Nuevos {newMatches.length > 0 && <span className="opacity-80">({newMatches.length})</span>}
          </button>
          <button
            onClick={() => setTab('likes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'likes' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Likes {profile?.is_premium ? (likes.length > 0 ? `(${likes.length})` : '') : '🔒'}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'sent' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Enviados {sent.length > 0 && <span className="opacity-80">({sent.length})</span>}
          </button>
        </div>

        {/* ── NUEVOS MATCHES ── */}
        {tab === 'matches' && (
          <div>
            {newMatches.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center pt-16 pb-8 px-4"
              >
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
                <h2 className="text-white font-bold text-lg mb-1">Sin nuevos matches</h2>
                <p className="text-gray-500 text-sm mb-8 max-w-xs">
                  Cuando alguien te dé like y tú también, aparecerá aquí
                </p>
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
                <Link to="/discover" className="btn-primary px-8 py-3 text-sm">
                  Ir a Descubrir
                </Link>
              </motion.div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {newMatches.map((m, i) => (
                  <MatchCard key={m.id} m={m} i={i} onNavigate={() => navigate(`/chat/${m.id}`)} />
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
              <EmptyState
                illustration={<EmptyHeart size={120} />}
                title="Nadie te ha dado like aún"
                desc="Mejorá tu perfil y empezá a deslizar — la actividad atrae actividad."
                action={
                  <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <Link to="/profile" className="btn-secondary px-5 py-2.5 text-sm">
                      Mejorar mi perfil
                    </Link>
                    <Link to="/discover" className="btn-primary px-5 py-2.5 text-sm">
                      ❤️ Empezar a deslizar
                    </Link>
                  </div>
                }
              />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {likes.map((like, i) => (
                  <LikeCard key={like.id} like={like} i={i} onLikeBack={handleLikeBack} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ENVIADOS TAB ── */}
        {tab === 'sent' && (
          <div>
            {sent.length === 0 ? (
              <EmptyState
                emoji="💌"
                title="Aún no has enviado ningún like"
                desc="¡Ve a Descubrir y empieza a explorar!"
                action={
                  <Link to="/discover" className="btn-primary px-8 py-3 text-sm inline-block">
                    Ir a Descubrir
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {sent.map((item, i) => (
                  <SentLikeCard key={item.match_id} item={item} i={i} />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function MatchCard({ m, i, onNavigate }) {
  const countdown = useMatchCountdown(m.expires_at);
  const isExpiringSoon = m.expires_at && (new Date(m.expires_at) - Date.now()) < 24 * 60 * 60 * 1000;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: i * 0.05 }}
      onClick={onNavigate}
      className="relative rounded-2xl overflow-hidden aspect-square group"
    >
      <LazyImage
        src={m.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.other.full_name || '?')}&size=300&background=1a1a2e&color=f43f5e`}
        alt={m.other.full_name}
        className="w-full h-full group-hover:scale-105 transition-transform duration-300"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {m.other.is_online && (
        <span className="absolute top-2 right-2">
          <span className="presence-dot lg !relative w-3 h-3" />
        </span>
      )}

      {isNew(m.created_at) && (
        <span className="absolute top-2 left-2 pill-brand">NUEVO</span>
      )}

      {countdown && (
        <span className={`absolute bottom-8 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${isExpiringSoon ? 'bg-red-500/90 text-white' : 'bg-black/60 text-gray-300'}`}>
          <FiClock size={8} /> {countdown}
        </span>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-bold truncate">{m.other.full_name?.split(' ')[0]}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <FiMessageCircle size={10} className="text-brand-400" />
          <p className="text-brand-400 text-[10px]">Di hola 👋</p>
        </div>
      </div>
      <div className="absolute inset-0 rounded-2xl ring-2 ring-brand-500/0 group-hover:ring-brand-500/60 transition-all" />
    </motion.button>
  );
}

function LikesPremiumGate({ count }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-12 px-4"
    >
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

function SentLikeCard({ item, i }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: i * 0.04 }}
      className="card p-4 text-center hover:border-brand-500/30 transition-all group cursor-pointer"
      onClick={() => navigate(`/profile/${item.id}`)}
    >
      <div className="relative inline-block mb-3">
        <div className="w-20 h-20 rounded-full overflow-hidden mx-auto ring-2 ring-transparent group-hover:ring-brand-500/30 transition-all">
          <LazyImage
            src={item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.full_name || '?')}&size=120&background=1a1a2e&color=f43f5e`}
            alt={item.full_name}
            className="w-full h-full"
          />
        </div>
        {item.is_verified && <VerifiedBadge size={20} overlay />}
        {item.is_super_like && (
          <div className="absolute top-0 right-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-dark-800 text-xs">⭐</div>
        )}
      </div>

      <p className="text-sm font-semibold text-white truncate mb-0.5">{item.full_name}</p>
      {item.age && <p className="text-[11px] text-gray-500 mb-1">{item.age} años</p>}

      {item.is_super_like ? (
        <span className="text-[10px] text-blue-400 font-bold">⭐ Super Like enviado</span>
      ) : (
        <span className="text-[10px] text-brand-400 font-semibold flex items-center justify-center gap-1">
          <FiHeart size={10} /> Like enviado
        </span>
      )}

      <p className="text-[9px] text-gray-600 mt-1">
        {new Date(item.sent_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
      </p>
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
          <LazyImage
            src={like.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(like.full_name || '?')}&size=120&background=1a1a2e&color=f43f5e`}
            alt={like.full_name}
            className="w-full h-full"
          />
        </div>
        {like.is_verified && <VerifiedBadge size={20} overlay />}
        {like.is_super_like && (
          <div className="absolute top-0 left-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-dark-800">⭐</div>
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
