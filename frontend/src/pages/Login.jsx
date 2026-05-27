import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { Turnstile } from '@marsidev/react-turnstile';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

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
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;
      navigate('/home');
    } catch (err) {
      if (err.message?.toLowerCase().includes('email not confirmed')) {
        toast.error('Debes confirmar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.');
      } else if (err.message?.toLowerCase().includes('invalid login credentials')) {
        toast.error('Email o contraseña incorrectos');
      } else {
        toast.error(err.message || 'Error al iniciar sesión');
      }
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
          <h1 className="text-3xl font-black gradient-text">Bienvenido</h1>
          <p className="text-gray-400 text-sm mt-2">Tu destino te espera</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              className="input-field pl-11"
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div className="relative">
            <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              className="input-field pl-11 pr-11"
              type={showPass ? 'text' : 'password'}
              placeholder="Contraseña"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
            <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
              {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
            </button>
          </div>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-brand-400 hover:text-brand-300">
              ¿Olvidaste tu contraseña?
            </Link>
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
            {loading ? 'Entrando...' : 'Iniciar sesión'}
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
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">
            Regístrate gratis
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
