import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiSkipForward, FiUsers, FiUserPlus, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import { LiveKitSession } from '../../lib/livekitSession.js';
import { supabase } from '../../lib/supabase.js';
import { useAuthStore } from '../../store/authStore.js';
import { VideoEffectProcessor } from '../../lib/videoEffects.js';
import VideoEffectsButton, { loadSavedEffect, saveEffect } from './VideoEffectsButton.jsx';
import { countryByCode, languageByCode } from '../../lib/geodata.js';
import { showInterstitial } from '../../lib/admob.js';
import FlagImg from './FlagImg.jsx';

function useOnlineCount() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    const fetchCount = () => api.get('/api/video/online-count').then(({ data }) => setCount(data.count)).catch(() => {});
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);
  return count;
}

export default function VideoRoom({ genderFilter, countryFilter, videoCallsRemaining = Infinity, onLimitReached, onCallStarted }) {
  const { profile } = useAuthStore();
  const [session,       setSession]       = useState(null);
  const [status,        setStatus]        = useState('idle');
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [partner,       setPartner]       = useState(null);
  const [callDuration,  setCallDuration]  = useState(0);
  const [skipping,      setSkipping]      = useState(false);
  const [localActive,   setLocalActive]   = useState(false);
  const [partnerId,     setPartnerId]     = useState(null);
  const [friendReq,     setFriendReq]     = useState('idle'); // 'idle'|'sending'|'sent'|'done'
  const [partnerMicOff, setPartnerMicOff] = useState(false);
  const [partnerCamOff, setPartnerCamOff] = useState(false);
  const [effect, setEffectState] = useState(loadSavedEffect());
  const effectRef = useRef(null);

  const rtcRef          = useRef(null);
  const localVidRef     = useRef(null);
  const remoteVidRef    = useRef(null);
  const localStream     = useRef(null);
  const timerRef        = useRef(null);
  const interstitialRef = useRef(false);
  const activeRef       = useRef(true);
  const remoteAudioRef  = useRef(null); // bug fix: limpiar Audio() elements
  const connectedRef    = useRef(false); // bug fix: no setear timer/status 2 veces

  const onlineCount = useOnlineCount();

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      cleanup();
      clearInterval(timerRef.current);
    };
  }, []);

  // Escuchar cuando el partner termina (o si el backend cierra por timeout)
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase.channel(`video:${profile.id}`)
      .on('broadcast', { event: 'call_ended' }, () => {
        if (!activeRef.current) return;
        if (rtcRef.current) {
          setStatus('ended');
          clearInterval(timerRef.current);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const cleanup = async () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    connectedRef.current = false;
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch {}
      remoteAudioRef.current = null;
    }
    if (remoteVidRef.current) {
      try { remoteVidRef.current.srcObject = null; } catch {}
    }
    if (effectRef.current) {
      effectRef.current.stop();
      effectRef.current = null;
    }
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    setLocalActive(false);
    await rtcRef.current?.leave().catch(() => {});
    rtcRef.current = null;
  };

  // Cambia el efecto en vivo (sin reiniciar la llamada).
  // localStream.current SIEMPRE apunta al stream raw original — el processor
  // genera un track derivado que se intercambia vía replaceVideoTrack.
  const handleEffectChange = async (next) => {
    setEffectState(next);
    saveEffect(next);

    if (!rtcRef.current || !localStream.current) return;

    if (next === 'none') {
      // Apagar: republicar el video raw original
      if (effectRef.current) {
        const rawVideo = localStream.current.getVideoTracks()[0];
        if (rawVideo) {
          await rtcRef.current.replaceVideoTrack(rawVideo).catch(() => {});
          if (localVidRef.current) localVidRef.current.srcObject = localStream.current;
        }
        effectRef.current.stop();
        effectRef.current = null;
      }
      return;
    }

    // Activar/cambiar effect
    if (effectRef.current) {
      // Solo cambiar modo
      effectRef.current.setEffect(next);
    } else {
      // Crear nuevo processor con el rawStream actual (reusamos cámara)
      await applyEffectInBackground(localStream.current, next);
    }
  };

  const startCall = async (sessionData) => {
    const roomName = `video_${sessionData.sessionId.replace(/-/g, '')}`;
    if (sessionData.partner) {
      setPartner(sessionData.partner);
      if (sessionData.partner.id) setPartnerId(sessionData.partner.id);
    }

    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (!activeRef.current) { rawStream.getTracks().forEach(t => t.stop()); return; }
    localStream.current = rawStream;

    // Siempre empezamos con el stream RAW para que la llamada conecte rápido.
    // Si hay efecto activo, se aplica en background y luego replaceVideoTrack.
    setLocalActive(true);
    if (localVidRef.current) localVidRef.current.srcObject = rawStream;

    const rtc = new LiveKitSession(roomName);
    rtc.onReconnecting = () => toast.loading('Reconectando…', { id: 'rtc-reconnect' });
    rtc.onReconnected  = () => toast.success('Reconectado', { id: 'rtc-reconnect' });
    rtc.onFailed       = () => { toast.error('Se perdió la conexión'); setStatus('ended'); };

    rtc.onRemoteTrack = (track) => {
      if (!activeRef.current) return;
      if (track.kind === 'video' && remoteVidRef.current) {
        remoteVidRef.current.srcObject = new MediaStream([track.mediaStreamTrack]);
      } else if (track.kind === 'audio') {
        // Limpiar audio anterior si existe (evita leak en reconexiones)
        if (remoteAudioRef.current) {
          try { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; } catch {}
        }
        const el = new Audio();
        el.srcObject = new MediaStream([track.mediaStreamTrack]);
        el.play().catch(() => {});
        remoteAudioRef.current = el;
      }

      // Marcar conectado UNA sola vez (no por cada track)
      if (!connectedRef.current) {
        connectedRef.current = true;
        setStatus('connected');
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);

        // Host fetch partner info — solo una vez
        if (sessionData.role === 'host' && sessionData.sessionId) {
          api.get(`/api/video/session/${sessionData.sessionId}/partner`)
            .then(({ data: pd }) => {
              if (pd.partner && activeRef.current) {
                setPartner(pd.partner);
                setPartnerId(pd.partner.id);
              }
            }).catch(() => {});
        }
      }
    };

    rtc.onParticipantLeft = () => {
      if (!activeRef.current) return;
      setStatus('ended');
      clearInterval(timerRef.current);
    };

    rtc.onRemoteMuteChange = (kind, muted) => {
      if (!activeRef.current) return;
      if (kind === 'audio') setPartnerMicOff(muted);
      else if (kind === 'video') setPartnerCamOff(muted);
    };

    rtcRef.current = rtc;
    await rtc.join(true, { skipAutoMedia: true });
    await rtc.publishStream(rawStream);

    if (!sessionData.waiting) {
      setStatus('connected');
    }

    // Aplicar efecto en background si está activo (no bloquea la conexión)
    if (effect !== 'none') {
      applyEffectInBackground(rawStream, effect);
    }
  };

  // Aplica un efecto (blur/beauty) al stream actual sin bloquear la llamada.
  // Si tarda o falla, mantenemos el raw stream y avisamos al usuario.
  const applyEffectInBackground = async (rawStream, nextEffect) => {
    if (effectRef.current) {
      // Ya hay processor — solo cambia el modo
      effectRef.current.setEffect(nextEffect);
      return;
    }
    try {
      const processor = new VideoEffectProcessor();
      const processed = await processor.process(rawStream, nextEffect);
      // Verificar que seguimos en una llamada activa
      if (!activeRef.current || !rtcRef.current) { processor.stop(); return; }

      const procVideo = processed.getVideoTracks()[0];
      if (!procVideo) { processor.stop(); return; }

      // Esperar UN frame para asegurar que el canvas ya dibujó algo antes de publicar
      await new Promise(r => requestAnimationFrame(() => r()));

      effectRef.current = processor;
      await rtcRef.current.replaceVideoTrack(procVideo).catch(() => {});

      // Mostrar preview procesado localmente
      const audio = rawStream.getAudioTracks()[0];
      const previewStream = new MediaStream([procVideo, ...(audio ? [audio] : [])]);
      if (localVidRef.current) localVidRef.current.srcObject = previewStream;
    } catch (err) {
      console.warn('Effect failed in background:', err.message);
      effectRef.current?.stop();
      effectRef.current = null;
    }
  };

  const addFriend = async () => {
    if (!partnerId || friendReq !== 'idle') return;
    setFriendReq('sending');
    try {
      const { data } = await api.post('/api/video/add-friend', {
        targetUserId: partnerId,
        sessionId: session?.sessionId,
      });
      if (data.status === 'already_friends' || data.status === 'matched') {
        setFriendReq('done');
        toast.success('¡Ya son amigos! Pueden chatear 💬');
      } else {
        setFriendReq('sent');
        toast.success('Solicitud enviada');
      }
    } catch {
      setFriendReq('idle');
      toast.error('No se pudo enviar la solicitud');
    }
  };

  const findPartner = async () => {
    if (videoCallsRemaining <= 0) { onLimitReached?.(); return; }
    setStatus('searching');
    setCallDuration(0);
    setPartnerId(null);
    setFriendReq('idle');
    setPartnerMicOff(false);
    setPartnerCamOff(false);
    clearInterval(timerRef.current);
    try {
      const { data } = await api.post('/api/video/find-partner', { genderFilter, countryFilter });
      onCallStarted?.();
      setSession(data);
      setStatus(data.waiting ? 'waiting' : 'connecting');
      await startCall(data);
    } catch (err) {
      setStatus('idle');
      if (err.response?.data?.code === 'VIDEO_LIMIT_REACHED') {
        onLimitReached?.();
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Permiso de cámara/micrófono denegado');
      } else if (err.name === 'NotFoundError') {
        toast.error('No se encontró cámara o micrófono');
      } else {
        toast.error(err.response?.data?.error || 'No se pudo conectar');
      }
    }
  };

  const endCall = async (findNext = false) => {
    clearInterval(timerRef.current);
    const wasConnected = status === 'connected';
    if (session?.sessionId) {
      await api.delete('/api/video/end-session', { data: { sessionId: session.sessionId } }).catch(() => {});
    }
    await cleanup();
    setSession(null);
    setPartner(null);

    if (findNext) {
      await findPartner();
    } else {
      setStatus('idle');
      if (wasConnected && !profile?.is_premium && !interstitialRef.current) {
        interstitialRef.current = true;
        showInterstitial();
      }
      interstitialRef.current = false;
    }
  };

  const skipToNext = async () => {
    if (skipping) return;
    setSkipping(true);
    await endCall(true);
    setSkipping(false);
  };

  const toggleMic = () => { rtcRef.current?.setMic(!micOn); setMicOn(v => !v); };
  const toggleCam = () => { rtcRef.current?.setCam(!camOn); setCamOn(v => !v); };

  const fmtDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const isInCall = status === 'connected' || status === 'waiting' || status === 'searching' || status === 'connecting';

  return (
    <div className="w-full h-full bg-black rounded-2xl overflow-hidden flex flex-col">

      {/* ── Two-panel layout ── */}
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">

        {/* LEFT — local camera / idle screen */}
        <div className="relative flex-1 bg-[#111] sm:border-r border-white/5 order-first sm:order-last overflow-hidden">

          {/* Live camera feed */}
          <video
            ref={localVidRef}
            autoPlay playsInline muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${localActive ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Idle/branding overlay — shown when not in a call */}
          {!isInCall && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 space-y-5"
              style={{ background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d0d 100%)' }}
            >
              {/* Logo */}
              <div className="flex flex-col items-center gap-1 select-none">
                <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border-2 border-brand-500/40 flex items-center justify-center mb-1">
                  <span className="text-3xl">🎥</span>
                </div>
                <p className="text-white text-xl font-black tracking-tight">Destino TV</p>
                <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest">Video</p>
              </div>

              {/* Online count */}
              {onlineCount !== null && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                  <span>
                    <span className="text-white font-semibold">{onlineCount.toLocaleString()}</span>
                    {' '}usuario{onlineCount !== 1 ? 's' : ''} en línea
                  </span>
                </div>
              )}

              {/* Start button */}
              <button
                onClick={videoCallsRemaining <= 0 ? onLimitReached : findPartner}
                className={`px-10 py-3 rounded-2xl text-base font-bold transition-all shadow-lg ${
                  videoCallsRemaining <= 0
                    ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 active:scale-95 text-white shadow-brand-500/30'
                }`}
              >
                {videoCallsRemaining <= 0 ? '🔒 Límite alcanzado' : 'INICIAR'}
              </button>
            </div>
          )}

          {/* Mic/cam off indicators (in call) */}
          {localActive && (!micOn || !camOn) && (
            <div className="absolute top-3 right-3 flex gap-1.5 z-10">
              {!micOn && (
                <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-1.5">
                  <FiMicOff size={11} className="text-white" />
                </div>
              )}
              {!camOn && (
                <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-1.5">
                  <FiVideoOff size={11} className="text-white" />
                </div>
              )}
            </div>
          )}

          {/* "Tú" label */}
          {localActive && (
            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs text-white/70 z-10">
              {profile?.full_name?.split(' ')[0] || 'Tú'}
            </div>
          )}
        </div>

        {/* RIGHT — remote video / status */}
        <div className="relative flex-1 bg-[#0a0a0a] order-last sm:order-first overflow-hidden">

          {/* Remote video */}
          <video
            ref={remoteVidRef}
            autoPlay playsInline
            className="w-full h-full object-cover"
          />

          {/* Searching overlay */}
          <AnimatePresence>
            {(status === 'searching' || status === 'waiting' || status === 'connecting') && (
              <motion.div key="searching"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center bg-[#0a0a0a]"
              >
                <div className="relative flex items-center justify-center mb-5" style={{ width: 100, height: 100 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="absolute rounded-full border border-brand-500/30"
                      initial={{ width: 28, height: 28, opacity: 0.8 }}
                      animate={{ width: 100, height: 100, opacity: 0 }}
                      transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
                    />
                  ))}
                  <div className="w-10 h-10 rounded-full bg-brand-500/20 border-2 border-brand-500/50 flex items-center justify-center z-10">
                    <span className="text-xl">🎥</span>
                  </div>
                </div>
                <p className="text-white font-semibold text-base mb-1">Buscando pareja…</p>
                <p className="text-gray-600 text-xs mb-5">Conectando con alguien nuevo</p>
                <button
                  onClick={() => endCall(false)}
                  className="text-gray-500 text-xs hover:text-gray-300 underline underline-offset-2 transition-colors"
                >
                  Cancelar
                </button>
              </motion.div>
            )}

            {/* Call ended overlay */}
            {status === 'ended' && (
              <motion.div key="ended"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-[#0a0a0a]"
              >
                <p className="text-5xl mb-3">👋</p>
                <p className="text-white font-semibold text-lg mb-1">La llamada terminó</p>
                {callDuration > 0 && (
                  <p className="text-gray-500 text-sm mb-5">{fmtDuration(callDuration)}</p>
                )}
                <div className="flex gap-3 flex-wrap justify-center">
                  <button
                    onClick={findPartner}
                    className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <FiSkipForward size={14} /> Siguiente
                  </button>
                  <button
                    onClick={() => setStatus('idle')}
                    className="bg-white/10 hover:bg-white/15 text-gray-300 text-sm px-5 py-2.5 rounded-xl transition-colors"
                  >
                    Volver
                  </button>
                </div>
              </motion.div>
            )}

            {/* Idle right panel message */}
            {status === 'idle' && (
              <motion.div key="idle-right"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]"
              >
                <p className="text-gray-600 text-sm text-center px-8 leading-relaxed">
                  Presiona <span className="text-white font-semibold">INICIAR</span> para conectar<br />con alguien nuevo
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Partner cam OFF — overlay tipo "videocámara apagada" */}
          {status === 'connected' && partnerCamOff && (
            <div className="absolute inset-0 bg-dark-900/95 flex flex-col items-center justify-center z-20">
              <div className="w-20 h-20 rounded-full bg-dark-700 flex items-center justify-center mb-3">
                <FiVideoOff size={32} className="text-gray-500" />
              </div>
              <p className="text-white text-sm font-semibold">Pareja apagó la cámara</p>
            </div>
          )}

          {/* Partner mic OFF — chip pequeño arriba */}
          {status === 'connected' && partnerMicOff && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-red-500/90 backdrop-blur-sm rounded-full px-3 py-1.5">
              <FiMicOff size={11} className="text-white" />
              <span className="text-[10px] text-white font-bold uppercase tracking-wide">Pareja muteada</span>
            </div>
          )}

          {/* Partner country / language badge */}
          {status === 'connected' && partner && (partner.country || partner.language) && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl z-10">
              {partner.country && (
                <>
                  <FlagImg code={partner.country} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />
                  <span className="text-xs text-white font-medium">{countryByCode(partner.country)?.name || partner.country}</span>
                </>
              )}
              {partner.language && (
                <span className="text-xs text-white/50 border-l border-white/20 pl-1.5">
                  {languageByCode(partner.language)?.name || partner.language}
                </span>
              )}
            </div>
          )}

          {/* Duration */}
          {status === 'connected' && callDuration > 0 && (
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl z-10">
              <p className="text-green-400 text-xs font-mono font-bold">{fmtDuration(callDuration)}</p>
            </div>
          )}

          {/* "Pareja" label */}
          {status === 'connected' && (
            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs text-white/50 z-10">
              Pareja
            </div>
          )}
        </div>
      </div>

      {/* ── Controls bar (only during active call) ── */}
      {(status === 'connected' || status === 'waiting') && (
        <div className="flex justify-center items-center gap-4 py-3 bg-black/80 backdrop-blur-md shrink-0 border-t border-white/5">
          <button
            onClick={toggleMic}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/90 text-white'
            }`}
          >
            {micOn ? <FiMic size={18} /> : <FiMicOff size={18} />}
          </button>

          <button
            onClick={skipToNext}
            disabled={skipping}
            title="Siguiente persona"
            className="w-11 h-11 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30 flex items-center justify-center transition-all disabled:opacity-40"
          >
            {skipping
              ? <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              : <FiSkipForward size={18} />
            }
          </button>

          <button
            onClick={() => endCall(false)}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/40 transition-colors"
          >
            <FiPhoneOff size={20} />
          </button>

          {/* Agregar amigo */}
          {partnerId && (
            <button
              onClick={addFriend}
              disabled={friendReq !== 'idle'}
              title={friendReq === 'sent' ? 'Solicitud enviada' : friendReq === 'done' ? 'Ya son amigos' : 'Agregar amigo'}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                friendReq === 'sent' || friendReq === 'done'
                  ? 'bg-green-500/20 border border-green-500/40 text-green-400 cursor-default'
                  : friendReq === 'sending'
                  ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300 opacity-60 cursor-default'
                  : 'bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30'
              }`}
            >
              {friendReq === 'sent' || friendReq === 'done'
                ? <FiCheck size={18} />
                : friendReq === 'sending'
                ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <FiUserPlus size={18} />
              }
            </button>
          )}

          <button
            onClick={toggleCam}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/90 text-white'
            }`}
          >
            {camOn ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
          </button>

          <VideoEffectsButton value={effect} onChange={handleEffectChange} />
        </div>
      )}
    </div>
  );
}
