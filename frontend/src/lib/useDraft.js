import { useEffect, useRef, useState } from 'react';
import api from './api.js';

// Hook que persiste un draft localmente (instantáneo) y al servidor (durable).
// Uso:
//   const [text, setText, { saving, clear }] = useDraft('post', '');
//   <textarea value={text} onChange={e => setText(e.target.value)} />
//   onSubmit: () => { await api.post('/api/posts', {text}); clear(); }
export function useDraft(key, initial = '', opts = {}) {
  const localKey = `draft:${key}`;
  const debounceMs = opts.debounce ?? 1500;
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(localKey) ?? initial; } catch { return initial; }
  });
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  // Hidrata desde servidor al montar
  useEffect(() => {
    let cancelled = false;
    api.get(`/api/drafts?key=${encodeURIComponent(key)}`).then(r => {
      if (cancelled) return;
      const remote = r.data?.drafts?.[0]?.content;
      // Si el server tiene algo y el local está vacío, hidratar
      if (remote && !value) setValue(remote);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // Persiste local inmediato + remoto con debounce
  useEffect(() => {
    try { localStorage.setItem(localKey, value); } catch {}
    clearTimeout(timerRef.current);
    if (!value) return;
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.put('/api/drafts', { draft_key: key, content: value });
      } catch {} finally {
        setSaving(false);
      }
    }, debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [value]); // eslint-disable-line

  const clear = async () => {
    setValue('');
    try { localStorage.removeItem(localKey); } catch {}
    try { await api.delete(`/api/drafts/${encodeURIComponent(key)}`); } catch {}
  };

  return [value, setValue, { saving, clear }];
}
