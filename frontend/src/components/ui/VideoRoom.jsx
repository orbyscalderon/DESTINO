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

    // The server's new_producer broadcast requires a server-side channel subscription,
    // which doesn't exist — it silently fails. Fix: the client announces its own producers
    // once subscribed, since it's already holding an open Realtime connection.
    const ch = supabase
      .channel(`room_events_${roomId}`)
      .on('broadcast', { event: 'new_producer' }, async ({ payload }) => {
        if (!activeRef.current || payload.peerId === user?.id) return;
        const result = await rtcRef.current?.consumeProducer(payload.producerId);
        if (!result) return; // null = already consumed (deduplication guard in RtcSession)
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
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || !activeRef.current) return;
        // Announce our producers so the waiting peer can consume them
        for (const [kind, producer] of Object.entries(rtcRef.current?.producers ?? {})) {
          if (producer && !producer.closed) {
            ch.send({
              type: 'broadcast',
              event: 'new_producer',
              payload: { producerId: producer.id, peerId: user?.id, kind },
            });
          }
        }
      });
    roomChRef.current = ch;

    // Consume existing producers (covers the case where the other peer published before us)
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

  return (
    <div className="w-full h-full bg-dark-900 rounded-2xl overflow-hidden flex flex-col">

      {/* Two-panel video layout */}
      <div className="flex-1 flex flex-col sm:flex-row gap-1.5 p-1.5 min-h-0">

        {/* Remote panel — top on mobile, right on desktop */}
        <div className="relative flex-1 bg-dark-800 rounded-xl overflow-hidden order-first sm:order-last">
          <video ref={remoteVidRef} autoPlay playsInline className="w-full h-full object-cover" />

          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div key="idle"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-dark-800"
              >
                <div className="text-4xl mb-2">🎥</div>
                <h3 className="text-base font-bold text-white mb-1">Videollamada Aleatoria</h3>
                <p className="text-gray-400 text-xs mb-3">Conecta con alguien nuevo al instante</p>
                {onlineCount !== null && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-4">
                    <FiUsers size={11} />
                    <span>
                      <span className="text-green-400 font-semibold">{onlineCount}</span>
                      {' '}{onlineCount !== 1 ? 'personas' : 'persona'} online
                    </span>
                  </div>
                )}
                <button
                  onClick={videoCallsRemaining <= 0 ? onLimitReached : findPartner}
                  className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    videoCallsRemaining <= 0
                      ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                  }`}
                >
                  {videoCallsRemaining <= 0 ? '🔒 Límite alcanzado' : 'Buscar pareja'}
                </button>
              </motion.div>
            )}

            {(status === 'searching' || status === 'waiting' || status === 'connecting') && (
              <motion.div key="searching"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center bg-dark-800/90 backdrop-blur-sm"
              >
                <div className="relative flex items-center justify-center mb-3" style={{ width: 80, height: 80 }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="absolute rounded-full border border-brand-500/40"
                      initial={{ width: 24, height: 24, opacity: 0.9 }}
                      animate={{ width: 80, height: 80, opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
                    />
                  ))}
                  <div className="w-9 h-9 rounded-full bg-brand-500/20 border-2 border-brand-500/60 flex items-center justify-center z-10">
                    <span className="text-lg">🎥</span>
                  </div>
                </div>
                <p className="text-white font-semibold text-sm mb-2">Buscando pareja…</p>
                <button onClick={() => endCall(false)} className="text-gray-500 text-xs hover:text-white underline underline-offset-2">Cancelar</button>
              </motion.div>
            )}

            {status === 'ended' && (
              <motion.div key="ended"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-dark-800/90 backdrop-blur-sm"
              >
                <div className="text-4xl mb-2">👋</div>
                <p className="text-white font-semibold mb-1">La llamada terminó</p>
                {callDuration > 0 && <p className="text-gray-500 text-sm mb-3">{fmtDuration(callDuration)}</p>}
                <div className="flex gap-2 flex-wrap justify-center">
                  <button onClick={findPartner} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors">
                    <FiSkipForward size={13} /> Siguiente
                  </button>
                  <button onClick={() => setStatus('idle')} className="bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm px-4 py-2 rounded-xl transition-colors">Volver</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Partner info */}
          {status === 'connected' && partner && (partner.country || partner.language) && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg z-10">
              {partner.country && (
                <>
                  <FlagImg code={partner.country} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />
                  <span className="text-xs text-white font-medium">{countryByCode(partner.country)?.name || partner.country}</span>
                </>
              )}
              {partner.language && (
                <span className="text-xs text-white/60 border-l border-white/20 pl-1.5">{languageByCode(partner.language)?.name || partner.language}</span>
              )}
            </div>
          )}

          {/* Duration */}
          {status === 'connected' && callDuration > 0 && (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg z-10">
              <p className="text-green-400 text-xs font-mono font-bold">{fmtDuration(callDuration)}</p>
            </div>
          )}

          <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs text-white/50 z-10">Pareja</div>
        </div>

        {/* Local panel — bottom on mobile, left on desktop */}
        <div className="relative flex-1 bg-dark-800 rounded-xl overflow-hidden order-last sm:order-first">
          <video ref={localVidRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {!localActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-800">
              <div className="w-12 h-12 rounded-full bg-dark-700 border border-white/5 flex items-center justify-center mb-2">
                <FiVideo size={20} className="text-gray-600" />
              </div>
              <p className="text-gray-600 text-xs">Tu cámara</p>
            </div>
          )}

          {localActive && (!micOn || !camOn) && (
            <div className="absolute top-2 right-2 flex gap-1 z-10">
              {!micOn && <div className="bg-red-500/80 rounded-full p-1.5"><FiMicOff size={9} className="text-white" /></div>}
              {!camOn && <div className="bg-red-500/80 rounded-full p-1.5"><FiVideoOff size={9} className="text-white" /></div>}
            </div>
          )}

          <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs text-white/50 z-10">
            {profile?.full_name?.split(' ')[0] || 'Tú'}
          </div>
        </div>
      </div>

      {/* Controls */}
      {(status === 'connected' || status === 'waiting') && (
        <div className="flex justify-center items-center gap-3 py-3 shrink-0">
          <button onClick={toggleMic}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/90 text-white'}`}
          >
            {micOn ? <FiMic size={18} /> : <FiMicOff size={18} />}
          </button>
          <button onClick={skipToNext} disabled={skipping}
            className="w-11 h-11 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Siguiente persona"
          >
            {skipping
              ? <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              : <FiSkipForward size={18} />
            }
          </button>
          <button onClick={() => endCall(false)}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-xl transition-colors"
          >
            <FiPhoneOff size={20} />
          </button>
          <button onClick={toggleCam}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/90 text-white'}`}
          >
            {camOn ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}
