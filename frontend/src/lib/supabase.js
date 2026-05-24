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
      storage: dualStorage,
    },
  }
);
