import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff } from 'react-icons/fi';
import { useCallStore } from '../../store/callStore.js';

// Cliente Agora separado para llamadas directas (no interfiere con VideoRoom)
const callClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

export default function DirectCallRoom({ onEnd }) {
  const { callStatus, activeCall, setConnected } = useCallStore();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const localVideoRef = useRef(null);
  const localTrackRef = useRef({ audio: null, video: null });
  const timerRef = useRef(null);
  const joinedRef = useRef(false);

  // Unirse al canal al montar
  useEffect(() => {
    if (activeCall && !joinedRef.current) {
      joinedRef.current = true;
      joinChannel();
    }
    return () => { cleanup(); };
  }, []);

  // Timer cuando la llamada está conectada
  useEffect(() => {
    if (callStatus === 'connected' && !timerRef.current) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [callStatus]);

  const joinChannel = async () => {
    if (!activeCall) return;
    try {
      const { channelName, token, appId, uid } = activeCall;
      await callClient.join(appId, channelName, token, uid);

      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTrackRef.current = { audio: audioTrack, video: videoTrack };
      if (localVideoRef.current) videoTrack.play(localVideoRef.current);
      await callClient.publish([audioTrack, videoTrack]);

      callClient.on('user-published', async (remote, mediaType) => {
        await callClient.subscribe(remote, mediaType);
        setConnected();
        if (mediaType === 'video') remote.videoTrack?.play('direct-remote-video');
        if (mediaType === 'audio') remote.audioTrack?.play();
      });

      callClient.on('user-unpublished', () => { onEnd(); });
    } catch {
      onEnd();
    }
  };

  const cleanup = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    callClient.removeAllListeners();
    try {
      localTrackRef.current.audio?.close();
      localTrackRef.current.video?.close();
      if (callClient.connectionState !== 'DISCONNECTED') await callClient.leave();
    } catch {}
    joinedRef.current = false;
  };

  const toggleMic = async () => { await localTrackRef.current.audio?.setEnabled(!micOn); setMicOn(v => !v); };
  const toggleCam = async () => { await localTrackRef.current.video?.setEnabled(!camOn); setCamOn(v => !v); };

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const otherAvatar = activeCall?.otherAvatar
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeCall?.otherName || 'U')}&size=200&background=1a1a2e&color=f43f5e`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-dark-900"
    >
      {/* Video remoto (pantalla completa) */}
      <div id="direct-remote-video" className="absolute inset-0 bg-dark-800">
        {callStatus !== 'connected' && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="relative">
              <img
                src={otherAvatar}
                alt={activeCall?.otherName}
                className="w-32 h-32 rounded-full object-cover border-4 border-white/10"
              />
              <span className="absolute inset-0 rounded-full border-4 border-brand-500/40 animate-ping" />
            </div>
            <p className="text-white text-2xl font-bold">{activeCall?.otherName}</p>
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              {[0, 150, 300].map(d => (
                <div
                  key={d}
                  className="w-2 h-2 bg-brand-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
              <span className="ml-1">Llamando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Video local (PIP) */}
      <div
        ref={localVideoRef}
        className="absolute top-16 right-4 w-28 h-40 lg:w-36 lg:h-48 bg-dark-700 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl z-10"
      />

      {/* Barra superior */}
      <div className="absolute top-0 left-0 right-0 px-4 pt-4 pb-10 bg-gradient-to-b from-black/70 to-transparent z-10 flex items-center gap-3">
        <img src={otherAvatar} className="w-9 h-9 rounded-full object-cover" alt="" />
        <div>
          <p className="text-white font-semibold text-sm">{activeCall?.otherName}</p>
          {callStatus === 'connected'
            ? <p className="text-green-400 text-xs">{formatTime(elapsed)}</p>
            : <p className="text-gray-400 text-xs">Llamando...</p>
          }
        </div>
      </div>

      {/* Controles */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-6 z-10">
        <button
          onClick={toggleMic}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg transition-all active:scale-95 ${
            micOn ? 'bg-white/20 backdrop-blur-sm text-white' : 'bg-brand-500 text-white'
          }`}
        >
          {micOn ? <FiMic /> : <FiMicOff />}
        </button>
        <button
          onClick={onEnd}
          className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white text-2xl shadow-lg hover:bg-red-500 transition-all active:scale-95"
        >
          <FiPhoneOff />
        </button>
        <button
          onClick={toggleCam}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg transition-all active:scale-95 ${
            camOn ? 'bg-white/20 backdrop-blur-sm text-white' : 'bg-brand-500 text-white'
          }`}
        >
          {camOn ? <FiVideo /> : <FiVideoOff />}
        </button>
      </div>
    </motion.div>
  );
}
