import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff } from 'react-icons/fi';
import { Turnstile } from '@marsidev/react-turnstile';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
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

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/#/auth/callback` },
    });
    if (error) {
      toast.error('No se pudo conectar con Google. Intenta de nuevo.');
      setGoogleLoading(false);
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
          <h1 className="text-3xl font-black gradient-text">Crea tu cuenta</h1>
          <p className="text-gray-400 text-sm mt-2">Gratis para siempre</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                className={`input-field pl-11 ${errors.fullName ? 'border-red-500' : ''}`}
                placeholder="Nombre completo"
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
                placeholder="Email"
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
                placeholder="Contraseña"
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
                options={{ theme: 'dark', language: 'es' }}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-500 uppercase bg-dark-900 px-3">o</div>
        </div>

        <button onClick={handleGoogle} disabled={googleLoading} className="btn-secondary w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
          <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
          {googleLoading ? 'Redirigiendo…' : 'Continuar con Google'}
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Inicia sesión
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
