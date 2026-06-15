import axios from 'axios';

const SESSION_KEY = 'enc_session_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4100',
});

// Inyectar Authorization en cada request si hay token
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Detectar 401 — limpiar sesión local
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      try { localStorage.removeItem(SESSION_KEY); } catch {}
    }
    return Promise.reject(err);
  }
);

export function setSession(token) {
  try { localStorage.setItem(SESSION_KEY, token); } catch {}
}
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
export function hasSession() {
  try { return !!localStorage.getItem(SESSION_KEY); } catch { return false; }
}
