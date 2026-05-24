import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense, Component } from 'react';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import * as Sentry from '@sentry/react';

import { useAuthStore } from './store/authStore.js';
import { useCallStore } from './store/callStore.js';
import { useThemeStore } from './store/themeStore.js';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import { initPushNotifications } from './lib/pushNotifications.js';
import { initAdMob } from './lib/admob.js';
import api from './lib/api.js';
import { supabase } from './lib/supabase.js';
import OfflineBanner from './components/ui/OfflineBanner.jsx';
import OnboardingTour from './components/ui/OnboardingTour.jsx';
import DailyReward from './components/ui/DailyReward.jsx';
import IncomingCallModal from './components/ui/IncomingCallModal.jsx';

const Landing     = lazy(() => import('./pages/Landing.jsx'));
const Register    = lazy(() => import('./pages/Register.jsx'));
const Login       = lazy(() => import('./pages/Login.jsx'));
const AuthCallback= lazy(() => import('./pages/AuthCallback.jsx'));
const Onboarding  = lazy(() => import('./pages/Onboarding.jsx'));
const Home        = lazy(() => import('./pages/Home.jsx'));
const Discover    = lazy(() => import('./pages/Discover.jsx'));
const Matches     = lazy(() => import('./pages/Matches.jsx'));
const Messages    = lazy(() => import('./pages/Messages.jsx'));
const Chat        = lazy(() => import('./pages/Chat.jsx'));
const Video       = lazy(() => import('./pages/Video.jsx'));
const Profile     = lazy(() => import('./pages/Profile.jsx'));
const UserProfile = lazy(() => import('./pages/UserProfile.jsx'));
const Premium     = lazy(() => import('./pages/Premium.jsx'));
const Settings      = lazy(() => import('./pages/Settings.jsx'));
const Admin         = lazy(() => import('./pages/Admin.jsx'));
const Privacy       = lazy(() => import('./pages/Privacy.jsx'));
const Terms         = lazy(() => import('./pages/Terms.jsx'));
const Help          = lazy(() => import('./pages/Help.jsx'));
const NotFound      = lazy(() => import('./pages/NotFound.jsx'));
const BecomeCreator = lazy(() => import('./pages/BecomeCreator.jsx'));
const CreatorDashboard = lazy(() => import('./pages/CreatorDashboard.jsx'));
const LiveShows     = lazy(() => import('./pages/LiveShows.jsx'));
const LiveShow      = lazy(() => import('./pages/LiveShow.jsx'));
const Coins         = lazy(() => import('./pages/Coins.jsx'));
const Moments       = lazy(() => import('./pages/Moments.jsx'));
const Search        = lazy(() => import('./pages/Search.jsx'));
const Notifications   = lazy(() => import('./pages/Notifications.jsx'));
const VideoCall       = lazy(() => import('./pages/VideoCall.jsx'));
const AdultCreators   = lazy(() => import('./pages/AdultCreators.jsx'));
const VideoRequests   = lazy(() => import('./pages/VideoRequests.jsx'));
const VerifyEmail     = lazy(() => import('./pages/VerifyEmail.jsx'));
const ForgotPassword  = lazy(() => import('./pages/ForgotPassword.jsx'));
const Error403        = lazy(() => import('./pages/Error403.jsx'));
const Error500        = lazy(() => import('./pages/Error500.jsx'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark-900">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-5xl">😕</div>
          <p className="text-white font-semibold text-lg">Algo salió mal</p>
          <p className="text-gray-400 text-sm">Esta sección no pudo cargarse.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="btn-primary mt-2"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function IncomingCallListener() {
  const { user } = useAuthStore();
  const { incomingCall, setRinging, resetCall } = useCallStore();
  const navigate = useNavigate();
  const channelRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;

    const ch = supabase
      .channel(`incoming_${user.id}`)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        setRinging(payload);
        // Auto-cancel if not answered in 30s
        const t = setTimeout(() => resetCall(), 30_000);
        ch.__declineTimer = t;
      })
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    clearTimeout(channelRef.current?.__declineTimer);
    resetCall();
    navigate(`/call/${incomingCall.matchId}`);
  };

  const handleDecline = async () => {
    clearTimeout(channelRef.current?.__declineTimer);
    await api.post(`/api/rtc/call/${incomingCall.matchId}/reject`, { roomId: incomingCall.roomId }).catch(() => {});
    resetCall();
  };

  return (
    <AnimatePresence>
      <IncomingCallModal call={incomingCall} onAccept={handleAccept} onDecline={handleDecline} />
    </AnimatePresence>
  );
}

export default function App() {
  const { initialize, user, initialized } = useAuthStore();
  const heartbeatRef = useRef(null);

  const initTheme = useThemeStore(s => s.init);
  useEffect(() => {
    initialize();
    initAdMob();
    initTheme();
  }, []);

  // Heartbeat para "en línea" real + push notifications cuando el usuario está autenticado
  useEffect(() => {
    if (!user) {
      clearInterval(heartbeatRef.current);
      return;
    }

    // Latido inmediato al cargar
    api.post('/api/profiles/heartbeat').catch(() => {});

    // Luego cada 2 minutos
    heartbeatRef.current = setInterval(() => {
      api.post('/api/profiles/heartbeat').catch(() => {});
    }, 2 * 60 * 1000);

    // Push notifications — solo pedir permiso la primera vez
    initPushNotifications();

    return () => clearInterval(heartbeatRef.current);
  }, [user?.id]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center space-y-4">
          <div className="text-5xl">💕</div>
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <OfflineBanner />
      {user && <OnboardingTour />}
      {user && <DailyReward />}
      {user && <IncomingCallListener />}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
        }}
      />
      <Routes>
        {/* Rutas públicas */}
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/help" element={<Help />} />
        <Route path="/403" element={<Error403 />} />
        <Route path="/500" element={<Error500 />} />

        {/* Rutas protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/chat/:matchId" element={<Chat />} />
          <Route path="/video" element={<Video />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<UserProfile />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/become-creator" element={<BecomeCreator />} />
          <Route path="/creator/dashboard" element={<CreatorDashboard />} />
          <Route path="/shows" element={<LiveShows />} />
          <Route path="/shows/:id" element={<LiveShow />} />
          <Route path="/coins" element={<Coins />} />
          <Route path="/moments" element={<Navigate to="/home" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/call/:matchId" element={<VideoCall />} />
          <Route path="/adult" element={<AdultCreators />} />
          <Route path="/video-requests" element={<VideoRequests />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
