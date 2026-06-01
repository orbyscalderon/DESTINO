import axios from 'axios';
import { supabase } from './supabase.js';

const api = axios.create({
  baseURL: import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? ''),
});

// Cache del access_token en memoria. Antes cada request llamaba
// supabase.auth.getSession() — con 9 requests simultáneos al abrir un perfil
// eran 9 round-trips a Supabase auth solo para leer el token.
// Ahora lo guardamos en memoria y nos suscribimos a onAuthStateChange para
// invalidarlo cuando cambia (login, logout, refresh).
let cachedToken = null;
let cachedExpiresAt = 0;

async function getToken() {
  // Si tenemos token cacheado y le quedan > 60s, usarlo.
  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) {
    return cachedToken;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    cachedToken = session.access_token;
    // expires_at viene en segundos epoch (puede ser null en algunos flujos)
    cachedExpiresAt = (session.expires_at || (Date.now() / 1000 + 3600)) * 1000;
    return cachedToken;
  }
  cachedToken = null;
  cachedExpiresAt = 0;
  return null;
}

// Invalidar cache cuando Supabase actualiza sesión
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    cachedToken = null;
    cachedExpiresAt = 0;
  } else if (session?.access_token) {
    cachedToken = session.access_token;
    cachedExpiresAt = (session.expires_at || (Date.now() / 1000 + 3600)) * 1000;
  }
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Retry on network errors, 5xx, 429, or 401 (token expired — refresh and retry once)
api.interceptors.response.use(
  res => res,
  async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    const status = error.response?.status;

    // On 401: force session refresh and retry once
    if (status === 401 && !config.__retried401) {
      config.__retried401 = true;
      // Invalidar cache para forzar refresh
      cachedToken = null;
      cachedExpiresAt = 0;
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) {
        cachedToken = data.session.access_token;
        cachedExpiresAt = (data.session.expires_at || (Date.now() / 1000 + 3600)) * 1000;
        config.headers.Authorization = `Bearer ${cachedToken}`;
        return api(config);
      }
      return Promise.reject(error);
    }

    if (config.__retryCount >= 2) return Promise.reject(error);

    // NO reintentar 429 — antes lo hacíamos pero solo escalaba el problema:
    // cada request en 429 disparaba 3 retries más, cuadruplicando el load.
    // Espiral de muerte. El cliente debe esperar a que el limit window se
    // resetee (15 min) sin bombardear al backend.
    const shouldRetry = !error.response || status >= 500;
    if (!shouldRetry) return Promise.reject(error);

    config.__retryCount = (config.__retryCount || 0) + 1;
    const retryAfter = Math.min(1000 * 2 ** (config.__retryCount - 1), 4000);

    await new Promise(r => setTimeout(r, retryAfter));
    return api(config);
  }
);

export default api;
