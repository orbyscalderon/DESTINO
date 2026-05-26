import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiHeart, FiVideo, FiUser, FiZap, FiSearch, FiGrid, FiFilm, FiBell, FiShield, FiSettings, FiBarChart2, FiCompass, FiMessageCircle, FiTrendingUp } from 'react-icons/fi';
import { useAuthStore } from '../../store/authStore.js';
import { useChatStore } from '../../store/chatStore.js';
import { supabase } from '../../lib/supabase.js';
import api from '../../lib/api.js';

// Mobile bottom nav (5 items max)
const mobileNavItems = [
  { to: '/home',          icon: FiHome,           label: 'Inicio',    badge: false },
  { to: '/matches',       icon: FiHeart,          label: 'Matches',   badge: false },
  { to: '/messages',      icon: FiMessageCircle,  label: 'Mensajes',  badge: 'chat' },
  { to: '/notifications', icon: FiBell,           label: 'Notifs',    badge: 'notifs' },
  { to: '/profile',       icon: FiUser,           label: 'Perfil',    badge: false },
];

// Desktop sidebar (full list)
const sidebarNavItems = [
  { to: '/home',          icon: FiHome,           label: 'Inicio' },
  { to: '/discover',      icon: FiCompass,        label: 'Descubrir' },
  { to: '/matches',       icon: FiHeart,          label: 'Matches' },
  { to: '/messages',      icon: FiMessageCircle,  label: 'Mensajes' },
  { to: '/search',        icon: FiSearch,         label: 'Buscar' },
  { to: '/shows',         icon: FiFilm,           label: 'Shows en vivo' },
  { to: '/leaderboard',   icon: FiTrendingUp,     label: 'Leaderboard' },
  { to: '/adult',         icon: FiShield,         label: 'Adultos 18+' },
  { to: '/video',         icon: FiVideo,          label: 'Videollamadas' },
  { to: '/profile',       icon: FiUser,           label: 'Perfil' },
];

export default function Navbar() {
  const { profile, user } = useAuthStore();
  const { unreadTotal, incrementUnread } = useChatStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [coinsBalance, setCoinsBalance] = useState(null);

  // Cargar unread de notificaciones y balance de coins al autenticarse
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

  // Suscribir a mensajes nuevos para badge de matches
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('navbar-unread')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        if (
          payload.new.sender_id !== user.id &&
          !location.pathname.startsWith('/matches') &&
          !location.pathname.startsWith('/chat')
        ) {
          incrementUnread();
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, location.pathname]);

  // Suscribir a notificaciones in-app en tiempo real
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'in_app_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUnreadNotifs(prev => prev + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  // Resetear badge al entrar en /notifications
  useEffect(() => {
    if (location.pathname === '/notifications') {
      setUnreadNotifs(0);
    }
  }, [location.pathname]);

  const sidebarLink = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
      isActive
        ? 'bg-brand-500/15 text-brand-400'
        : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
    }`;

  const mobileLink = ({ isActive }) =>
    `flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
      isActive ? 'text-brand-500' : 'text-gray-500 hover:text-gray-300'
    }`;

  return (
    <>
      {/* ── DESKTOP SIDEBAR (lg+) ──────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-dark-800 border-r border-white/[0.06] z-40">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/[0.06]">
          <h1 className="text-2xl font-black gradient-text">Destino 💕</h1>
          <p className="text-gray-600 text-xs mt-0.5">Encuentra tu conexión</p>
        </div>

        {/* Navegación */}
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

          {/* Notificaciones */}
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

          {/* Coins */}
          <NavLink
            to="/coins"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-yellow-500/10 mt-1 ${
                isActive
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'text-yellow-600/80 hover:text-yellow-400 hover:bg-yellow-500/5'
              }`
            }
          >
            <FiZap size={20} />
            <span className="flex-1">Coins</span>
            {coinsBalance !== null && (
              <span className="text-xs font-bold text-yellow-400">{coinsBalance.toLocaleString()}</span>
            )}
          </NavLink>

          {/* Admin — solo super admins */}
          {profile?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-red-500/20 mt-1 ${
                  isActive
                    ? 'bg-red-500/15 text-red-400'
                    : 'text-red-500/70 hover:text-red-400 hover:bg-red-500/10'
                }`
              }
            >
              <FiShield size={20} />
              Admin Panel
            </NavLink>
          )}

          {/* Creator Dashboard — solo si es creador */}
          {profile?.is_creator && (
            <NavLink
              to="/creator/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-purple-500/20 mt-1 ${
                  isActive
                    ? 'bg-purple-500/15 text-purple-400'
                    : 'text-purple-500/70 hover:text-purple-400 hover:bg-purple-500/10'
                }`
              }
            >
              <FiBarChart2 size={20} />
              Mi Dashboard
            </NavLink>
          )}

          {/* Configuración */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`
            }
          >
            <FiSettings size={20} />
            Configuración
          </NavLink>

          {/* Creador — solo si no lo es aún */}
          {!profile?.is_creator && (
            <NavLink
              to="/become-creator"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-purple-500/20 mt-1 ${
                  isActive
                    ? 'bg-purple-500/15 text-purple-400'
                    : 'text-purple-500/70 hover:text-purple-400 hover:bg-purple-500/10'
                }`
              }
            >
              <FiVideo size={20} />
              Ser Creador
            </NavLink>
          )}

          {!profile?.is_premium && (
            <NavLink
              to="/premium"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-yellow-500/20 mt-1 ${
                  isActive
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'text-yellow-500/70 hover:text-yellow-400 hover:bg-yellow-500/10'
                }`
              }
            >
              <FiZap size={20} />
              Hazte Premium
            </NavLink>
          )}
        </nav>

        {/* Usuario en el footer del sidebar */}
        {profile && (
          <div className="p-4 border-t border-white/[0.06]">
            <NavLink
              to="/profile"
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <img
                src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate group-hover:text-brand-400 transition-colors">
                  {profile.full_name}
                </p>
                <p className="text-xs text-gray-500 truncate">@{profile.username}</p>
              </div>
              {profile.premium_tier === 'vip' && <span className="text-yellow-400 text-sm shrink-0">👑</span>}
              {profile.premium_tier === 'premium' && <span className="text-brand-400 text-sm shrink-0">⚡</span>}
            </NavLink>
          </div>
        )}
      </aside>

      {/* ── MOBILE BOTTOM BAR (< lg) ──────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-dark-800/95 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center justify-around px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          {mobileNavItems.map(({ to, icon: Icon, label, badge }) => {
            const count = badge === 'chat' ? unreadTotal : badge === 'notifs' ? unreadNotifs : 0;
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
        </div>
      </nav>
    </>
  );
}
