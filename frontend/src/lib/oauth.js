import { supabase } from './supabase.js';

// ────────────────────────────────────────────────────────────────────────────
// OAuth helper que funciona tanto en web como en Capacitor (Android/iOS).
//
// Web: Supabase redirige al `${origin}/#/auth/callback` y el browser
//      lo procesa normalmente (la sesión se restaura desde el URL hash).
//
// Capacitor nativo: Supabase redirige a `com.destino.app://auth/callback`,
//      Android abre la app (gracias al intent-filter del AndroidManifest),
//      el listener `App.addListener('appUrlOpen')` recibe el URL completo,
//      y llamamos `supabase.auth.setSession()` con los tokens del fragment.
//
// El scheme `com.destino.app` debe estar también registrado en:
//   • Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
//     Agregar: `com.destino.app://auth/callback`
//   • Google Cloud Console → OAuth client: el redirect URI sigue siendo el
//     de Supabase (`https://hdanhncalsbouedeodcm.supabase.co/auth/v1/callback`).
//     Supabase intercambia el code y luego nos redirige a nuestro scheme.
// ────────────────────────────────────────────────────────────────────────────

export function isCapacitorNative() {
  // Capacitor inyecta window.Capacitor.isNativePlatform()
  return typeof window !== 'undefined'
      && !!window.Capacitor
      && window.Capacitor.isNativePlatform?.() === true;
}

const NATIVE_REDIRECT = 'com.destino.app://auth/callback';

// Internal: factoriza el flow para cualquier provider (google, apple).
async function signInWithOAuth(provider) {
  const isNative = isCapacitorNative();
  const redirectTo = isNative
    ? NATIVE_REDIRECT
    : `${window.location.origin}/#/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: isNative,
    },
  });

  if (error) throw error;

  if (isNative && data?.url) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
    } catch {
      window.open(data.url, '_system');
    }
  }
}

export const signInWithGoogle = () => signInWithOAuth('google');

// Apple Sign-In. Apple exige este botón en iOS App Store si ofrecemos otros
// OAuth (Google, etc.). En web también funciona, pero requiere Apple
// Developer + Services ID + Key configurados en Supabase Auth → Providers.
export const signInWithApple = () => signInWithOAuth('apple');

// Procesa un deep link recibido por appUrlOpen y restaura la sesión.
// Soporta los dos formatos comunes que Supabase puede devolver:
//   1) Fragment con access_token + refresh_token (implicit flow)
//   2) Query con ?code= (PKCE flow) → exchangeCodeForSession
export async function handleAuthDeepLink(rawUrl) {
  if (!rawUrl) return { ok: false, reason: 'no_url' };
  try {
    const url = new URL(rawUrl);
    // Caso 1: fragment con access_token (Supabase implicit)
    const frag = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const accessToken = frag.get('access_token');
    const refreshToken = frag.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { ok: false, reason: 'set_session_failed', error };
      return { ok: true, method: 'implicit' };
    }
    // Caso 2: code en query (PKCE)
    const code = url.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, reason: 'exchange_failed', error };
      return { ok: true, method: 'pkce' };
    }
    return { ok: false, reason: 'no_tokens_in_url' };
  } catch (err) {
    return { ok: false, reason: 'parse_error', error: err };
  }
}
