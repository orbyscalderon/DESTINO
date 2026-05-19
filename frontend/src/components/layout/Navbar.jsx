import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FiHome, FiHeart, FiVideo, FiUser, FiZap } from 'react-icons/fi';
import { useAuthStore } from '../../store/authStore.js';
import { useChatStore } from '../../store/chatStore.js';
import { supabase } from '../../lib/supabase.js';

const navItems = [
  { to: '/home',    icon: FiHome,  label: 'Inicio' },
  { to: '/matches', icon: FiHeart, label: 'Matches' },
  { to: '/video',   icon: FiVideo, label: 'Video' },
  { to: '/profile', icon: FiUser,  label: 'Perfil' },
];

export default function Navbar() {
  const { profile, user } = useAuthStore();
  const { unreadTotal, incrementUnread } = useChatStore();
  const location = useLocation();

  // Suscribir a mensajes nuevos para incrementar el badge
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('navbar-unread')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        // Solo contar mensajes de otros usuarios y solo si no estamos en matches/chat
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

  const sidebarLink = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
      isActive
        ? 'bg-brand-500/15 text-brand-400'
        : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
    }`;

  const mobileLink = ({ isActive }) =>
    `flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all ${
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
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={sidebarLink}>
              <span className="relative">
                <Icon size={20} />
                {to === '/matches' && unreadTotal > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          ))}

          {!profile?.is_premium && (
            <NavLink
              to="/premium"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium border border-yellow-500/20 mt-3 ${
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
              {profile.is_premium && <span className="text-yellow-400 text-sm shrink-0">⚡</span>}
            </NavLink>
          </div>
        )}
      </aside>

      {/* ── MOBILE BOTTOM BAR (< lg) ──────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-dark-800/95 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center justify-around px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={mobileLink}>
              <span className="relative">
                <Icon size={22} />
                {to === '/matches' && unreadTotal > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
          {!profile?.is_premium && (
            <NavLink
              to="/premium"
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all ${
                  isActive ? 'text-yellow-400' : 'text-yellow-500/60 hover:text-yellow-400'
                }`
              }
            >
              <FiZap size={22} />
              <span className="text-[10px] font-medium">Premium</span>
            </NavLink>
          )}
        </div>
      </nav>
    </>
  );
}
