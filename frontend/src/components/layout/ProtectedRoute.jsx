import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore.js';
import Navbar from './Navbar.jsx';

export default function ProtectedRoute() {
  const { user, loading, profile } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Cargando Destino...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // Bloquear acceso hasta verificar email (excepto Google OAuth que ya está verificado)
  const isEmailProvider = user.app_metadata?.provider === 'email';
  if (isEmailProvider && !user.email_confirmed_at && location.pathname !== '/verify-email') {
    return <Navigate to="/verify-email" replace />;
  }

  if ((!profile || !profile.username) && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-dark-900 pb-20 lg:pb-0 lg:ml-64">
        <Outlet />
      </div>
    </>
  );
}
