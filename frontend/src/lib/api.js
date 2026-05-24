import axios from 'axios';
import { supabase } from './supabase.js';

const api = axios.create({
  baseURL: import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? ''),
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
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
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`;
        return api(config);
      }
      return Promise.reject(error);
    }

    if (config.__retryCount >= 3) return Promise.reject(error);

    const shouldRetry = !error.response || status >= 500 || status === 429;
    if (!shouldRetry) return Promise.reject(error);

    config.__retryCount = (config.__retryCount || 0) + 1;
    const retryAfter = status === 429
      ? parseInt(error.response.headers['retry-after'] || '5') * 1000
      : Math.min(1000 * 2 ** (config.__retryCount - 1), 8000);

    await new Promise(r => setTimeout(r, retryAfter));
    return api(config);
  }
);

export default api;
