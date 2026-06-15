import { createClient } from '@supabase/supabase-js';

// Escribe en localStorage Y sessionStorage.
// El sessionStorage sobrevive la redirección OAuth dentro del mismo tab,
// así que si el cliente Supabase borra el code verifier de localStorage
// durante su inicialización, sessionStorage sirve de respaldo.
const dualStorage = {
  getItem: (key) => {
    const v = localStorage.getItem(key);
    return v !== null ? v : sessionStorage.getItem(key);
  },
  setItem: (key, value) => {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      // Refresh tokens lifecycle:
      //   - autoRefreshToken: el SDK refresca el access_token automáticamente
      //     ~10 min antes de su expiry (default 1 h, configurar en Supabase
      //     Dashboard > Settings > Auth > JWT expiry, recomendado: 3600 sec).
      //   - persistSession: mantiene la sesión entre reloads vía dualStorage.
      //   - Refresh tokens propios de Supabase tienen rotación habilitada
      //     por defecto (Dashboard > Settings > Auth > Refresh token rotation).
      //     Si un atacante intercepta uno usado, el siguiente refresh fallará
      //     y se invalida la sesión. NO desactivar.
      //   - Reuse interval: dejar en 10 segundos (default) para tolerar
      //     condiciones de carrera al refrescar desde varias pestañas.
      autoRefreshToken: true,
      persistSession: true,
      storage: dualStorage,
    },
  }
);
