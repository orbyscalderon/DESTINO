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

function useSearchingCount() {
  const [count, setCount] = useState(() => Math.floor(Math.random() * 40) + 15);
  useEffect(() => {
    const t = setInterval(() => setCount(c => Math.max(5, c + Math.floor(Math.random() * 7) - 3)), 3000);
    return () => clearInterval(t);
  }, []);
  return count;
}

export default function VideoRoom({ genderFilter, countryFilter, videoCallsRemaining = Infinity, onLimitReached, onCallStarted }) {
  const { user, profile } = useAuthStore();
  const [session,       setSession]       = useState(null);       // { sessionId, channelName, role, waiting, partner }
  const [status,        setStatus]        = useState('idle');     // idle | searching | waiting | connected | ended
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [partner,       setPartner]       = useState(null);
  const [callDuration,  setCallDuration]  = useState(0);
  const [skipping,      setSkipping]      = useState(false);

  const rtcRef        = useRef(null);     // RtcSession
  const localVidRef   = useRef(null);
  const remoteVidRef  = useRef(null);
  const localStream   = useRef(null);
  const timerRef      = useRef(null);
  const roomChRef     = useRef(null);
  const interstitialRef = useRef(false);
  const activeRef     = useRef(true);

  const searchingCount = useSearchingCount();

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

    // Get local media
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    localStream.current = stream;
    if (localVidRef.current) localVidRef.current.srcObject = stream;

    // Init mediasoup session
    const rtc = new RtcSession(roomId);
    rtc.onReconnecting = () => toast.loading('Reconectando…', { id: 'rtc-reconnect' });
    rtc.onReconnected  = () => toast.success('Reconectado', { id: 'rtc-reconnect' });
    rtc.onFailed       = () => { toast.error('Se perdió la conexión'); setStatus('ended'); };
    rtcRef.current = rtc;
    await rtc.init();
    await rtc.publishStream(stream);

    // Subscribe to room events
    const ch = supabase
      .channel(`room_events_${roomId}`)
      .on('broadcast', { event: 'new_producer' }, async ({ payload }) => {
        if (!activeRef.current || payload.peerId === user?.id) return;
        const result = await rtc.consumeProducer(payload.producerId);
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
      .subscribe();
    roomChRef.current = ch;

    // Consume existing producers (if joining an existing room)
    const tracks = await rtc.consumeAll();
    if (tracks.video || tracks.audio) {
      attachRemoteTracks(tracks);
      setStatus('connected');
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else if (!sessionData.waiting) {
      setStatus('connected'); // host waiting — show connected but no remote yet
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
    <div className="relative w-full h-full bg-dark-900 rounded-2xl overflow-hidden">

      {/* Remote video */}
      <video
        ref={remoteVidRef}
        autoPlay playsInline
        className="w-full h-full bg-dark-800 object-cover"
      />

      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-4 px-6"
          >
            <div className="text-6xl">🎥</div>
            <h3 className="text-xl font-bold text-white">Videollamada Aleatoria</h3>
            <p className="text-gray-400 text-sm">Conecta con alguien nuevo al instante</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <FiUsers size={12} />
              <span><span className="text-green-400 font-semibold">{searchingCount}</span> personas buscando ahora</span>
            </div>
            <button
              onClick={videoCallsRemaining <= 0 ? onLimitReached : findPartner}
              className={`px-8 ${videoCallsRemaining <= 0 ? 'btn-secondary opacity-60' : 'btn-primary'}`}
            >
              {videoCallsRemaining <= 0 ? '🔒 Límite alcanzado' : 'Buscar pareja'}
            </button>
          </motion.div>
        )}

        {(status === 'searching' || status === 'waiting') && (
          <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center"
          >
            <div className="relative flex items-center justify-center mb-6" style={{ width: 160, height: 160 }}>
              {[0, 1, 2, 3].map(i => (
                <motion.div key={i} className="absolute rounded-full border border-brand-500/30"
                  initial={{ width: 40, height: 40, opacity: 0.9 }}
                  animate={{ width: 160, height: 160, opacity: 0 }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
                />
              ))}
              <div className="w-14 h-14 rounded-full bg-brand-500/20 border-2 border-brand-500/60 flex items-center justify-center z-10">
                <span className="text-2xl">🎥</span>
              </div>
            </div>
            <p className="text-white font-semibold text-lg mb-1">Buscando pareja…</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mb-4">
              <FiUsers size={12} />
              <span><span className="text-green-400 font-semibold">{searchingCount}</span> personas online</span>
            </div>
            <button onClick={() => endCall(false)} className="text-gray-500 text-sm hover:text-white underline underline-offset-2">Cancelar</button>
          </motion.div>
        )}

        {status === 'ended' && (
          <motion.div key="ended" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-4 px-6"
          >
            <div className="text-5xl">👋</div>
            <p className="text-white font-semibold text-lg">La llamada terminó</p>
            {callDuration > 0 && <p className="text-gray-500 text-sm">Duración: {fmtDuration(callDuration)}</p>}
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={findPartner} className="btn-primary flex items-center gap-2">
                <FiSkipForward size={14} /> Siguiente persona
              </button>
              <button onClick={() => setStatus('idle')} className="btn-secondary">Volver</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Local video thumbnail */}
      {status !== 'idle' && (
        <video
          ref={localVidRef}
          autoPlay playsInline muted
          className="absolute bottom-20 right-4 w-28 h-40 bg-dark-700 rounded-xl overflow-hidden border-2 border-white/10 shadow-lg z-10 object-cover"
        />
      )}

      {/* Partner country badge */}
      {status === 'connected' && partner && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl z-10">
          {partner.country && <span className="text-base">{countryByCode(partner.country)?.flag}</span>}
          {partner.language && <span className="text-xs text-white/80">{languageByCode(partner.language)?.name || partner.language}</span>}
        </div>
      )}

      {/* Duration */}
      {status === 'connected' && callDuration > 0 && (
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl z-10">
          <p className="text-green-400 text-xs font-mono font-bold">{fmtDuration(callDuration)}</p>
        </div>
      )}

      {/* Controls */}
      {(status === 'connected' || status === 'waiting') && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-3 z-10">
          <button onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${micOn ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500/90 text-white'}`}
          >
            {micOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
          </button>
          <button onClick={skipToNext} disabled={skipping}
            className="w-12 h-12 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Siguiente persona"
          >
            {skipping
              ? <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              : <FiSkipForward size={20} />
            }
          </button>
          <button onClick={() => endCall(false)}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-xl transition-colors"
          >
            <FiPhoneOff size={22} />
          </button>
          <button onClick={toggleCam}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${camOn ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500/90 text-white'}`}
          >
            {camOn ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
          </button>
        </div>
      )}
    </div>
  );
}
