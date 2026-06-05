import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff } from 'react-icons/fi';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import { signInWithGoogle, signInWithApple } from '../lib/oauth.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(form) {
  const errs = {};
  if (!form.fullName.trim()) errs.fullName = 'El nombre es requerido';
  if (!EMAIL_RE.test(form.email)) errs.email = 'Ingresa un email válido';
  if (form.password.length < 6) errs.password = 'Mínimo 6 caracteres';
  return errs;
}

export default function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setForm(f => ({ ...f, [field]: val }));
    if (errors[field]) setErrors(errs => { const n = { ...errs }; delete n[field]; return n; });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // Verificar Turnstile si está configurado
    if (TURNSTILE_KEY) {
      if (!turnstileToken) {
        toast.error('Completa la verificación de seguridad');
        return;
      }
      try {
        await api.post('/auth/verify-turnstile', { token: turnstileToken });
      } catch {
        toast.error('Verificación de seguridad fallida. Intenta de nuevo.');
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.fullName },
          emailRedirectTo: `${window.location.origin}/#/auth/callback`,
        },
      });

      if (error) throw error;

      // Enviar email de bienvenida (fire-and-forget)
      api.post('/auth/welcome-email', {
        email: form.email,
        name: form.fullName,
      }).catch(() => {});

      if (data.session) {
        toast.success('¡Cuenta creada! Completa tu perfil.');
        navigate('/onboarding');
      } else {
        toast.success('¡Cuenta creada! Revisa tu email para confirmar tu cuenta.');
        navigate('/login');
      }
    } catch (err) {
      toast.error(err.message || 'Error al crear cuenta');
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      toast.error('No se pudo conectar con Google. Intenta de nuevo.');
      setGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch {
      toast.error('No se pudo conectar con Apple. Intenta de nuevo.');
      setAppleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-dark-900">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">💕</div>
          <h1 className="text-3xl font-black gradient-text">{t('auth.create_account')}</h1>
          <p className="text-gray-400 text-sm mt-2">{t('auth.free_forever')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                className={`input-field pl-11 ${errors.fullName ? 'border-red-500' : ''}`}
                placeholder={t('auth.full_name')}
                value={form.fullName}
                onChange={handleChange('fullName')}
              />
            </div>
            {errors.fullName && <p className="text-red-400 text-xs mt-1 pl-1">{errors.fullName}</p>}
          </div>
          <div>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                className={`input-field pl-11 ${errors.email ? 'border-red-500' : ''}`}
                type="email"
                placeholder={t('auth.email')}
                value={form.email}
                onChange={handleChange('email')}
              />
            </div>
            {errors.email && <p className="text-red-400 text-xs mt-1 pl-1">{errors.email}</p>}
          </div>
          <div>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                className={`input-field pl-11 pr-11 ${errors.password ? 'border-red-500' : ''}`}
                type={showPass ? 'text' : 'password'}
                placeholder={t('auth.password')}
                value={form.password}
                onChange={handleChange('password')}
              />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-red-400 text-xs mt-1 pl-1">{errors.password}</p>}
          </div>

          {TURNSTILE_KEY && (
            <div className="flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_KEY}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: 'dark', language: i18n.resolvedLanguage || 'es' }}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('auth.creating') : t('auth.create')}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-500 uppercase bg-dark-900 px-3">{t('auth.or')}</div>
        </div>

        <button onClick={handleGoogle} disabled={googleLoading || appleLoading} className="btn-secondary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
          <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
          {googleLoading ? t('common.loading') : t('auth.continue_with_google')}
        </button>

        <button
          onClick={handleApple}
          disabled={googleLoading || appleLoading}
          className="bg-black hover:bg-gray-900 text-white border border-white/10 w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t('auth.continue_with_apple')}
        >
          <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
            <path d="M11.624 8.5c-.018-1.852 1.515-2.74 1.585-2.785-.864-1.263-2.21-1.436-2.69-1.456-1.146-.116-2.236.674-2.817.674-.58 0-1.479-.658-2.434-.64-1.252.018-2.408.728-3.052 1.85-1.302 2.257-.333 5.6.937 7.435.618.898 1.354 1.906 2.319 1.87.93-.038 1.282-.604 2.408-.604 1.124 0 1.444.604 2.427.587 1.003-.018 1.638-.917 2.252-1.819.71-1.045.998-2.061 1.016-2.114-.022-.011-1.951-.749-1.97-2.973zM9.795 2.92c.514-.622.86-1.486.764-2.345-.738.03-1.634.491-2.166 1.112-.476.55-.892 1.43-.78 2.273.823.063 1.668-.418 2.182-1.04z" />
          </svg>
          {appleLoading ? t('common.loading') : t('auth.continue_with_apple')}
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          {t('auth.already_have_account')}{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            {t('auth.login_action')}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
