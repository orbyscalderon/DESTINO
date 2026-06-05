import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const AFF_STORAGE_KEY = 'destino-pending-affiliate';

// Consume el code de affiliate pendiente (si lo había). Llamado tras el login
// exitoso vía OAuth o email confirmation — los flows donde el user salió del
// browser entre Register.jsx y aquí. Errores ignorados — no rompen el flujo.
async function consumePendingAffiliate() {
  try {
    const code = localStorage.getItem(AFF_STORAGE_KEY);
    if (!code) return;
    await api.post('/api/affiliate/attribute', { code });
    localStorage.removeItem(AFF_STORAGE_KEY);
  } catch {
    // Code inválido / ya atribuido / no es creator todavía — limpiamos igual
    // para no reintentar infinitamente en cada login.
    try { localStorage.removeItem(AFF_STORAGE_KEY); } catch {}
  }
}

async function redirectByProfile(userId, type, navigate) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();

  // Atribuir affiliate antes del redirect (fire-and-forget, no bloqueante).
  consumePendingAffiliate();

  if (type === 'recovery') {
    navigate('/settings?reset=true', { replace: true });
  } else {
    navigate(profile?.username ? '/home' : '/onboarding', { replace: true });
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const doneRef = useRef(false);

  useEffect(() => {
    // detectSessionInUrl: true — Supabase already processed (or is processing) the URL.
    // We just need to wait for the SIGNED_IN event or check for an existing session.

    const params = new URLSearchParams(location.search);
    const urlParams = new URLSearchParams(window.location.search);
    const type = params.get('type') ?? urlParams.get('type');

    const finish = async (session) => {
      if (doneRef.current) return;
      doneRef.current = true;
      await redirectByProfile(session.user.id, type, navigate);
    };

    // 1. Check if session is already available (Supabase may have auto-processed the URL)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) finish(session);
    });

    // 2. Listen for sign-in event (fires when Supabase finishes processing the callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        finish(session);
      }
    });

    // 3. Check for explicit errors in the URL
    const error = params.get('error') ?? urlParams.get('error');
    if (error) {
      const desc = params.get('error_description') ?? urlParams.get('error_description') ?? error;
      toast.error(desc.replace(/\+/g, ' '));
      navigate('/login', { replace: true });
    }

    // 4. Timeout fallback — if nothing happens in 12s, abort
    const timeout = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        toast.error('No se pudo iniciar sesión. Intenta de nuevo.');
        navigate('/login', { replace: true });
      }
    }, 12000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
