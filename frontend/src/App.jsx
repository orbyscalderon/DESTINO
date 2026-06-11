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
import { identify, reset as resetAnalytics } from './lib/analytics.js';
import { initAdMob } from './lib/admob.js';
import api from './lib/api.js';
import { supabase } from './lib/supabase.js';
import OfflineBanner from './components/ui/OfflineBanner.jsx';
import OnboardingTour from './components/ui/OnboardingTour.jsx';
import IncomingCallModal from './components/ui/IncomingCallModal.jsx';
import CoHostInviteModal from './components/ui/CoHostInviteModal.jsx';
import CookieBanner from './components/CookieBanner.jsx';

const Landing     = lazy(() => import('./pages/Landing.jsx'));
const Register    = lazy(() => import('./pages/Register.jsx'));
const Login       = lazy(() => import('./pages/Login.jsx'));
const AuthCallback= lazy(() => import('./pages/AuthCallback.jsx'));
const Onboarding  = lazy(() => import('./pages/Onboarding.jsx'));
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
const ShowStudio    = lazy(() => import('./pages/ShowStudio.jsx'));
const LiveShows     = lazy(() => import('./pages/LiveShows.jsx'));
const LiveShow      = lazy(() => import('./pages/LiveShow.jsx'));
const Coins         = lazy(() => import('./pages/Coins.jsx'));
const Moments       = lazy(() => import('./pages/Moments.jsx'));
const Search        = lazy(() => import('./pages/Search.jsx'));
const Notifications   = lazy(() => import('./pages/Notifications.jsx'));
const VideoCall       = lazy(() => import('./pages/VideoCall.jsx'));
// Build flag IOS_BUILD: cuando se compila para App Store, no se importa la
// página de creators 18+. El bundle iOS pasa review de Apple (Guideline 1.1.4).
// Para activar: VITE_IOS_BUILD=1 npm run build:mobile
const IOS_BUILD = import.meta.env.VITE_IOS_BUILD === '1';
const AdultCreators = IOS_BUILD
  ? lazy(() => import('./pages/NotFound.jsx'))
  : lazy(() => import('./pages/AdultCreators.jsx'));
