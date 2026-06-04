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

export async function signInWithGoogle() {
  const isNative = isCapacitorNative();
  const redirectTo = isNative
    ? NATIVE_REDIRECT
    : `${window.location.origin}/#/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // En nativo abrimos el browser del sistema y dejamos que el OS dirija
      // el deep link de vuelta a la app. `skipBrowserRedirect: true` evita
      // que Supabase haga el window.location.href que falla en WebView.
      skipBrowserRedirect: isNative,
    },
  });

  if (error) throw error;

  if (isNative && data?.url) {
    // Abrir el URL de Google en el browser del sistema. Tras autorizar,
    // Google → Supabase → nuestro scheme → AndroidManifest → MainActivity
    // → appUrlOpen listener (mounted en App.jsx).
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
    } catch {
      // Fallback: si @capacitor/browser no está disponible, abrir como link
      window.open(data.url, '_system');
    }
  }
  // En web, Supabase ya hizo el redirect — no hay que hacer nada más.
}

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
