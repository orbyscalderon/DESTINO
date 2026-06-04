import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiHome, FiHeart, FiVideo, FiUser, FiZap, FiSearch, FiFilm,
  FiBell, FiShield, FiSettings, FiBarChart2, FiCompass,
  FiMessageCircle, FiTrendingUp, FiImage, FiGrid, FiX, FiPlus,
} from 'react-icons/fi';
import { useAuthStore } from '../../store/authStore.js';
import { useChatStore } from '../../store/chatStore.js';
import { supabase } from '../../lib/supabase.js';
import api from '../../lib/api.js';
import CreateMenuSheet from '../ui/CreateMenuSheet.jsx';

// Items fijos del nav móvil — patrón Instagram + Crear central de Destino.
// El 'create' abre el sheet de Reel/Post/Story/Show.
// Swipe horizontal: Inicio swipe-izq → Cámara (Stories) · swipe-der → Mensajes.
const MOBILE_MAIN = [
  { to: '/home',     icon: FiHome,          label: 'Inicio'   },
  { to: '/reels',    icon: FiFilm,          label: 'Reels'    },
  { kind: 'create',  icon: FiPlus,          label: 'Crear'    },
  { to: '/matches',  icon: FiHeart,         label: 'Matches'  },
  { to: '/messages', icon: FiMessageCircle, label: 'Mensajes', badge: 'chat' },
];

// Desktop sidebar
const sidebarNavItems = [
  { to: '/home',        icon: FiHome,          label: 'Inicio'       },
  { to: '/reels',       icon: FiFilm,          label: 'Reels'        },
  { to: '/discover',    icon: FiCompass,       label: 'Descubrir'    },
  { to: '/matches',     icon: FiHeart,         label: 'Matches'      },
  { to: '/messages',    icon: FiMessageCircle, label: 'Mensajes'     },
  { to: '/search',      icon: FiSearch,        label: 'Buscar'       },
  { to: '/shows',       icon: FiFilm,          label: 'Shows en vivo'},
  { to: '/leaderboard', icon: FiTrendingUp,    label: 'Leaderboard'  },
  { to: '/explore',     icon: FiFilm,          label: 'Videos 18+'   },
  { to: '/adult',       icon: FiShield,        label: 'Creadoras 18+'},
  { to: '/video',       icon: FiVideo,         label: 'Videollamadas'},
  { to: '/profile',     icon: FiUser,          label: 'Perfil'       },
];

