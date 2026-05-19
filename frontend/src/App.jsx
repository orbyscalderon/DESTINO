import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from './store/authStore.js';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import { initPushNotifications } from './lib/pushNotifications.js';
import { initAdMob } from './lib/admob.js';
import api from './lib/api.js';

import Landing from './pages/Landing.jsx';
import Register from './pages/Register.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Matches from './pages/Matches.jsx';
import Chat from './pages/Chat.jsx';
import Video from './pages/Video.jsx';
import Profile from './pages/Profile.jsx';
import UserProfile from './pages/UserProfile.jsx';
import Premium from './pages/Premium.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const { initialize, user, initialized } = useAuthStore();
  const heartbeatRef = useRef(null);

  useEffect(() => {
    initialize();
    initAdMob();
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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Rutas protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/chat/:matchId" element={<Chat />} />
          <Route path="/video" element={<Video />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<UserProfile />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
