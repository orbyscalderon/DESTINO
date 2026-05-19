import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiRotateCcw } from 'react-icons/fi';
import api from '../../lib/api.js';
import { useAuthStore } from '../../store/authStore.js';
import { countryByCode, languageByCode } from '../../lib/geodata.js';
import { showInterstitial } from '../../lib/admob.js';

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

export default function VideoRoom({ genderFilter, countryFilter, videoCallsRemaining = Infinity, onLimitReached, onCallStarted }) {
  const { user, profile } = useAuthStore();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | searching | connected | ended
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteUser, setRemoteUser] = useState(null);
  const [partner, setPartner] = useState(null); // info del partner (país, idioma)

  const localTrackRef = useRef({ audio: null, video: null });
  const localVideoRef = useRef(null);
  const interstitialShownRef = useRef(false);

  useEffect(() => {
    return () => cleanup();
  }, []);

  const cleanup = async () => {
    localTrackRef.current.audio?.close();
    localTrackRef.current.video?.close();
    if (client.connectionState !== 'DISCONNECTED') {
      await client.leave();
    }
  };

  const findPartner = async () => {
    if (videoCallsRemaining <= 0) {
      onLimitReached?.();
      return;
    }

    setStatus('searching');
    try {
      const { data } = await api.post('/api/video/find-partner', { genderFilter, countryFilter });
      onCallStarted?.();
      setSession(data);
      if (data.partner) setPartner(data.partner);

      if (!data.waiting) {
        // Hay pareja disponible, conectar
        await joinChannel(data.channelName);
        setStatus('connected');
      } else {
        // Esperando pareja, iniciar canal y esperar
        await joinChannel(data.channelName);
        setStatus('waiting');
      }
    } catch (err) {
      setStatus('idle');
      if (err.response?.data?.code === 'VIDEO_LIMIT_REACHED') {
        onLimitReached?.();
      } else {
        alert(err.response?.data?.error || 'Error buscando pareja');
      }
    }
  };

  const joinChannel = async (channelName) => {
    const uid = Math.floor(Math.random() * 100000);
    const { data } = await api.post('/api/video/token', { channelName, uid });

    await client.join(data.appId, channelName, data.token, uid);

    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTrackRef.current = { audio: audioTrack, video: videoTrack };

    videoTrack.play(localVideoRef.current);
    await client.publish([audioTrack, videoTrack]);

    // Evento cuando se une el otro usuario
    client.on('user-published', async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      setStatus('connected');
      setRemoteUser(remoteUser);
      if (mediaType === 'video') {
        remoteUser.videoTrack?.play('remote-video');
      }
      if (mediaType === 'audio') {
        remoteUser.audioTrack?.play();
      }
    });

    client.on('user-unpublished', () => {
      setStatus('ended');
      if (!profile?.is_premium && !interstitialShownRef.current) {
        interstitialShownRef.current = true;
        showInterstitial();
      }
    });
  };

  const endCall = async () => {
    const wasConnected = status === 'connected';
    if (session?.sessionId) {
      await api.delete('/api/video/end-session', { data: { sessionId: session.sessionId } });
    }
    await cleanup();
    setStatus('idle');
    setSession(null);
    setRemoteUser(null);
    setPartner(null);
    if (wasConnected && !profile?.is_premium && !interstitialShownRef.current) {
      interstitialShownRef.current = true;
      showInterstitial();
    }
    interstitialShownRef.current = false;
  };

  const toggleMic = async () => {
    await localTrackRef.current.audio?.setEnabled(!micOn);
    setMicOn(v => !v);
  };

  const toggleCam = async () => {
    await localTrackRef.current.video?.setEnabled(!camOn);
    setCamOn(v => !v);
  };

  return (
    <div className="relative w-full h-full bg-dark-900 rounded-2xl overflow-hidden">
      {/* Video remoto (principal) */}
      <div id="remote-video" className="w-full h-full bg-dark-800 flex items-center justify-center">
        {status !== 'connected' && (
          <div className="text-center">
            {status === 'idle' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="text-6xl">🎥</div>
                <h3 className="text-xl font-bold text-white">Videollamada Aleatoria</h3>
                <p className="text-gray-400 text-sm">Conecta con alguien nuevo al instante</p>
                {genderFilter && genderFilter !== 'any' && (
                  <p className="text-brand-400 text-xs">Filtro: {genderFilter}</p>
                )}
                <button
                  onClick={videoCallsRemaining <= 0 ? onLimitReached : findPartner}
                  className={`px-8 ${videoCallsRemaining <= 0 ? 'btn-secondary opacity-60' : 'btn-primary'}`}
                >
                  {videoCallsRemaining <= 0 ? '🔒 Límite alcanzado' : 'Buscar pareja'}
                </button>
              </motion.div>
            )}
            {(status === 'searching' || status === 'waiting') && (
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-white font-semibold">Buscando a alguien...</p>
                <button onClick={endCall} className="text-gray-500 text-sm hover:text-white">Cancelar</button>
              </motion.div>
            )}
            {status === 'ended' && (
              <div className="text-center space-y-4">
                <div className="text-5xl">👋</div>
                <p className="text-white font-semibold">La llamada terminó</p>
                <button onClick={findPartner} className="btn-primary flex items-center gap-2 mx-auto">
                  <FiRotateCcw size={14} /> Buscar otra persona
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video local (miniatura) */}
      {status !== 'idle' && (
        <div
          ref={localVideoRef}
          className="absolute bottom-20 right-4 w-28 h-40 bg-dark-700 rounded-xl overflow-hidden border-2 border-white/10 shadow-lg"
        />
      )}

      {/* Badge de país/idioma del partner */}
      {status === 'connected' && partner && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl">
          {partner.country && (
            <span className="text-base">{countryByCode(partner.country)?.flag}</span>
          )}
          {partner.language && (
            <span className="text-xs text-white/80">{languageByCode(partner.language)?.name || partner.language}</span>
          )}
        </div>
      )}

      {/* Controles */}
      {(status === 'connected' || status === 'waiting') && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
          <button
            onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${micOn ? 'bg-dark-700 text-white' : 'bg-brand-500 text-white'}`}
          >
            {micOn ? <FiMic /> : <FiMicOff />}
          </button>
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-white text-xl hover:bg-red-700 transition-colors"
          >
            <FiPhoneOff />
          </button>
          <button
            onClick={toggleCam}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${camOn ? 'bg-dark-700 text-white' : 'bg-brand-500 text-white'}`}
          >
            {camOn ? <FiVideo /> : <FiVideoOff />}
          </button>
        </div>
      )}
    </div>
  );
}
