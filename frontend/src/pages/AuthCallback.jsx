import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import toast from 'react-hot-toast';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let done = false;

    const redirectByProfile = async (session) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single();
      navigate(profile?.username ? '/home' : '/onboarding', { replace: true });
    };

    const finish = async (session, type) => {
      if (done) return;
      done = true;
      if (session.user?.recovery_sent_at || type === 'recovery') {
        navigate('/settings?reset=true', { replace: true });
      } else {
        await redirectByProfile(session);
      }
    };

    const handleCallback = async () => {
      // Con HashRouter, Supabase puede devolver el código en dos lugares:
      //   · location.search  → dentro del hash:  /#/auth/callback?code=xxx
      //   · window.location.search → antes del hash: /?code=xxx#/auth/callback
      const hashParams = new URLSearchParams(location.search);
      const urlParams  = new URLSearchParams(window.location.search);
      const get = (key) => hashParams.get(key) ?? urlParams.get(key);

      const error = get('error');
      if (error) {
        toast.error((get('error_description') || error).replace(/\+/g, ' '));
        navigate('/login', { replace: true });
        return;
      }

      const code = get('code');
      const type = get('type');

      if (code) {
        // Verificar si la sesión ya fue establecida antes de intercambiar el código.
        // React StrictMode ejecuta los efectos dos veces en desarrollo; sin esta
        // comprobación, la segunda ejecución consume el code verifier ya usado y falla.
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user) {
          await finish(existing, type);
          return;
        }

        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // Puede que una ejecución concurrente ya estableció la sesión
          const { data: { session: concurrent } } = await supabase.auth.getSession();
          if (concurrent?.user) {
            await finish(concurrent, type);
            return;
          }
          console.error('[AuthCallback] error:', exchangeError.message);
          toast.error('No se pudo iniciar sesión. Intenta de nuevo.');
          navigate('/login', { replace: true });
          return;
        }
        if (data.session) {
          await finish(data.session, type);
          return;
        }
      }

      // Sin código: sesión activa o confirmación de email ya procesada
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await finish(session, type);
      } else {
        toast.error('No se pudo establecer la sesión. Intenta de nuevo.');
        navigate('/login', { replace: true });
      }
    };

    handleCallback();
  }, [navigate, location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Verificando cuenta...</p>
      </div>
    </div>
  );
}
