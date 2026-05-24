import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiSkipForward, FiUsers } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import { RtcSession } from '../../lib/mediasoupClient.js';
import { supabase } from '../../lib/supabase.js';
import { useAuthStore } from '../../store/authStore.js';
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
  const { user, profile } = useAuthStore();
  const [session,       setSession]       = useState(null);
  const [status,        setStatus]        = useState('idle');
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [partner,       setPartner]       = useState(null);
  const [callDuration,  setCallDuration]  = useState(0);
  const [skipping,      setSkipping]      = useState(false);
  const [localActive,   setLocalActive]   = useState(false);

  const rtcRef          = useRef(null);
  const localVidRef     = useRef(null);
  const remoteVidRef    = useRef(null);
  const localStream     = useRef(null);
  const timerRef        = useRef(null);
  const roomChRef       = useRef(null);
  const interstitialRef = useRef(false);
  const activeRef       = useRef(true);

  const onlineCount = useOnlineCount();

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      cleanup();
      clearInterval(timerRef.current);
    };
  }, []);

  const cleanup = async () => {
    clearInterval(timerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    setLocalActive(false);
    await rtcRef.current?.leave().catch(() => {});
    rtcRef.current = null;
    supabase.removeChannel(roomChRef.current).catch(() => {});
    roomChRef.current = null;
  };

  const attachRemoteTracks = (tracks) => {
    if (tracks.video && remoteVidRef.current) {
      remoteVidRef.current.srcObject = new MediaStream([tracks.video]);
    }
    if (tracks.audio) {
      const el = new Audio();
      el.srcObject = new MediaStream([tracks.audio]);
      el.play().catch(() => {});
    }
  };

  const startCall = async (sessionData) => {
    const roomId = `video_${sessionData.sessionId.replace(/-/g, '')}`;
    if (sessionData.partner) setPartner(sessionData.partner);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    localStream.current = stream;
    setLocalActive(true);
    if (localVidRef.current) localVidRef.current.srcObject = stream;

    const rtc = new RtcSession(roomId);
    rtc.onReconnecting = () => toast.loading('Reconectando…', { id: 'rtc-reconnect' });
    rtc.onReconnected  = () => toast.success('Reconectado', { id: 'rtc-reconnect' });
    rtc.onFailed       = () => { toast.error('Se perdió la conexión'); setStatus('ended'); };
    rtcRef.current = rtc;
    await rtc.init();
    await rtc.publishStream(stream);

    // Server-side broadcast silently fails (no subscription). Fix: client announces
    // its own producers once the Realtime channel is open.
    const ch = supabase
      .channel(`room_events_${roomId}`)
      .on('broadcast', { event: 'new_producer' }, async ({ payload }) => {
        if (!activeRef.current || payload.peerId === user?.id) return;
        const result = await rtcRef.current?.consumeProducer(payload.producerId);
        if (!result) return;
        if (result.kind === 'video' && remoteVidRef.current) {
          remoteVidRef.current.srcObject = new MediaStream([result.track]);
          setStatus('connected');
          timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
        }
        if (result.kind === 'audio') {
          const el = new Audio();
          el.srcObject = new MediaStream([result.track]);
          el.play().catch(() => {});
        }
      })
      .on('broadcast', { event: 'peer_left' }, () => {
        if (!activeRef.current) return;
        setStatus('ended');
        clearInterval(timerRef.current);
      })
      .subscribe(async (channelStatus) => {
        if (channelStatus !== 'SUBSCRIBED' || !activeRef.current) return;

        // Announce own producers so the waiting peer can consume them
        for (const [kind, producer] of Object.entries(rtcRef.current?.producers ?? {})) {
          if (producer && !producer.closed) {
            await ch.send({
              type: 'broadcast',
              event: 'new_producer',
              payload: { producerId: producer.id, peerId: user?.id, kind },
            });
          }
        }

        // Retry consumeAll in case the first call ran before the partner published
        // (race condition when both users start at the same time)
        if (!remoteVidRef.current?.srcObject) {
          const retry = await rtcRef.current?.consumeAll().catch(() => null);
          if (retry?.video && remoteVidRef.current) {
            remoteVidRef.current.srcObject = new MediaStream([retry.video]);
            setStatus('connected');
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
          }
          if (retry?.audio) {
            const el = new Audio();
            el.srcObject = new MediaStream([retry.audio]);
            el.play().catch(() => {});
          }
        }
      });
    roomChRef.current = ch;

    const tracks = await rtc.consumeAll();
    if (tracks.video || tracks.audio) {
      attachRemoteTracks(tracks);
      setStatus('connected');
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else if (!sessionData.waiting) {
      setStatus('connected');
    }
  };

  const findPartner = async () => {
    if (videoCallsRemaining <= 0) { onLimitReached?.(); return; }
    setStatus('searching');
    setCallDuration(0);
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
        <div className="relative flex-1 bg-[#111] sm:border-r border-white/5 order-last sm:order-first overflow-hidden">

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
                <p className="text-white text-xl font-black tracking-tight">Destino</p>
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
        <div className="relative flex-1 bg-[#0a0a0a] order-first sm:order-last overflow-hidden">

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
            className="w-13 h-13 w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/40 transition-colors"
          >
            <FiPhoneOff size={20} />
          </button>

          <button
            onClick={toggleCam}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/90 text-white'
            }`}
          >
            {camOn ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}