export default function Navbar() {
  const { profile, user } = useAuthStore();
  const { unreadTotal, incrementUnread } = useChatStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [coinsBalance, setCoinsBalance] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    api.get('/api/notifications/in-app?limit=1')
      .then(({ data }) => setUnreadNotifs(data.unread_count || 0))
      .catch(() => {});
    if (profile?.is_creator || profile?.coins_balance !== undefined) {
      api.get('/api/coins/balance')
        .then(({ data }) => setCoinsBalance(data.coins ?? null))
        .catch(() => {});
    }
  }, [user?.id, profile?.is_creator]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('navbar-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (
          payload.new.sender_id !== user.id &&
          !location.pathname.startsWith('/matches') &&
          !location.pathname.startsWith('/chat')
        ) incrementUnread();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'in_app_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => setUnreadNotifs(prev => prev + 1))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  useEffect(() => {
    if (location.pathname === '/notifications') setUnreadNotifs(0);
    setShowMore(false);
  }, [location.pathname]);

  const sidebarLink = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
      isActive ? 'bg-brand-500/15 text-brand-400' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
    }`;

  const mobileLink = ({ isActive }) =>
    `flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
      isActive ? 'text-brand-500' : 'text-gray-500 hover:text-gray-300'
    }`;

  // Menú "Más" agrupado por categorías para que no sea una lista plana de 13+ items
  const moreSections = [
    {
      title: 'Yo',
      items: [
        { to: '/profile',       icon: FiUser, label: 'Mi Perfil' },
        { to: '/notifications', icon: FiBell, label: 'Notificaciones', badge: unreadNotifs },
        { to: '/coins',         icon: FiZap,  label: 'Coins', sub: coinsBalance !== null ? `${coinsBalance.toLocaleString()} disponibles` : null },
        { to: '/settings',      icon: FiSettings, label: 'Configuración' },
      ],
    },
    {
      title: 'Explorar',
      items: [
        { to: '/search',       icon: FiSearch,     label: 'Buscar' },
        { to: '/shows',        icon: FiFilm,       label: 'Shows en vivo' },
        { to: '/video',        icon: FiVideo,      label: 'Videollamadas' },
        { to: '/leaderboard',  icon: FiTrendingUp, label: 'Leaderboard' },
      ],
    },
    {
      title: 'Adulto 18+',
      // Solo visible para usuarios mayores (premium VIP o adult creators o verificados).
      // El backend filtra contenido real; aquí ocultamos los items para no tentar.
      hidden: !(profile?.is_adult_creator || profile?.age_verified_at),
      items: [
        { to: '/explore', icon: FiFilm,   label: 'Videos 18+' },
        { to: '/adult',   icon: FiShield, label: 'Creadoras 18+' },
      ],
    },
    {
      title: 'Creador',
      items: [
        ...(profile?.is_creator
          ? [{ to: '/creator/dashboard', icon: FiBarChart2, label: 'Mi Dashboard' }]
          : [{ to: '/become-creator', icon: FiVideo, label: 'Ser Creador' }]),
        ...(!profile?.is_premium
          ? [{ to: '/premium', icon: FiZap, label: '✨ Hazte Premium' }]
          : []),
      ],
    },
    {
      title: 'Admin',
      hidden: !profile?.is_admin,
      items: [
        { to: '/admin', icon: FiShield, label: '🛡 Admin Panel' },
      ],
    },
  ].filter(s => !s.hidden && s.items.length > 0);

  const isMoreActive = moreSections.some(s => s.items.some(i => location.pathname.startsWith(i.to)));

  return (
    <>
      {/* ── DESKTOP SIDEBAR ──────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-dark-800 border-r border-white/[0.06] z-40 min-h-0">
        <div className="px-6 py-6 border-b border-white/[0.06] shrink-0">
          <h1 className="text-2xl font-black gradient-text">Destino TV 💕</h1>
          <p className="text-gray-600 text-xs mt-0.5">Encuentra tu conexión</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {sidebarNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={sidebarLink}>
              <span className="relative">
                <Icon size={20} />
                {to === '/messages' && unreadTotal > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          ))}

          <NavLink to="/notifications" className={sidebarLink}>
            <span className="relative">
              <FiBell size={20} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </span>
            Notificaciones
          </NavLink>

          <NavLink to="/coins" className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-yellow-500/10 mt-1 ${
              isActive ? 'bg-yellow-500/10 text-yellow-400' : 'text-yellow-600/80 hover:text-yellow-400 hover:bg-yellow-500/5'
            }`
          }>
            <FiZap size={20} />
            <span className="flex-1">Coins</span>
            {coinsBalance !== null && (
              <span className="text-xs font-bold text-yellow-400">{coinsBalance.toLocaleString()}</span>
            )}
          </NavLink>

          {profile?.is_admin && (
            <NavLink to="/admin" className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-red-500/20 mt-1 ${
                isActive ? 'bg-red-500/15 text-red-400' : 'text-red-500/70 hover:text-red-400 hover:bg-red-500/10'
              }`
            }>
              <FiShield size={20} />Admin Panel
            </NavLink>
          )}

          {profile?.is_creator && (
            <NavLink to="/creator/dashboard" className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-purple-500/20 mt-1 ${
                isActive ? 'bg-purple-500/15 text-purple-400' : 'text-purple-500/70 hover:text-purple-400 hover:bg-purple-500/10'
              }`
            }>
              <FiBarChart2 size={20} />Mi Dashboard
            </NavLink>
          )}

          <NavLink to="/settings" className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
              isActive ? 'bg-brand-500/15 text-brand-400' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
            }`
          }>
            <FiSettings size={20} />Configuración
          </NavLink>

          {!profile?.is_creator && (
            <NavLink to="/become-creator" className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-purple-500/20 mt-1 ${
                isActive ? 'bg-purple-500/15 text-purple-400' : 'text-purple-500/70 hover:text-purple-400 hover:bg-purple-500/10'
              }`
            }>
              <FiVideo size={20} />Ser Creador
            </NavLink>
          )}

          {!profile?.is_premium && (
            <NavLink to="/premium" className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-yellow-500/20 mt-1 ${
                isActive ? 'bg-yellow-500/15 text-yellow-400' : 'text-yellow-500/70 hover:text-yellow-400 hover:bg-yellow-500/10'
              }`
            }>
              <FiZap size={20} />Hazte Premium
            </NavLink>
          )}
        </nav>

        {profile && (
          <div className="p-4 border-t border-white/[0.06] shrink-0">
            <NavLink to="/profile" className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
              <img
                src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                alt="" className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate group-hover:text-brand-400 transition-colors">{profile.full_name}</p>
                <p className="text-xs text-gray-500 truncate">@{profile.username}</p>
              </div>
              {profile.premium_tier === 'vip'     && <span className="text-yellow-400 text-sm shrink-0">👑</span>}
              {profile.premium_tier === 'premium' && <span className="text-brand-400 text-sm shrink-0">⚡</span>}
            </NavLink>
          </div>
        )}
      </aside>

      {/* ── MOBILE BOTTOM BAR ─────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-dark-800/95 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center justify-around px-1 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">

          {/* Items fijos (5 con el "+" en el centro) */}
          {MOBILE_MAIN.map((item) => {
            const { to, icon: Icon, label, badge, kind } = item;

            // Botón especial de creación tipo Instagram
            if (kind === 'create') {
              return (
                <button
                  key="create"
                  onClick={() => setShowCreateMenu(true)}
                  aria-label="Crear"
                  className="flex flex-col items-center gap-1 px-3 py-1 -mt-3 transition-transform active:scale-95"
                >
                  <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-pink-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
                    <FiPlus className="text-white" size={22} />
                  </span>
                  <span className="text-[10px] font-medium text-gray-400">{label}</span>
                </button>
              );
            }

            const count = badge === 'chat' ? unreadTotal : 0;
            return (
              <NavLink key={to} to={to} className={mobileLink}>
                <span className="relative">
                  <Icon size={22} />
                  {count > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{label}</span>
              </NavLink>
            );
          })}

          {/* Botón "Más" */}
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative ${
              showMore || isMoreActive ? 'text-brand-500' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="relative">
              {showMore ? <FiX size={22} /> : <FiGrid size={22} />}
              {/* Badge combinado: notifs + si hay notifs sin leer */}
              {!showMore && unreadNotifs > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* ── CREATE MENU SHEET (botón "+" central) ───────────── */}
      <CreateMenuSheet open={showCreateMenu} onClose={() => setShowCreateMenu(false)} />

      {/* ── MORE BOTTOM SHEET ─────────────────────────────────── */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* Backdrop */}
            <motion.div
              key="more-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
              onClick={() => setShowMore(false)}
            />

            {/* Sheet */}
            <motion.div
              key="more-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="lg:hidden fixed bottom-[64px] inset-x-0 z-40 bg-dark-800 border-t border-white/10 rounded-t-3xl pb-[env(safe-area-inset-bottom,0px)]"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              {/* Avatar del usuario */}
              {profile && (
                <button
                  onClick={() => { navigate('/profile'); setShowMore(false); }}
                  className="flex items-center gap-3 px-5 py-3 w-full hover:bg-white/5 transition-colors"
                >
                  <img
                    src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                    alt="" className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{profile.full_name}</p>
                    <p className="text-xs text-gray-500">Ver mi perfil</p>
                  </div>
                  {profile.premium_tier === 'vip'     && <span className="text-yellow-400">👑</span>}
                  {profile.premium_tier === 'premium' && <span className="text-brand-400">⚡</span>}
                </button>
              )}

              <div className="h-px bg-white/5 mx-4" />

              {/* Secciones agrupadas */}
              <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto">
                {moreSections.map((section) => (
                  <div key={section.title} className="mt-3 first:mt-2">
                    <p className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      {section.title}
                    </p>
                    <div className="grid grid-cols-4 gap-1">
                      {section.items.map(({ to, icon: Icon, label, badge, sub }) => {
                        const isActive = location.pathname.startsWith(to);
                        return (
                          <button
                            key={to}
                            onClick={() => { navigate(to); setShowMore(false); }}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-95 ${
                              isActive ? 'bg-brand-500/20' : 'hover:bg-white/5'
                            }`}
                          >
                            <span className="relative">
                              <Icon size={22} className={isActive ? 'text-brand-400' : 'text-gray-300'} />
                              {badge > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              )}
                            </span>
                            <span className={`text-[10px] font-medium text-center leading-tight ${isActive ? 'text-brand-400' : 'text-gray-400'}`}>
                              {label}
                            </span>
                            {sub && <span className="text-[9px] text-yellow-400 font-bold">{sub}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
