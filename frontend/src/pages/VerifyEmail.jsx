import { useState } from 'react';
import { FiMail, FiRefreshCw, FiLogOut } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import { supabase } from '../lib/supabase.js';
import toast from 'react-hot-toast';

export default function VerifyEmail() {
  const { user, signOut } = useAuthStore();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user?.email,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Email de verificación enviado');
    } catch (err) {
      toast.error(err.message || 'Error al enviar el email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto">
          <FiMail className="w-10 h-10 text-brand-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Verifica tu email</h1>
          <p className="text-gray-400">
            Enviamos un enlace de verificación a{' '}
            <span className="text-white font-medium">{user?.email}</span>.
            Ábrelo para continuar.
          </p>
        </div>

        <div className="bg-dark-800 rounded-xl p-4 text-left space-y-2">
          <p className="text-sm text-gray-400">¿No lo encuentras?</p>
          <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
            <li>Revisa la carpeta de spam o correo no deseado</li>
            <li>Asegúrate de que el email sea correcto</li>
            <li>Puede tardar unos minutos en llegar</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={sending || sent}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <FiRefreshCw className={sending ? 'animate-spin' : ''} />
            {sent ? 'Email enviado' : sending ? 'Enviando...' : 'Reenviar email'}
          </button>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-white py-2 transition-colors"
          >
            <FiLogOut />
            Cambiar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
