import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Ingresa tu email');

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/#/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err.message || 'Error al enviar el email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-green-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
        <div className="max-w-md w-full text-center space-y-6 relative z-10">
          <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/30 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(34,197,94,0.4)]">
            <FiCheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">{t('auth.reset_link_sent')}</h1>
            <p className="text-gray-400">
              <span className="text-white font-medium">{email}</span>
            </p>
          </div>
          <p className="text-sm text-gray-500">
            <button
              onClick={() => setSent(false)}
              className="text-brand-400 hover:text-brand-300 hover:underline transition-colors"
            >
              {t('common.retry')}
            </button>
          </p>
          <Link to="/login" className="block text-gray-400 hover:text-white transition-colors">
            ← {t('auth.login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-brand-500/20 border-2 border-brand-500/30 rounded-full flex items-center justify-center mx-auto shadow-glow-sm">
            <FiMail className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t('auth.forgot_password')}</h1>
          <p className="text-gray-400 text-sm">{t('auth.reset_password')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full shadow-glow hover:shadow-glow-lg"
          >
            {loading ? t('common.loading') : t('auth.send_reset_link')}
          </button>
        </form>

        <Link
          to="/login"
          className="flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <FiArrowLeft />
          {t('auth.login')}
        </Link>
      </div>
    </div>
  );
}
