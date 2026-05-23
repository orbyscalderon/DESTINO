import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrash2, FiLock, FiBell, FiShield, FiEye, FiEyeOff, FiGift, FiCopy, FiCheck, FiUserX, FiChevronDown, FiChevronUp, FiSun, FiMoon } from 'react-icons/fi';
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
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Destino', friendlyName: 'Authenticator' });
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
    if (!confirm('¿Seguro que quieres eliminar tu cuenta? Esta acción es irreversible y borrará todos tus datos.')) return;
    setDeletingAccount(true);
    try {
      await api.delete('/api/profiles/me');
      await logout();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar la cuenta. Inténtalo de nuevo.');
      setDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-8 lg:px-10 lg:pt-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/profile" className="text-gray-400 hover:text-white transition-colors">
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
                  { key: 'rewards',  label: 'Recompensas diarias',  desc: 'Recordatorio de recompensa diaria' },
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

          <button
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
            className="flex items-center gap-3 p-4 w-full text-left card hover:border-brand-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiTrash2 className="text-brand-500" size={18} />
            <div>
              <p className="text-sm font-medium text-brand-400">
                {deletingAccount ? 'Eliminando cuenta...' : 'Eliminar cuenta'}
              </p>
              <p className="text-xs text-gray-500">Esta acción no se puede deshacer</p>
            </div>
          </button>

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
        <p className="text-center text-gray-700 text-xs mt-2">Destino v1.0.0</p>
      </div>
    </div>
  );
}
