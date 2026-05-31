// Live captions: speech-to-text del HOST → broadcast Supabase → viewers.
// Solo browsers con SpeechRecognition (Chrome/Edge/Samsung Internet).
//
// Modelo:
//   - useCaptionsHost(showId, lang, enabled): capta voz, emite chunks
//   - useCaptionsViewer(showId): suscribe a chunks, devuelve array de captions

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase.js';

const SpeechRec = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;

export const captionsSupported = !!SpeechRec;

// --- HOST ---------------------------------------------------------
export function useCaptionsHost(showId, lang = 'es-ES', enabled = false) {
  const recRef = useRef(null);
  const channelRef = useRef(null);
  const stoppedByUserRef = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!showId) return;
    channelRef.current = supabase.channel(`captions:${showId}`);
    channelRef.current.subscribe();
    return () => { supabase.removeChannel(channelRef.current); };
  }, [showId]);

  useEffect(() => {
    if (!showId || !enabled || !SpeechRec) {
      stop();
      return;
    }
    start();
    return () => stop();
  }, [showId, enabled, lang]); // eslint-disable-line

  const broadcastCaption = useCallback((text, isFinal) => {
    channelRef.current?.send({
      type: 'broadcast', event: 'caption',
      payload: { text, isFinal, lang, ts: Date.now() },
    }).catch(() => {});
  }, [lang]);

  const start = () => {
    if (recRef.current) return;
    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang || 'es-ES';
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          const text = (r[0]?.transcript || '').trim();
          if (text) broadcastCaption(text, r.isFinal);
        }
      };
      rec.onerror = () => { /* network / no-speech / etc — manejado por onend */ };
      rec.onend = () => {
        // Restart automático si no fue parado por el usuario
        if (!stoppedByUserRef.current) {
          try { rec.start(); } catch {}
        }
      };
      rec.start();
      recRef.current = rec;
      stoppedByUserRef.current = false;
      setActive(true);
    } catch (err) {
      console.warn('Captions start failed:', err.message);
      setActive(false);
    }
  };

  const stop = () => {
    stoppedByUserRef.current = true;
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    setActive(false);
  };

  return { active, start, stop };
}

// --- VIEWER -------------------------------------------------------
export function useCaptionsViewer(showId, { maxLines = 2, displayMs = 8000 } = {}) {
  const [captions, setCaptions] = useState([]);
  // captions: [{ id, text, isFinal, ts }]

  useEffect(() => {
    if (!showId) return;
    const ch = supabase.channel(`captions:${showId}`)
      .on('broadcast', { event: 'caption' }, ({ payload }) => {
        if (!payload?.text) return;
        const isFinal = !!payload.isFinal;
        setCaptions(prev => {
          // Si la última no es final y la nueva tampoco → reemplazar (interim)
          if (prev.length > 0 && !prev[prev.length - 1].isFinal && !isFinal) {
            return [...prev.slice(0, -1), { id: Date.now(), text: payload.text, isFinal, ts: Date.now() }];
          }
          // Si la última no es final y esta SÍ es final → reemplazar
          if (prev.length > 0 && !prev[prev.length - 1].isFinal && isFinal) {
            return [...prev.slice(0, -1), { id: Date.now(), text: payload.text, isFinal, ts: Date.now() }];
          }
          // Caso normal: append
          const next = [...prev, { id: Date.now(), text: payload.text, isFinal, ts: Date.now() }];
          return next.slice(-maxLines);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [showId, maxLines]);

  // Auto-fade: remover captions más viejos que displayMs
  useEffect(() => {
    const t = setInterval(() => {
      setCaptions(prev => prev.filter(c => Date.now() - c.ts < displayMs));
    }, 1000);
    return () => clearInterval(t);
  }, [displayMs]);

  return captions;
}
