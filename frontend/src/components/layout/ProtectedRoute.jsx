import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore.js';
import Navbar from './Navbar.jsx';
import { useCallManager } from '../../hooks/useCallManager.js';
import IncomingCallModal from '../ui/IncomingCallModal.jsx';
import DirectCallRoom from '../ui/DirectCallRoom.jsx';

export default function ProtectedRoute() {
  const { user, loading, profile } = useAuthStore();
  const location = useLocation();
  const { callStatus, incomingCall, activeCall, initiateCall, acceptCall, declineCall, endCall } = useCallManager();

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

  if (profile && !profile.username && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <Navbar />
      {/* Mobile: pb-20 deja espacio para el navbar fijo. Desktop: ml-64 deja espacio para el sidebar. */}
      <div className="min-h-screen bg-dark-900 pb-20 lg:pb-0 lg:ml-64">
        <Outlet context={{ initiateCall }} />
      </div>

      {/* Modal de llamada entrante */}
      <AnimatePresence>
        {callStatus === 'ringing' && incomingCall && (
          <IncomingCallModal
            call={incomingCall}
            onAccept={acceptCall}
            onDecline={declineCall}
          />
        )}
      </AnimatePresence>

      {/* Sala de llamada activa (overlay full-screen) */}
      <AnimatePresence>
        {(callStatus === 'calling' || callStatus === 'connected') && activeCall && (
          <DirectCallRoom onEnd={endCall} />
        )}
      </AnimatePresence>
    </>
  );
}