const VideoRequests   = lazy(() => import('./pages/VideoRequests.jsx'));
const Leaderboard     = lazy(() => import('./pages/Leaderboard.jsx'));
const VerifyEmail     = lazy(() => import('./pages/VerifyEmail.jsx'));
const ForgotPassword  = lazy(() => import('./pages/ForgotPassword.jsx'));
const Error403        = lazy(() => import('./pages/Error403.jsx'));
const Error500        = lazy(() => import('./pages/Error500.jsx'));
const DMCA            = lazy(() => import('./pages/DMCA.jsx'));
const Referrals       = lazy(() => import('./pages/Referrals.jsx'));
const Achievements    = lazy(() => import('./pages/Achievements.jsx'));
const CoHostStage     = lazy(() => import('./pages/CoHostStage.jsx'));
const Explore         = lazy(() => import('./pages/Explore.jsx'));
const ExploreVideo    = lazy(() => import('./pages/ExploreVideo.jsx'));
const Playlists       = lazy(() => import('./pages/Playlists.jsx'));
const Support         = lazy(() => import('./pages/Support.jsx'));
const Reels           = lazy(() => import('./pages/Reels.jsx'));
const UploadReel      = lazy(() => import('./pages/UploadReel.jsx'));
const SavedReels      = lazy(() => import('./pages/SavedReels.jsx'));
const Stickers        = lazy(() => import('./pages/Stickers.jsx'));
const Conversations   = lazy(() => import('./pages/Conversations.jsx'));
const ConversationChat = lazy(() => import('./pages/ConversationChat.jsx'));
const Compliance         = lazy(() => import('./pages/Compliance.jsx'));
const Page2257           = lazy(() => import('./pages/Page2257.jsx'));
const TransparencyReport = lazy(() => import('./pages/TransparencyReport.jsx'));
const PrivacyPreferences = lazy(() => import('./pages/PrivacyPreferences.jsx'));
const CCPAOptOut         = lazy(() => import('./pages/CCPAOptOut.jsx'));
const DSANotice          = lazy(() => import('./pages/DSANotice.jsx'));
const CreatorWelcomeMessage = lazy(() => import('./pages/CreatorWelcomeMessage.jsx'));
const CreatorMassDM      = lazy(() => import('./pages/CreatorMassDM.jsx'));
const CreatorMonetizationHub = lazy(() => import('./pages/CreatorMonetizationHub.jsx'));
const CreatorVault       = lazy(() => import('./pages/CreatorVault.jsx'));
const CreatorCollections = lazy(() => import('./pages/CreatorCollections.jsx'));
const CreatorDMPricing   = lazy(() => import('./pages/CreatorDMPricing.jsx'));
const CreatorPromoCodes  = lazy(() => import('./pages/CreatorPromoCodes.jsx'));
const CreatorAIPersona   = lazy(() => import('./pages/CreatorAIPersona.jsx'));
const CreatorAutoReply   = lazy(() => import('./pages/CreatorAutoReply.jsx'));
const CreatorTopFans     = lazy(() => import('./pages/CreatorTopFans.jsx'));
const CreatorScheduled   = lazy(() => import('./pages/CreatorScheduled.jsx'));
const CreatorGeoBlock    = lazy(() => import('./pages/CreatorGeoBlock.jsx'));
const PhotoCollectionView = lazy(() => import('./pages/PhotoCollectionView.jsx'));
const CreatorVideoSeries = lazy(() => import('./pages/CreatorVideoSeries.jsx'));
const VideoSeriesView    = lazy(() => import('./pages/VideoSeriesView.jsx'));
const CreatorCostars     = lazy(() => import('./pages/CreatorCostars.jsx'));
const ContinueWatching   = lazy(() => import('./pages/ContinueWatching.jsx'));
const Subprocessors      = lazy(() => import('./pages/Subprocessors.jsx'));
const Cookies            = lazy(() => import('./pages/Cookies.jsx'));
const ProcessingActivities = lazy(() => import('./pages/ProcessingActivities.jsx'));
const MyModerationDecisions = lazy(() => import('./pages/MyModerationDecisions.jsx'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark-900">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Detecta errores de carga de chunks lazy. Sucede cuando hay un deploy
// nuevo: el index.html viejo apunta a /assets/Reels-abc123.js pero ese hash
// ya no existe → "Failed to fetch dynamically imported module" o el browser
// devuelve text/html (404 → SPA fallback) → "Expected a module script".
function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module/i.test(msg)
      || /error loading dynamically imported module/i.test(msg)
      || /Loading chunk \d+ failed/i.test(msg)
      || /(Expected a JavaScript|JavaScript-or-Wasm) module script/i.test(msg)
      || /MIME type of "text\/html"/i.test(msg);
}

const RELOAD_FLAG = 'destino-chunk-reload';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }
  componentDidCatch(error, info) {
    // Si es chunk error y no recargamos aún en esta sesión, recargar una vez.
    // El flag evita loop infinito si el problema fuera persistente (ej.
    // CDN caído).
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
          return;
        }
      } catch {}
    }
    Sentry.captureException(error, { extra: info });
  }
  render() {
    if (this.state.hasError) {
      const isChunk = this.state.isChunkError;
      return (
        <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-5xl">{isChunk ? '🔄' : '😕'}</div>
          <p className="text-white font-semibold text-lg">
            {isChunk ? 'Nueva versión disponible' : 'Algo salió mal'}
          </p>
          <p className="text-gray-400 text-sm">
            {isChunk
              ? 'Recarga para obtener la última versión de Destino TV.'
              : 'Esta sección no pudo cargarse.'}
          </p>
          <button
            onClick={() => {
              if (isChunk) {
                try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
                window.location.reload();
              } else {
                this.setState({ hasError: false, isChunkError: false });
              }
            }}
            className="btn-primary mt-2"
          >
            {isChunk ? 'Recargar' : 'Reintentar'}
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
    navigate(`/call/${incomingCall.matchId}`, { state: { roomId: incomingCall.roomId } });
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

    // Si llegamos hasta aquí sin error, limpiamos el flag de reload tras 5s
    // para que un futuro deploy también pueda autorrecargar una vez.
    const flagCleanup = setTimeout(() => {
      try { sessionStorage.removeItem('destino-chunk-reload'); } catch {}
    }, 5_000);

    // Listener global: a veces los chunk errors ocurren fuera del árbol React
    // (durante la carga inicial de un import dinámico) y no llegan al boundary.
    // Aquí capturamos esos casos también.
    const onUnhandled = (event) => {
      const err = event.reason || event.error || event;
      const msg = String(err?.message || err || '');
      const isChunkErr = /Failed to fetch dynamically imported module/i.test(msg)
                      || /Loading chunk \d+ failed/i.test(msg)
                      || /(Expected a JavaScript|JavaScript-or-Wasm) module script/i.test(msg)
                      || /MIME type of "text\/html"/i.test(msg);
      if (!isChunkErr) return;
      try {
        if (!sessionStorage.getItem('destino-chunk-reload')) {
          sessionStorage.setItem('destino-chunk-reload', String(Date.now()));
          window.location.reload();
        }
      } catch {}
    };
    window.addEventListener('error', onUnhandled);
    window.addEventListener('unhandledrejection', onUnhandled);

    // OAuth deep link en Capacitor nativo: cuando Supabase nos devuelve a
    // com.destino.app://auth/callback#access_token=..., procesamos el URL
    // y restauramos la sesión. Solo aplica en Android/iOS — en web Supabase
    // lo maneja vía URL hash en el mismo origin.
    let removeListener = null;
    (async () => {
      const { isCapacitorNative, handleAuthDeepLink } = await import('./lib/oauth.js');
      if (!isCapacitorNative()) return;
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const sub = await CapApp.addListener('appUrlOpen', async ({ url }) => {
          const res = await handleAuthDeepLink(url);
          if (res?.ok) {
            try {
              const { Browser } = await import('@capacitor/browser');
              await Browser.close();
            } catch {}
          }
        });
        removeListener = () => sub.remove();
      } catch (err) {
        console.warn('[oauth] no se pudo registrar listener appUrlOpen:', err?.message);
      }
    })();
    return () => {
      clearTimeout(flagCleanup);
      window.removeEventListener('error', onUnhandled);
      window.removeEventListener('unhandledrejection', onUnhandled);
      try { removeListener?.(); } catch {}
    };
  }, []);

  // Heartbeat para "en línea" real + push notifications cuando el usuario está autenticado
  useEffect(() => {
    if (!user) {
      clearInterval(heartbeatRef.current);
      resetAnalytics().catch(() => {});
      return;
    }

    // Identify para analytics
    identify(user.id, {
      email: user.email,
      is_creator: !!user.user_metadata?.is_creator,
    }).catch(() => {});

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
      <div className="min-h-screen flex items-center justify-center bg-dark-900 hero-mesh relative overflow-hidden">
        <div className="glow-orb glow-orb-brand top-1/4 left-1/4 w-80 h-80" />
        <div className="glow-orb glow-orb-accent bottom-1/4 right-1/4 w-72 h-72" style={{ animationDelay: '1s' }} />
        <div className="text-center space-y-4 relative z-10">
          <div className="text-6xl animate-float drop-shadow-[0_8px_24px_rgba(244,63,94,0.4)]">💕</div>
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-mono tracking-wider uppercase">Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <OfflineBanner />
      <CookieBanner />
      {user && <OnboardingTour />}
      {user && <IncomingCallListener />}
      {user && <CoHostInviteModal />}
      <Toaster
        position="top-center"
        gutter={10}
        toastOptions={{
          duration: 3200,
          className: 'toast-custom',
          style: {
            background: 'rgba(10, 10, 15, 0.88)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            padding: '14px 18px',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '-0.005em',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(244, 63, 94, 0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
          },
          success: {
            iconTheme: { primary: '#34d399', secondary: '#0a0a0f' },
            style: {
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(52, 211, 153, 0.22), 0 0 24px rgba(52, 211, 153, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            },
          },
          error: {
            iconTheme: { primary: '#fb7185', secondary: '#0a0a0f' },
            style: {
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(251, 113, 133, 0.22), 0 0 24px rgba(251, 113, 133, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            },
          },
          loading: {
            iconTheme: { primary: '#f43f5e', secondary: '#0a0a0f' },
            style: {
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(244, 63, 94, 0.22), 0 0 24px rgba(244, 63, 94, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            },
          },
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
        <Route path="/dmca" element={<DMCA />} />
        <Route path="/2257" element={<Page2257 />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/transparency" element={<TransparencyReport />} />
        <Route path="/privacy/ccpa" element={<CCPAOptOut />} />
        <Route path="/privacy/subprocessors" element={<Subprocessors />} />
        <Route path="/privacy/cookies" element={<Cookies />} />
        <Route path="/privacy/processing" element={<ProcessingActivities />} />
        <Route path="/dsa-notice" element={<DSANotice />} />
        <Route path="/support" element={<Support />} />
        <Route path="/403" element={<Error403 />} />
        <Route path="/500" element={<Error500 />} />

        {/* Rutas protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Moments />} />
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
          <Route path="/studio" element={<ShowStudio />} />
          <Route path="/shows" element={<LiveShows />} />
          <Route path="/shows/:id" element={<LiveShow />} />
          <Route path="/coins" element={<Coins />} />
          <Route path="/moments" element={<Navigate to="/home" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/call/:matchId" element={<VideoCall />} />
          {!IOS_BUILD && <Route path="/adult" element={<AdultCreators />} />}
          <Route path="/video-requests" element={<VideoRequests />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/cohost/:showId" element={<CoHostStage />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/explore/v/:id" element={<ExploreVideo />} />
          <Route path="/explore/playlists" element={<Playlists />} />
          <Route path="/explore/playlists/:id" element={<Playlists />} />
          <Route path="/reels" element={<Reels />} />
          <Route path="/reels/new" element={<UploadReel />} />
          <Route path="/reels/saved" element={<SavedReels />} />
          <Route path="/reels/:id" element={<Reels />} />
          <Route path="/stickers" element={<Stickers />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/conversations/:id" element={<ConversationChat />} />
          <Route path="/privacy/preferences" element={<PrivacyPreferences />} />
          <Route path="/privacy/moderation-decisions" element={<MyModerationDecisions />} />
          <Route path="/creator/welcome-message" element={<CreatorWelcomeMessage />} />
          <Route path="/creator/mass-dm" element={<CreatorMassDM />} />
          <Route path="/creator/monetization" element={<CreatorMonetizationHub />} />
          <Route path="/creator/vault" element={<CreatorVault />} />
          <Route path="/creator/collections" element={<CreatorCollections />} />
          <Route path="/creator/dm-pricing" element={<CreatorDMPricing />} />
          <Route path="/creator/promo-codes" element={<CreatorPromoCodes />} />
          <Route path="/creator/ai-persona" element={<CreatorAIPersona />} />
          <Route path="/creator/auto-reply" element={<CreatorAutoReply />} />
          <Route path="/creator/top-fans" element={<CreatorTopFans />} />
          <Route path="/creator/scheduled" element={<CreatorScheduled />} />
          <Route path="/creator/geo-block" element={<CreatorGeoBlock />} />
          <Route path="/c/collection/:id" element={<PhotoCollectionView />} />
          <Route path="/creator/video-series" element={<CreatorVideoSeries />} />
          <Route path="/series/:id" element={<VideoSeriesView />} />
          <Route path="/creator/costars" element={<CreatorCostars />} />
          <Route path="/continue-watching" element={<ContinueWatching />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
