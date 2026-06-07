import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrash2, FiLock, FiBell, FiBellOff, FiShield, FiEye, FiEyeOff, FiGift, FiCopy, FiCheck, FiUserX, FiChevronDown, FiChevronUp, FiSun, FiMoon, FiDownload, FiPause, FiPlay, FiWifiOff, FiGlobe, FiKey } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import AccountDeletionSection from '../components/ui/AccountDeletionSection.jsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import { useThemeStore } from '../store/themeStore.js';
import { supabase } from '../lib/supabase.js';
import { initPushNotifications } from '../lib/pushNotifications.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';

const DEFAULT_PREFS = {
  matches: true,
  messages: true,
  likes: true,
  shows: true,
  rewards: true,
};

export default function Settings() {
  const { logout } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(false);
  const [togglingNotif, setTogglingNotif] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [referralData, setReferralData] = useState(null);
  const [referralCode, setReferralCode] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblocking, setUnblocking] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState(DEFAULT_PREFS);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  // 2FA
  const [mfaFactors, setMfaFactors] = useState([]);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQr, setMfaQr] = useState(null);       // { qr_code, factorId }
  const [mfaCode, setMfaCode] = useState('');
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = useState(false);
  // Appeals
  const [appeals, setAppeals] = useState([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [showAppeals, setShowAppeals] = useState(false);
  const [appealForm, setAppealForm] = useState({ content_type: 'post', content_id: '', reason: '' });
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  useEffect(() => {
    api.get('/api/referrals/code')
      .then(({ data }) => setReferralData(data))
      .catch(() => {});

    supabase.auth.mfa.listFactors()
      .then(({ data }) => setMfaFactors(data?.totp || []))
      .catch(() => {});

    api.get('/api/notifications/prefs')
      .then(({ data }) => setNotifPrefs({ ...DEFAULT_PREFS, ...data.prefs }))
      .catch(() => {});
  }, []);

  const loadBlockedUsers = async () => {
    if (blockedUsers.length > 0) { setShowBlocked(v => !v); return; }
    setLoadingBlocked(true);
    try {
      const { data } = await api.get('/api/blocks');
      setBlockedUsers((data.blocked || []).map(b => b.profile || b));
      setShowBlocked(true);
    } catch {
      toast.error('Error al cargar bloqueados');
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (userId) => {
    setUnblocking(userId);
    try {
      await api.delete(`/api/blocks/${userId}`);
      setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('Usuario desbloqueado');
    } catch {
      toast.error('Error al desbloquear');
    } finally {
      setUnblocking(null);
    }
  };

  const handleLoadAppeals = async () => {
    if (appeals.length > 0 || loadingAppeals) { setShowAppeals(v => !v); return; }
    setLoadingAppeals(true);
    setShowAppeals(true);
    try {
      const { data } = await api.get('/api/appeals');
      setAppeals(data.appeals || []);
    } catch {
      toast.error('Error al cargar apelaciones');
    } finally {
      setLoadingAppeals(false);
    }
  };

  const handleSubmitAppeal = async () => {
    if (!appealForm.content_id.trim()) return toast.error('Ingresa el ID del contenido');
    if (appealForm.reason.trim().length < 10) return toast.error('La razón debe tener al menos 10 caracteres');
    setSubmittingAppeal(true);
    try {
      const { data } = await api.post('/api/appeals', appealForm);
      setAppeals(prev => [data.appeal, ...prev]);
      setAppealForm(f => ({ ...f, content_id: '', reason: '' }));
      toast.success('Apelación enviada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar apelación');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleCopyCode = async () => {
    if (!referralData?.code) return;
    await navigator.clipboard.writeText(referralData.share_url || referralData.code).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
    toast.success('Link copiado');
  };

  const handleApplyCode = async () => {
    if (!referralCode.trim()) return;
    setApplyingCode(true);
    try {
      const { data } = await api.post('/api/referrals/apply', { code: referralCode.trim() });
      toast.success(data.message);
      setReferralCode('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código inválido');
    } finally {
      setApplyingCode(false);
    }
  };

  useEffect(() => {
    const checkSubscription = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setNotifications(!!sub);
      } catch {}
    };
    checkSubscription();
  }, []);

  // AuthCallback redirige aquí con ?reset=true cuando el usuario viene del enlace de email
  const isResettingPassword = new URLSearchParams(location.search).get('reset') === 'true';

  const handlePasswordReset = async () => {
    setSendingReset(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) {
        toast.error('No se pudo obtener el usuario. Intenta de nuevo.');
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(authUser.email, {
        redirectTo: `${window.location.origin}/#/auth/callback`,
      });
      if (error) toast.error('No se pudo enviar el email. Intenta más tarde.');
      else toast.success('Email de recuperación enviado. Revisa tu bandeja de entrada.');
    } catch {
      toast.error('Error de red. Intenta más tarde.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres');
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPass(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Contraseña actualizada correctamente');
      setNewPassword('');
      navigate('/settings', { replace: true });
    }
  };

  const toggleNotifPref = (key) => {
    setNotifPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      api.put('/api/notifications/prefs', next).catch(() => {});
      return next;
    });
  };

  const handleToggleNotifications = async () => {
    if (togglingNotif) return;
    setTogglingNotif(true);
    try {
      if (notifications) {
        // Desuscribir
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration('/sw.js');
          const sub = await reg?.pushManager?.getSubscription();
          await sub?.unsubscribe();
        }
        await api.delete('/api/notifications/unsubscribe').catch(() => {});
        setNotifications(false);
        toast.success('Notificaciones desactivadas');
      } else {
        // Suscribir — reutiliza la lógica existente
        await initPushNotifications();
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager?.getSubscription();
        setNotifications(!!sub);
        if (sub) toast.success('Notificaciones activadas');
        else toast.error('No se pudieron activar las notificaciones');
      }
    } catch {
      toast.error('Error al cambiar notificaciones');
    } finally {
      setTogglingNotif(false);
    }
  };

  const handleMfaEnroll = async () => {
    setMfaEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Destino TV', friendlyName: 'Authenticator' });
      if (error) throw error;
      setMfaQr({ qr_code: data.totp.qr_code, factorId: data.id, secret: data.totp.secret });
    } catch (err) {
      toast.error(err.message || 'Error al configurar 2FA');
    } finally {
      setMfaEnrolling(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaCode.trim() || !mfaQr) return;
    setMfaVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaQr.factorId, code: mfaCode });
      if (error) throw error;
      setMfaFactors(prev => [...prev, { id: mfaQr.factorId, status: 'verified', friendly_name: 'Authenticator' }]);
      setMfaQr(null);
      setMfaCode('');
      toast.success('Verificación en dos pasos activada');
    } catch (err) {
      toast.error(err.message || 'Código incorrecto');
    } finally {
      setMfaVerifying(false);
    }
  };

  const handleMfaUnenroll = async (factorId) => {
    if (!confirm('¿Desactivar verificación en dos pasos?')) return;
    setMfaUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setMfaFactors(prev => prev.filter(f => f.id !== factorId));
      toast.success('2FA desactivado');
    } catch (err) {
      toast.error(err.message || 'Error al desactivar 2FA');
    } finally {
      setMfaUnenrolling(false);
    }
  };

  const handleDeleteAccount = async () => {
    const phrase = window.prompt(
      'Esta acción es PERMANENTE e irreversible. Borraremos todos tus datos, fotos, mensajes y suscripciones.\n\n' +
      'Para confirmar, escribe exactamente:\n\nBORRAR MI CUENTA'
    );
    if (phrase !== 'BORRAR MI CUENTA') {
      if (phrase !== null) toast.error('Confirmación incorrecta. Cuenta NO eliminada.');
      return;
    }
    setDeletingAccount(true);
    try {
      await api.delete('/api/gdpr/account', { data: { confirm: 'BORRAR MI CUENTA' } });
      toast.success('Cuenta eliminada permanentemente');
      await logout();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar la cuenta. Inténtalo de nuevo.');
      setDeletingAccount(false);
    }
  };

  const [hideOnline, setHideOnline] = useState(false);
  const [togglingHideOnline, setTogglingHideOnline] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausingAccount, setPausingAccount] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [travelCity, setTravelCity] = useState('');
  const [travelActive, setTravelActive] = useState(false);
  const [activatingTravel, setActivatingTravel] = useState(false);

  const activateTravel = async () => {
    if (!travelCity.trim()) return toast.error('Ingresa una ciudad');
    setActivatingTravel(true);
    try {
      // Geocode con OpenStreetMap Nominatim (gratis)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(travelCity)}`);
      const data = await res.json();
      if (!data[0]) { toast.error('Ciudad no encontrada'); setActivatingTravel(false); return; }
      const { lat, lon, display_name } = data[0];
      await api.post('/api/profiles/travel', {
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        city: display_name.split(',')[0],
      });
      setTravelActive(true);
      toast.success(`Modo viajando: ${display_name.split(',')[0]}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al activar travel mode');
    } finally {
      setActivatingTravel(false);
    }
  };

  const clearTravel = async () => {
    try {
      await api.delete('/api/profiles/travel');
      setTravelActive(false);
      setTravelCity('');
      toast.success('Modo viajando desactivado');
    } catch {
      toast.error('Error al desactivar');
    }
  };

  const handleToggleHideOnline = async () => {
    setTogglingHideOnline(true);
    try {
      const { data } = await api.put('/api/profiles/hide-online', { enabled: !hideOnline });
      setHideOnline(data.hide_online_status);
      toast.success(data.hide_online_status ? 'Estado oculto' : 'Estado visible');
    } catch {
      toast.error('Error al cambiar privacidad del estado');
    } finally {
      setTogglingHideOnline(false);
    }
  };

  const handlePauseAccount = async () => {
    if (!isPaused && !confirm('¿Pausar tu cuenta? No aparecerás en el feed mientras esté pausada.')) return;
    setPausingAccount(true);
    try {
      if (isPaused) {
        await api.post('/api/profiles/unpause');
        setIsPaused(false);
        toast.success('Cuenta reactivada');
      } else {
        await api.post('/api/profiles/pause');
        setIsPaused(true);
        toast.success('Cuenta pausada');
      }
    } catch {
      toast.error('Error al cambiar estado de cuenta');
    } finally {
      setPausingAccount(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await api.get('/api/gdpr/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `destino_datos_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Datos descargados (GDPR art. 20)');
    } catch {
      toast.error('Error al exportar datos');
    } finally {
      setExportingData(false);
    }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 lg:pb-8 lg:px-10 lg:pt-10 relative">
      {/* Glow sutil para que Settings no se sienta plano comparado con Coins/Premium */}
      <div className="absolute top-12 right-0 w-64 h-64 bg-brand-500/6 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-xl mx-auto relative">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/profile" className="text-gray-400 hover:text-white transition-colors duration-200 ease-out-expo">
            <FiArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-black gradient-text">Configuración</h1>
        </div>

        {isResettingPassword && (
          <form onSubmit={handleUpdatePassword} className="card p-4 space-y-3 mb-3 border border-brand-500/30">
            <p className="text-sm font-semibold text-white">Escribe tu nueva contraseña</p>
            <div className="relative">
              <input
                type={showNewPass ? 'text' : 'password'}
                className="input-field pr-11 w-full"
                placeholder="Nueva contraseña (mín. 6 caracteres)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowNewPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                {showNewPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
            <button type="submit" disabled={savingPass} className="btn-primary w-full">
              {savingPass ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}

        <div className="space-y-3">
          {/* Idioma */}
          <LanguageSelector />

          {/* Notificaciones push */}
          <PushNotificationsToggle />

          {/* Verificación en 2 pasos (TOTP) */}
          <TwoFactorSection />

          {/* Apariencia */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDark ? <FiMoon className="text-brand-400" size={18} /> : <FiSun className="text-yellow-400" size={18} />}
              <div>
                <p className="text-sm font-medium text-white">Modo {isDark ? 'oscuro' : 'claro'}</p>
                <p className="text-xs text-gray-500">Cambia la apariencia de la app</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-12 h-6 rounded-full transition-colors ${isDark ? 'bg-dark-600' : 'bg-brand-500'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isDark ? 'left-0.5' : 'left-6'}`} />
            </button>
          </div>

          <div className="card divide-y divide-white/5">
            <button onClick={handlePasswordReset} disabled={sendingReset} className="flex items-center gap-3 w-full p-4 text-left hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <FiLock className="text-brand-400" size={18} />
              <div>
                <p className="text-sm font-medium text-white">Cambiar contraseña</p>
                <p className="text-xs text-gray-500">{sendingReset ? 'Enviando email…' : 'Te enviaremos un email'}</p>
              </div>
            </button>
            <div className="flex items-center gap-3 p-4">
              <FiBell className="text-brand-400" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Notificaciones push</p>
                <p className="text-xs text-gray-500">Activar notificaciones del dispositivo</p>
              </div>
              <button
                onClick={handleToggleNotifications}
                disabled={togglingNotif}
                className={`w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${notifications ? 'bg-brand-500' : 'bg-dark-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${notifications ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Notification preferences */}
            <button
              onClick={() => setShowNotifPrefs(v => !v)}
              className="flex items-center gap-3 w-full p-4 text-left hover:bg-white/5 transition-colors"
            >
              <FiBell className="text-gray-500" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Tipos de notificaciones</p>
                <p className="text-xs text-gray-500">Personaliza qué notificaciones recibes</p>
              </div>
              {showNotifPrefs ? <FiChevronUp size={16} className="text-gray-500" /> : <FiChevronDown size={16} className="text-gray-500" />}
            </button>

            {showNotifPrefs && (
              <div className="border-t border-white/5 divide-y divide-white/5">
                {[
                  { key: 'matches',  label: 'Matches nuevos',       desc: 'Cuando alguien hace match contigo' },
                  { key: 'messages', label: 'Mensajes nuevos',      desc: 'Mensajes en tus conversaciones' },
                  { key: 'likes',    label: 'Likes recibidos',      desc: 'Cuando alguien te da like' },
                  { key: 'shows',    label: 'Alertas de shows',     desc: 'Shows en vivo que podrían gustarte' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center gap-3 px-4 py-3 pl-12">
                    <div className="flex-1">
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-gray-600">{desc}</p>
                    </div>
                    <button
                      onClick={() => toggleNotifPref(key)}
                      className={`w-9 h-5 rounded-full transition-colors shrink-0 ${notifPrefs[key] ? 'bg-brand-500' : 'bg-dark-600'}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full mx-0.5 transition-transform ${notifPrefs[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Link to="/premium" className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors">
              <FiShield className="text-yellow-400" size={18} />
              <div>
                <p className="text-sm font-medium text-white">Suscripción</p>
                <p className="text-xs text-gray-500">Gestiona tu plan Premium</p>
              </div>
            </Link>
          </div>

          {/* 2FA */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiShield className="text-green-400" size={16} />
                <p className="text-sm font-semibold text-white">Verificación en 2 pasos (2FA)</p>
              </div>
              {mfaFactors.some(f => f.status === 'verified') ? (
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Activo</span>
              ) : (
                <span className="text-xs text-gray-500 bg-dark-700 px-2 py-0.5 rounded-full">Inactivo</span>
              )}
            </div>
            <p className="text-xs text-gray-500">Añade una capa extra de seguridad con una app autenticadora (Google Authenticator, Authy, etc.)</p>

            {mfaFactors.some(f => f.status === 'verified') ? (
              <button
                onClick={() => handleMfaUnenroll(mfaFactors.find(f => f.status === 'verified').id)}
                disabled={mfaUnenrolling}
                className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                {mfaUnenrolling ? 'Desactivando...' : 'Desactivar 2FA'}
              </button>
            ) : mfaQr ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">Escanea con tu app autenticadora:</p>
                <img src={mfaQr.qr_code} alt="QR 2FA" className="w-36 h-36 rounded-xl bg-white p-1.5 mx-auto" data-no-invert />
                <p className="text-[10px] text-gray-600 text-center break-all">O ingresa: {mfaQr.secret}</p>
                <div className="flex gap-2">
                  <input
                    className="input-field text-sm py-2 flex-1 text-center tracking-[0.3em]"
                    placeholder="000000"
                    maxLength={6}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button onClick={handleMfaVerify} disabled={mfaVerifying || mfaCode.length !== 6}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                    {mfaVerifying ? '...' : 'Verificar'}
                  </button>
                </div>
                <button onClick={() => setMfaQr(null)} className="text-xs text-gray-600 hover:text-gray-400 w-full text-center">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={handleMfaEnroll} disabled={mfaEnrolling}
                className="btn-primary text-sm w-full py-2 disabled:opacity-50">
                {mfaEnrolling ? 'Configurando...' : 'Activar 2FA'}
              </button>
            )}
          </div>

          {/* Sección Referidos */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <FiGift className="text-brand-400" size={16} />
              <p className="text-sm font-semibold text-white">Referidos</p>
            </div>

            {referralData && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-dark-700 rounded-xl px-3 py-2">
                    <p className="text-gray-500 text-[10px] mb-0.5">Tu código</p>
                    <p className="text-brand-300 font-black text-lg tracking-widest">{referralData.code}</p>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    {codeCopied ? <FiCheck size={16} className="text-green-400" /> : <FiCopy size={16} />}
                  </button>
                </div>
                <p className="text-gray-600 text-xs">
                  {referralData.rewarded_referrals} referidos activos · {referralData.coins_earned} coins ganados
                </p>
              </>
            )}

            <div className="pt-1 border-t border-white/5">
              <p className="text-gray-500 text-xs mb-2">¿Te invitaron? Aplica su código:</p>
              <div className="flex gap-2">
                <input
                  className="input-field text-sm py-2 flex-1"
                  placeholder="Código de referido"
                  value={referralCode}
                  onChange={e => setReferralCode(e.target.value.toUpperCase())}
                  maxLength={10}
                />
                <button
                  onClick={handleApplyCode}
                  disabled={applyingCode || !referralCode.trim()}
                  className="px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40"
                >
                  {applyingCode ? '…' : 'Aplicar'}
                </button>
              </div>
            </div>
          </div>

          {/* Usuarios bloqueados */}
          <div className="card overflow-hidden">
            <button
              onClick={loadBlockedUsers}
              className="flex items-center gap-3 w-full p-4 text-left hover:bg-white/5 transition-colors"
            >
              <FiUserX className="text-brand-400" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Usuarios bloqueados</p>
                <p className="text-xs text-gray-500">{loadingBlocked ? 'Cargando…' : `${blockedUsers.length > 0 ? blockedUsers.length : '?'} bloqueados`}</p>
              </div>
              {showBlocked ? <FiChevronUp size={16} className="text-gray-500" /> : <FiChevronDown size={16} className="text-gray-500" />}
            </button>
            {showBlocked && (
              <div className="border-t border-white/5">
                {blockedUsers.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-5">Nadie bloqueado</p>
                ) : (
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {blockedUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                        <img
                          src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || 'U')}&size=60&background=1a1a2e&color=f43f5e`}
                          className="w-9 h-9 rounded-full object-cover"
                          alt=""
                        />
                        <p className="text-sm text-gray-300 flex-1">{u.full_name || 'Usuario'}</p>
                        <button
                          onClick={() => handleUnblock(u.id)}
                          disabled={unblocking === u.id}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                        >
                          {unblocking === u.id ? '…' : 'Desbloquear'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Apelaciones */}
          <div className="card overflow-hidden">
            <button
              onClick={handleLoadAppeals}
              className="flex items-center gap-3 w-full p-4 text-left hover:bg-white/5 transition-colors"
            >
              <FiShield className="text-brand-400" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Apelaciones</p>
                <p className="text-xs text-gray-500">Apelar contenido moderado</p>
              </div>
              {showAppeals ? <FiChevronUp size={16} className="text-gray-500" /> : <FiChevronDown size={16} className="text-gray-500" />}
            </button>
            {showAppeals && (
              <div className="border-t border-white/5 p-4 space-y-4">
                <div className="space-y-2">
                  <select
                    className="input-field text-sm py-2 w-full"
                    value={appealForm.content_type}
                    onChange={e => setAppealForm(f => ({ ...f, content_type: e.target.value }))}
                  >
                    <option value="post" className="bg-dark-700 text-white">Publicación</option>
                    <option value="profile" className="bg-dark-700 text-white">Perfil</option>
                    <option value="show" className="bg-dark-700 text-white">Show</option>
                    <option value="photo" className="bg-dark-700 text-white">Foto</option>
                    <option value="video" className="bg-dark-700 text-white">Video</option>
                  </select>
                  <input
                    className="input-field text-sm py-2 w-full"
                    placeholder="ID del contenido"
                    value={appealForm.content_id}
                    onChange={e => setAppealForm(f => ({ ...f, content_id: e.target.value.trim() }))}
                  />
                  <textarea
                    className="input-field text-sm py-2 w-full resize-none"
                    placeholder="Razón (mínimo 10 caracteres)"
                    rows={3}
                    value={appealForm.reason}
                    onChange={e => setAppealForm(f => ({ ...f, reason: e.target.value }))}
                  />
                  <button
                    onClick={handleSubmitAppeal}
                    disabled={submittingAppeal}
                    className="btn-primary w-full py-2 text-sm disabled:opacity-50"
                  >
                    {submittingAppeal ? 'Enviando...' : 'Enviar apelación'}
                  </button>
                </div>
                {loadingAppeals ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : appeals.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-2">Sin apelaciones aún</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {appeals.map(a => (
                      <div key={a.id} className="bg-dark-700 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400 capitalize">{a.content_type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            a.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                            a.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {a.status === 'approved' ? 'Aprobada' : a.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-white text-xs truncate">{a.reason}</p>
                        {a.admin_note && <p className="text-gray-500 text-xs mt-1 italic">{a.admin_note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ocultar estado En línea */}
          <button
            onClick={handleToggleHideOnline}
            disabled={togglingHideOnline}
            className="flex items-center gap-3 p-4 w-full text-left card hover:border-white/15 transition-colors disabled:opacity-50"
          >
            <FiWifiOff className="text-blue-400" size={18} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Ocultar estado "En línea"</p>
              <p className="text-xs text-gray-500">
                {hideOnline ? 'Nadie ve cuándo estás conectado' : 'Tu estado de conexión es visible'}
              </p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors ${hideOnline ? 'bg-brand-500' : 'bg-dark-600'}`}>
              <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform ${hideOnline ? 'translate-x-5.5' : 'translate-x-0.5'}`} style={{ transform: hideOnline ? 'translateX(22px)' : 'translateX(2px)' }} />
            </div>
          </button>

          {/* Pausar cuenta */}
          <button
            onClick={handlePauseAccount}
            disabled={pausingAccount}
            className="flex items-center gap-3 p-4 w-full text-left card hover:border-white/15 transition-colors disabled:opacity-50"
          >
            {isPaused ? <FiPlay className="text-green-400" size={18} /> : <FiPause className="text-yellow-400" size={18} />}
            <div className="flex-1">
              <p className={`text-sm font-medium ${isPaused ? 'text-green-400' : 'text-yellow-400'}`}>
                {pausingAccount ? '...' : isPaused ? 'Reactivar cuenta' : 'Pausar cuenta'}
              </p>
              <p className="text-xs text-gray-500">
                {isPaused ? 'Tu perfil está oculto. Actívalo para aparecer en el feed.' : 'Desaparece del feed temporalmente sin eliminar tu cuenta'}
              </p>
            </div>
          </button>

          {/* Modo viajando — Premium */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">✈️</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Modo viajando</p>
                <p className="text-xs text-gray-500">{travelActive ? 'Activo' : 'Match con gente de otra ciudad (Premium)'}</p>
              </div>
            </div>
            {travelActive ? (
              <button onClick={clearTravel} className="btn-secondary w-full text-xs py-2">
                Desactivar modo viajando
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input-field text-xs py-2 flex-1"
                  placeholder="Ej: Madrid, Buenos Aires..."
                  value={travelCity}
                  onChange={e => setTravelCity(e.target.value)}
                />
                <button
                  onClick={activateTravel}
                  disabled={activatingTravel || !travelCity.trim()}
                  className="btn-primary text-xs px-3 py-2 disabled:opacity-40"
                >
                  {activatingTravel ? '...' : 'Activar'}
                </button>
              </div>
            )}
          </div>

          {/* Export GDPR + Account deletion con grace period 30d */}
          <AccountDeletionSection />

          <button
            onClick={async () => {
              setLoggingOut(true);
              try { await logout(); } catch { toast.error('Error al cerrar sesión. Intenta de nuevo.'); setLoggingOut(false); }
            }}
            disabled={loggingOut}
            className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-gray-600">
          <Link to="/help" className="hover:text-brand-400 transition-colors">Centro de ayuda</Link>
          <Link to="/terms" className="hover:text-brand-400 transition-colors">Términos</Link>
          <Link to="/privacy" className="hover:text-brand-400 transition-colors">Privacidad</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-brand-400 transition-colors">{SUPPORT_EMAIL}</a>
        </div>
        <p className="text-center text-gray-700 text-xs mt-2">Destino TV v1.0.0</p>
      </div>
    </div>
  );
}

// ── Selector de idioma + Push toggle ────────────────────────────────

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage || 'es';
  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <FiGlobe className="text-blue-400 shrink-0" size={18} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{t('settings.language', 'Idioma')}</p>
          <p className="text-xs text-gray-500 truncate">{t('settings.language_hint', 'Elige el idioma de la app')}</p>
        </div>
      </div>
      <select
        value={current}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="bg-dark-700 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-brand-500/50 shrink-0"
      >
        {LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
        ))}
      </select>
    </div>
  );
}

// Toggle de notificaciones push. Verifica el permiso del browser; al activar
// dispara initPushNotifications() que registra al user con FCM/VAPID. Si el
// browser ya negó permiso, el toggle muestra cómo habilitarlo desde el OS.
function PushNotificationsToggle() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unavailable'
  );
  const [loading, setLoading] = useState(false);

  const isOn = permission === 'granted';

  const handleClick = async () => {
    if (permission === 'denied') {
      toast('Permiso bloqueado por el navegador · habilítalo desde ajustes del sistema',
        { icon: '⚙️', duration: 5000 });
      return;
    }
    if (permission === 'unavailable') {
      toast.error('Tu navegador no soporta notificaciones');
      return;
    }
    setLoading(true);
    try {
      await initPushNotifications();
      setPermission(Notification.permission);
      if (Notification.permission === 'granted') {
        toast.success('Notificaciones activadas');
      } else if (Notification.permission === 'denied') {
        toast.error('Permiso negado');
      }
    } catch {
      toast.error('Error al activar notificaciones');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className="card p-4 flex items-center justify-between gap-3 w-full text-left hover:bg-white/5 transition-colors disabled:opacity-60">
      <div className="flex items-center gap-3 min-w-0">
        {isOn ? <FiBell className="text-green-400 shrink-0" size={18} /> : <FiBellOff className="text-gray-500 shrink-0" size={18} />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Notificaciones</p>
          <p className="text-xs text-gray-500 truncate">
            {isOn
              ? 'Activadas · te avisaremos de matches, shows y mensajes'
              : permission === 'denied'
                ? 'Bloqueadas · habilita desde ajustes del sistema'
                : 'Tap para activar las notificaciones push'}
          </p>
        </div>
      </div>
      <div className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${isOn ? 'bg-brand-500' : 'bg-dark-600'}`}>
        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${isOn ? 'translate-x-5' : ''}`} />
      </div>
    </button>
  );
}

// Bloque de verificación en 2 pasos (TOTP). Tres estados:
// · idle:    muestra estado actual + botón "Activar" o "Desactivar"
// · enroll:  QR + input de 6 dígitos para activar
// · codes:   muestra los 8 backup codes una sola vez tras activar
//
// El secreto nunca se persiste en el cliente. El QR se renderiza con qrcode.react
// a partir del otpauth URI que devuelve el backend.
function TwoFactorSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // { enabled, backup_codes_remaining, last_verified_at }
  const [stage, setStage] = useState('idle'); // idle | enroll | codes
  const [enrollData, setEnrollData] = useState(null); // { secret, otpauth_uri }
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownCodes, setShownCodes] = useState(null); // codes después de activar/regenerar
  const [disableMode, setDisableMode] = useState(false); // mostrando input para desactivar

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try {
      const { data } = await api.get('/api/2fa/status');
      setStatus(data);
    } catch {
      setStatus({ enabled: false, backup_codes_remaining: 0 });
    }
  };

  const handleStartEnroll = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/2fa/enroll');
      setEnrollData(data);
      setStage('enroll');
      setToken('');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'No se pudo iniciar 2FA');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEnroll = async () => {
    if (!/^\d{6}$/.test(token)) {
      toast.error('Ingresa los 6 dígitos');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/api/2fa/verify-enroll', { token });
      setShownCodes(data.backup_codes);
      setStage('codes');
      setEnrollData(null);
      setToken('');
      await loadStatus();
      toast.success('2FA activado');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Código inválido');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!/^\d{6}$/.test(token)) {
      toast.error('Ingresa los 6 dígitos');
      return;
    }
    setBusy(true);
    try {
      await api.delete('/api/2fa', { data: { token } });
      toast.success('2FA desactivado');
      setStage('idle');
      setDisableMode(false);
      setToken('');
      await loadStatus();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'No se pudo desactivar');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenCodes = async () => {
    if (!/^\d{6}$/.test(token)) {
      toast.error('Ingresa los 6 dígitos');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/api/2fa/regenerate-backup-codes', { token });
      setShownCodes(data.backup_codes);
      setStage('codes');
      setToken('');
      await loadStatus();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'No se pudieron regenerar');
    } finally {
      setBusy(false);
    }
  };

  const copyAll = () => {
    if (!shownCodes) return;
    navigator.clipboard.writeText(shownCodes.join('\n'));
    toast.success('Códigos copiados');
  };

  if (!status) {
    return <div className="card p-4 text-sm text-gray-500">Cargando…</div>;
  }

  // Vista: códigos de respaldo (mostrar una vez)
  if (stage === 'codes' && shownCodes) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <FiShield className="text-green-400 shrink-0" size={18} />
          <p className="text-sm font-medium text-white">{t('settings.two_factor')} activado</p>
        </div>
        <p className="text-xs text-yellow-400">
          Guarda estos códigos en un lugar seguro. Cada uno funciona <b>una vez</b> si pierdes tu dispositivo.
          No los volverás a ver.
        </p>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-dark-700/50 p-3 rounded">
          {shownCodes.map(c => <div key={c} className="text-white">{c}</div>)}
        </div>
        <div className="flex gap-2">
          <button onClick={copyAll} className="btn-secondary flex-1 text-sm">
            <FiCopy className="inline mr-1" size={14} /> Copiar
          </button>
          <button onClick={() => { setShownCodes(null); setStage('idle'); }} className="btn-primary flex-1 text-sm">
            Entendido
          </button>
        </div>
      </div>
    );
  }

  // Vista: enroll en curso (QR + verificar)
  if (stage === 'enroll' && enrollData) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <FiShield className="text-brand-400 shrink-0" size={18} />
          <p className="text-sm font-medium text-white">Activar {t('settings.two_factor')}</p>
        </div>
        <p className="text-xs text-gray-400">
          Escanea el QR con Google Authenticator, Authy o 1Password y luego ingresa el código de 6 dígitos.
        </p>
        <div className="bg-white p-3 rounded mx-auto w-fit">
          <QRCodeSVG value={enrollData.otpauth_uri} size={180} />
        </div>
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">¿No puedes escanear? Ingresa el código manualmente</summary>
          <div className="mt-2 p-2 bg-dark-700 rounded font-mono break-all text-white text-[11px]">
            {enrollData.secret}
          </div>
        </details>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={token}
          onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="input-field w-full text-center font-mono tracking-widest text-lg"
        />
        <div className="flex gap-2">
          <button onClick={() => { setStage('idle'); setEnrollData(null); setToken(''); }} disabled={busy} className="btn-secondary flex-1 text-sm">
            {t('common.cancel')}
          </button>
          <button onClick={handleVerifyEnroll} disabled={busy || token.length !== 6} className="btn-primary flex-1 text-sm">
            {busy ? t('common.loading') : 'Verificar y activar'}
          </button>
        </div>
      </div>
    );
  }

  // Vista: idle (mostrar estado, ofrecer activar/desactivar)
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {status.enabled
            ? <FiShield className="text-green-400 shrink-0" size={18} />
            : <FiKey className="text-gray-500 shrink-0" size={18} />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{t('settings.two_factor')}</p>
            <p className="text-xs text-gray-500 truncate">
              {status.enabled
                ? `Activada · ${status.backup_codes_remaining} códigos de respaldo`
                : t('settings.two_factor_hint')}
            </p>
          </div>
        </div>
        {!status.enabled && (
          <button onClick={handleStartEnroll} disabled={busy} className="btn-primary text-sm shrink-0">
            {busy ? '…' : t('settings.two_factor_enable')}
          </button>
        )}
      </div>

      {status.enabled && !disableMode && (
        <div className="flex gap-2">
          <button onClick={() => { setDisableMode('regen'); setToken(''); }} className="btn-secondary flex-1 text-sm">
            Regenerar códigos
          </button>
          <button onClick={() => { setDisableMode('disable'); setToken(''); }} className="text-sm px-3 py-2 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 flex-1">
            {t('settings.two_factor_disable')}
          </button>
        </div>
      )}

      {status.enabled && disableMode && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-gray-400">
            Ingresa tu código TOTP actual para {disableMode === 'disable' ? 'desactivar 2FA' : 'regenerar los códigos de respaldo'}.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={token}
            onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="input-field w-full text-center font-mono tracking-widest"
          />
          <div className="flex gap-2">
            <button onClick={() => { setDisableMode(false); setToken(''); }} disabled={busy} className="btn-secondary flex-1 text-sm">
              {t('common.cancel')}
            </button>
            <button
              onClick={disableMode === 'disable' ? handleDisable : handleRegenCodes}
              disabled={busy || token.length !== 6}
              className={`flex-1 text-sm px-3 py-2 rounded ${disableMode === 'disable' ? 'bg-red-500 text-white' : 'btn-primary'}`}
            >
              {busy ? t('common.loading') : t('common.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
