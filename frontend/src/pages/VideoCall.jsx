import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff, FiRotateCw } from 'react-icons/fi';
import { supabase } from '../lib/supabase.js';
import { useAuthStore } from '../store/authStore.js';
import { RtcSession } from '../lib/mediasoupClient.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

export default function VideoCall() {
  const { matchId } = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();

  const [callStatus,  setCallStatus]  = useState('connecting'); // connecting | active | ended
  const [micOn,       setMicOn]       = useState(true);
  const [camOn,       setCamOn]       = useState(true);
  const [remoteUser,  setRemoteUser]  = useState(null);
  const [duration,    setDuration]    = useState(0);
  const [multiCam,    setMultiCam]    = useState(false);

  const sessionRef    = useRef(null);    // RtcSession
  const localVidRef   = useRef(null);
  const remoteVidRef  = useRef(null);
  const localStream   = useRef(null);
  const timerRef      = useRef(null);
  const camerasRef    = useRef([]);
  const roomChannelRef = useRef(null);
  const containerRef  = useRef(null);

  const endCall = useCallback(async (reason = 'ended') => {
    clearInterval(timerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    await sessionRef.current?.leave().catch(() => {});
    roomChannelRef.current?.send({
      type: 'broadcast', event: 'call_end', payload: { reason },
    }).catch(() => {});
    supabase.removeChannel(roomChannelRef.current).catch(() => {});
    setCallStatus('ended');
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        // 1. Get room info — which room to join and who we're calling
        const { data } = await api.post(`/api/rtc/call/${matchId}/init`).catch(async () => {
          // If 403 (not the caller, we're the callee being redirected here)
          // Just join — roomId is deterministic
          const roomId = `call_${matchId.replace(/-/g, '')}`;
          return { data: { roomId, calleeId: null } };
        });

        if (!active) return;
        const roomId = data.roomId;

        // Load remote user info
        const { data: matchData } = await api.get('/api/matches');
        const match = matchData.matches?.find(m => m.id === matchId);
        if (match?.other) setRemoteUser(match.other);

        // 2. Get local media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        localStream.current = stream;

        if (localVidRef.current) {
          localVidRef.current.srcObject = stream;
        }

        // Check for multiple cameras (flip button)
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        camerasRef.current = cams;
        setMultiCam(cams.length > 1);

        // 3. Init mediasoup session
        const session = new RtcSession(roomId);
        session.onReconnecting = () => toast.loading('Reconectando…', { id: 'rtc-reconnect' });
        session.onReconnected  = () => toast.success('Reconectado', { id: 'rtc-reconnect' });
        session.onFailed       = () => { toast.error('Se perdió la conexión'); endCall('connection_failed'); };
        sessionRef.current = session;
        await session.init();
        await session.publishStream(stream);

        // 4. Subscribe to room events (remote peer joining / call end)
        const ch = supabase
          .channel(`room_events_${roomId}`)
          .on('broadcast', { event: 'new_producer' }, async ({ payload }) => {
            if (!active || payload.peerId === user.id) return;
            // A new producer appeared — consume it
            const { track, kind } = await session.consumeProducer(payload.producerId);
            if (kind === 'video' && remoteVidRef.current) {
              const s = new MediaStream([track]);
              remoteVidRef.current.srcObject = s;
              setCallStatus('active');
              timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            }
            if (kind === 'audio') {
              const audioEl = new Audio();
              audioEl.srcObject = new MediaStream([track]);
              audioEl.play().catch(() => {});
            }
          })
          .on('broadcast', { event: 'call_end' },  () => active && endCall('remote_ended'))
          .on('broadcast', { event: 'call_rejected' }, () => {
            if (!active) return;
            toast.error('Llamada rechazada');
            endCall('rejected');
          })
          .on('broadcast', { event: 'peer_left' }, () => active && endCall('remote_left'))
          .subscribe();

        roomChannelRef.current = ch;

        // 5. Consume already-existing producers (callee joining after caller)
        const tracks = await session.consumeAll();
        if (!active) return;

        if (tracks.video && remoteVidRef.current) {
          remoteVidRef.current.srcObject = new MediaStream([tracks.video]);
          setCallStatus('active');
          timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
        if (tracks.audio) {
          const audioEl = new Audio();
          audioEl.srcObject = new MediaStream([tracks.audio]);
          audioEl.play().catch(() => {});
        }

        // If no remote producers yet, stay in connecting state until new_producer fires
      } catch (err) {
        if (!active) return;
        toast.error(err.response?.data?.error || 'No se pudo conectar la llamada');
        navigate(-1);
      }
    };

    init();
    return () => {
      active = false;
      endCall('cleanup');
    };
  }, [matchId]);

  const toggleMic = () => {
    sessionRef.current?.setMic(!micOn);
    setMicOn(v => !v);
  };

  const toggleCam = () => {
    sessionRef.current?.setCam(!camOn);
    setCamOn(v => !v);
  };

  const flipCamera = async () => {
    if (camerasRef.current.length < 2 || !localStream.current) return;
    const current = localStream.current.getVideoTracks()[0];
    const currentId = current?.getSettings?.()?.deviceId;
    const idx  = camerasRef.current.findIndex(c => c.deviceId === currentId);
    const next = camerasRef.current[(idx + 1) % camerasRef.current.length];
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: next.deviceId } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (sessionRef.current?.producers.video) {
        await sessionRef.current.producers.video.replaceTrack({ track: newTrack });
      }
      current?.stop();
      if (localVidRef.current) localVidRef.current.srcObject = new MediaStream([newTrack, ...localStream.current.getAudioTracks()]);
    } catch {}
  };

  const fmtDuration = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (callStatus === 'ended') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="min-h-screen bg-dark-900 flex items-center justify-center"
      >
        <div className="text-center px-6">
          <div className="w-20 h-20 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-5">
            <FiPhoneOff size={32} className="text-red-400" />
          </div>
          <p className="text-white font-bold text-xl mb-1">Llamada finalizada</p>
          {duration > 0 && <p className="text-gray-500 text-sm mb-6">Duración: {fmtDuration(duration)}</p>}
          <button onClick={() => navigate(-1)} className="btn-primary px-8">Volver</button>
        </div>
      </motion.div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-dark-900 relative overflow-hidden">
      {/* Remote video (background) */}
      <video
        ref={remoteVidRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover bg-dark-800"
      />

      {/* Local video (draggable thumbnail) */}
      <motion.video
        ref={localVidRef}
        autoPlay
        playsInline
        muted
        drag
        dragConstraints={containerRef}
        className="absolute top-4 right-4 w-28 h-40 rounded-2xl overflow-hidden bg-dark-700 border border-white/10 z-10 shadow-2xl cursor-grab active:cursor-grabbing object-cover"
      />

      {/* Connecting overlay */}
      <AnimatePresence>
        {callStatus === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="absolute inset-0 z-30 bg-dark-900 flex flex-col items-center justify-center"
          >
            {remoteUser ? (
              <>
                <div className="relative flex items-center justify-center mb-8">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="absolute rounded-full border border-brand-500/30"
                      initial={{ width: 96, height: 96, opacity: 0.8 }}
                      animate={{ width: 96 + (i + 1) * 36, height: 96 + (i + 1) * 36, opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
                    />
                  ))}
                  <img
                    src={remoteUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUser.full_name || 'U')}&size=200&background=1a1a2e&color=f43f5e`}
                    className="w-24 h-24 rounded-full object-cover border-2 border-brand-500/60 relative z-10"
                    alt=""
                  />
                </div>
                <p className="text-white font-bold text-xl mb-2">{remoteUser.full_name}</p>
                <p className="text-gray-400 text-sm">Conectando…</p>
              </>
            ) : (
              <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header (active call info) */}
      {callStatus === 'active' && remoteUser && (
        <div className="absolute top-0 inset-x-0 p-4 flex items-center gap-3 z-20 bg-gradient-to-b from-black/60 to-transparent">
          <img
            src={remoteUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUser.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
            className="w-8 h-8 rounded-full object-cover" alt=""
          />
          <div>
            <p className="text-white text-sm font-semibold">{remoteUser.full_name}</p>
            <p className="text-green-400 text-xs font-medium">{fmtDuration(duration)}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 inset-x-0 p-8 flex items-center justify-center gap-5 z-20 bg-gradient-to-t from-black/80 to-transparent">
        <button onClick={toggleMic}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30' : 'bg-red-500/90 hover:bg-red-500'}`}
        >
          {micOn ? <FiMic size={22} className="text-white" /> : <FiMicOff size={22} className="text-white" />}
        </button>

        {multiCam && (
          <button onClick={flipCamera}
            className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all"
          >
            <FiRotateCw size={18} className="text-white" />
          </button>
        )}

        <button onClick={() => endCall('user_ended')}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-xl"
        >
          <FiPhoneOff size={26} className="text-white" />
        </button>

        <button onClick={toggleCam}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${camOn ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30' : 'bg-red-500/90 hover:bg-red-500'}`}
        >
          {camOn ? <FiVideo size={22} className="text-white" /> : <FiVideoOff size={22} className="text-white" />}
        </button>
      </div>
    </div>
  );
}
