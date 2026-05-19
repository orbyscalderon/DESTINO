import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrash2, FiLock, FiBell, FiShield, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import { initPushNotifications } from '../lib/pushNotifications.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';

export default function Settings() {
  const { logout } = useAuthStore();
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
                <p className="text-sm font-medium text-white">Notificaciones</p>
                <p className="text-xs text-gray-500">Matches y mensajes</p>
              </div>
              <button
                onClick={handleToggleNotifications}
                disabled={togglingNotif}
                className={`w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${notifications ? 'bg-brand-500' : 'bg-dark-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${notifications ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <Link to="/premium" className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors">
              <FiShield className="text-yellow-400" size={18} />
              <div>
                <p className="text-sm font-medium text-white">Suscripción</p>
                <p className="text-xs text-gray-500">Gestiona tu plan Premium</p>
              </div>
            </Link>
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

        <p className="text-center text-gray-600 text-xs mt-8">Destino v1.0.0 · {SUPPORT_EMAIL}</p>
      </div>
    </div>
  );
}
