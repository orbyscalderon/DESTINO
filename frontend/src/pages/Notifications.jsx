import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiArrowLeft, FiCheck, FiZap, FiHeart, FiMessageCircle, FiVideo, FiDollarSign, FiUsers, FiLock, FiShield, FiRadio, FiUserPlus, FiX } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const TYPE_CONFIG = {
  tip:                 { icon: FiZap,           color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  match:               { icon: FiHeart,          color: 'text-brand-400',  bg: 'bg-brand-500/10' },
  friend_request:      { icon: FiUserPlus,       color: 'text-blue-400',   bg: 'bg-blue-500/10'  },
  message:             { icon: FiMessageCircle,  color: 'text-blue-400',   bg: 'bg-blue-500/10'  },
  ppv_unlock:          { icon: FiLock,           color: 'text-purple-400', bg: 'bg-purple-500/10'},
  subscription:        { icon: FiUsers,          color: 'text-green-400',  bg: 'bg-green-500/10' },
  subscription_renewal:{ icon: FiUsers,          color: 'text-teal-400',   bg: 'bg-teal-500/10'  },
  show_ticket:         { icon: FiVideo,          color: 'text-orange-400', bg: 'bg-orange-500/10'},
  photo_sale:          { icon: FiDollarSign,     color: 'text-pink-400',   bg: 'bg-pink-500/10'  },
  like:                { icon: FiHeart,          color: 'text-red-400',    bg: 'bg-red-500/10'   },
  moderation:          { icon: FiShield,         color: 'text-indigo-400', bg: 'bg-indigo-500/10'},
  broadcast:           { icon: FiRadio,          color: 'text-cyan-400',   bg: 'bg-cyan-500/10'  },
  boost:               { icon: FiZap,            color: 'text-amber-400',  bg: 'bg-amber-500/10' },
};

const DEFAULT_CONFIG = { icon: FiBell, color: 'text-gray-400', bg: 'bg-dark-700' };

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'ahora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [friendProcessing, setFriendProcessing] = useState({}); // { notifId: 'accepting'|'rejecting' }
  const [friendHandled, setFriendHandled] = useState(new Set());

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { data } = await api.get('/api/notifications/in-app?limit=50');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      toast.error('Error al cargar notificaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarking(true);
    try {
      await api.put('/api/notifications/in-app/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast.error('Error al marcar como leídas');
    } finally {
      setMarking(false);
    }
  };

  const handleMarkOne = async (notif) => {
    if (notif.is_read) return;
    try {
      await api.put(`/api/notifications/in-app/${notif.id}/read`);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const handleAcceptFriend = async (notif) => {
    const fromUserId = notif.data?.from_user_id;
    if (!fromUserId) return;
    setFriendProcessing(prev => ({ ...prev, [notif.id]: 'accepting' }));
    try {
      await api.post('/api/video/add-friend', { targetUserId: fromUserId });
      setFriendHandled(prev => new Set([...prev, notif.id]));
      if (!notif.is_read) {
        await api.put(`/api/notifications/in-app/${notif.id}/read`).catch(() => {});
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast.success('¡Amigo agregado! Ya pueden chatear 💬');
    } catch {
      toast.error('No se pudo aceptar la solicitud');
    } finally {
      setFriendProcessing(prev => { const s = { ...prev }; delete s[notif.id]; return s; });
    }
  };

  const handleRejectFriend = async (notif) => {
    setFriendProcessing(prev => ({ ...prev, [notif.id]: 'rejecting' }));
    try {
      setFriendHandled(prev => new Set([...prev, notif.id]));
      if (!notif.is_read) {
        await api.put(`/api/notifications/in-app/${notif.id}/read`).catch(() => {});
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast('Solicitud ignorada', { icon: '👋' });
    } finally {
      setFriendProcessing(prev => { const s = { ...prev }; delete s[notif.id]; return s; });
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black gradient-text">{t('notifications.title')}</h1>
          {unreadCount > 0 && (
            <span className="bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={marking}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 disabled:opacity-50"
          >
            <FiCheck size={12} />
            {marking ? t('notifications.marking') : t('notifications.mark_all_read')}
          </button>
        )}
      </div>

      {/* Lista */}
      {notifications.length === 0 ? (
        <div className="text-center py-20">
          <FiBell size={48} className="mx-auto text-gray-700 mb-4" />
          <p className="text-gray-500">{t('notifications.empty')}</p>
          <p className="text-gray-600 text-sm mt-1">Aquí verás tus propinas, matches y más</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-2">
            {notifications.map(notif => {
              const cfg = TYPE_CONFIG[notif.type] || DEFAULT_CONFIG;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleMarkOne(notif)}
                  className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-colors ${
                    notif.is_read
                      ? 'bg-dark-800 hover:bg-dark-700/60'
                      : 'bg-dark-700 border border-brand-500/20 hover:bg-dark-600'
                  }`}
                >
                  {/* Icono */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon size={18} className={cfg.color} />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${notif.is_read ? 'text-gray-300' : 'text-white'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.body}</p>
                    )}
                    {notif.type === 'friend_request' && notif.data?.from_user_id && (
                      <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                        {friendHandled.has(notif.id) ? (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <FiCheck size={12} className="text-green-400" /> Respondida
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAcceptFriend(notif)}
                              disabled={!!friendProcessing[notif.id]}
                              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                            >
                              {friendProcessing[notif.id] === 'accepting'
                                ? <div className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
                                : <FiCheck size={12} />}
                              Aceptar
                            </button>
                            <button
                              onClick={() => handleRejectFriend(notif)}
                              disabled={!!friendProcessing[notif.id]}
                              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-dark-600 border border-dark-500 text-gray-400 hover:text-gray-300 disabled:opacity-50 transition-colors"
                            >
                              {friendProcessing[notif.id] === 'rejecting'
                                ? <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                                : <FiX size={12} />}
                              Ignorar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tiempo + dot no leído */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[10px] text-gray-600">{timeAgo(notif.created_at)}</span>
                    {!notif.is_read && (
                      <span className="w-2 h-2 bg-brand-500 rounded-full" />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
