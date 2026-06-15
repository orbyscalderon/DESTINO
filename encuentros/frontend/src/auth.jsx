import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, hasSession, clearSession } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [publisher, setPublisher] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!hasSession()) {
      setPublisher(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/api/auth/me');
      setPublisher(data.publisher);
    } catch {
      setPublisher(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch {}
    clearSession();
    setPublisher(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ publisher, loading, refresh, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
