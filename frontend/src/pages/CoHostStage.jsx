import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft, FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff,
  FiRefreshCw, FiUsers,
} from 'react-icons/fi';
import { LiveKitSession } from '../lib/livekitSession.js';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

export default function CoHostStage() {
  const { showId } = useParams();
  const navigate = useNavigate();

  const [show, setShow]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [connecting, setConnecting]   = useState(false);
  const [connected, setConnected]     = useState(false);
  const [micOn, setMicOn]             = useState(true);
  const [camOn, setCamOn]             = useState(true);
  const [hostStream, setHostStream]   = useState(null);
  const [peerStreams, setPeerStreams] = useState({}); // otros co-hosts (no yo, no host)

  const rtcRef     = useRef(null);
  const localVid   = useRef(null);
  const hostVidRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/shows/${showId}`);
        const s = data.show;
        setShow(s);

        if (s.is_host) { navigate(`/studio`); return; }
        if (s.my_co_host_status !== 'accepted') {
          toast.error('No tienes invitación aceptada para este show');
          navigate(`/shows/${showId}`);
          return;
        }
        if (s.status !== 'live') {
          toast('El show aún no comenzó. Te avisaremos.', { icon: '⏱' });
          navigate(`/shows/${showId}`);
          return;
        }
      } catch {
        toast.error('Error cargando el show');
        navigate('/shows');
      } finally {
        setLoading(false);
      }
    })();
  }, [showId]);

  const connect = async () => {
    if (!show) return;
    setConnecting(true);
    try {
      // Verificar token (devuelve role: 'co_host')
      const { data: tokenInfo } = await api.get(`/api/shows/${showId}/token`);
      if (!tokenInfo?.can_publish) {
        toast.error('No tienes permiso para publicar');
        setConnecting(false);
        return;
      }
      const roomId = `show_${showId.replace(/-/g, '')}`;
      const rtc = new LiveKitSession(roomId);

      const hostUserId = show.host?.id;

      rtc.onRemoteTrack = (track, participant) => {
        const pid = participant?.identity;
        if (pid === hostUserId) {
          if (track.kind === 'video') setHostStream(s => ({ ...(s || {}), video: track.mediaStreamTrack }));
          if (track.kind === 'audio') setHostStream(s => ({ ...(s || {}), audio: track.mediaStreamTrack }));
        } else {
          setPeerStreams(prev => ({
            ...prev,
            [pid]: { ...(prev[pid] || {}), [track.kind]: track.mediaStreamTrack, name: participant?.name },
          }));
        }
      };

      rtc.onParticipantLeft = (p) => {
        if (p?.identity === hostUserId) {
          toast('El show terminó', { icon: '📺' });
          navigate('/shows');
        } else if (p?.identity) {
          setPeerStreams(prev => {
            const n = { ...prev };
            delete n[p.identity];
            return n;
          });
        }
      };

      rtc.onLocalVideo = (track) => {
        if (localVid.current) localVid.current.srcObject = new MediaStream([track]);
      };

      rtcRef.current = rtc;
      await rtc.join(true); // publish camera+mic
      setConnected(true);

      // Escuchar si el host me saca
      const ch = supabase.channel(`show_${showId}`)
        .on('broadcast', { event: 'co_host_kicked' }, ({ payload }) => {
          if (payload?.user_id) {
            // si soy yo, salir
            api.get('/api/profiles/me').then(({ data }) => {
              if (data?.id === payload.user_id) {
                toast('Te han retirado del show', { icon: '👋' });
                disconnect();
              }
            }).catch(() => {});
          }
        })
        .subscribe();
      rtcRef.current.__chan = ch;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al conectar');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (rtcRef.current?.__chan) supabase.removeChannel(rtcRef.current.__chan);
    await rtcRef.current?.leave().catch(() => {});
    rtcRef.current = null;
    setConnected(false);
    navigate(`/shows/${showId}`);
  };

  // Apply host stream to its video tag
  useEffect(() => {
    if (hostVidRef.current && hostStream?.video) {
      hostVidRef.current.srcObject = new MediaStream([hostStream.video, ...(hostStream.audio ? [hostStream.audio] : [])]);
    }
  }, [hostStream?.video, hostStream?.audio]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    rtcRef.current?.setMic(next);
  };
  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    rtcRef.current?.setCam(next);
  };

  useEffect(() => {
    return () => { rtcRef.current?.leave().catch(() => {}); };
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between">
        <Link to={`/shows/${showId}`} className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-xs flex items-center gap-2">
          <FiArrowLeft size={14} />
          <span className="truncate max-w-[180px]">{show?.title}</span>
        </Link>
        <div className="bg-brand-500/30 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-xs font-bold">
          🎬 Co-host
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row gap-2 p-2 pt-14 pb-24 overflow-hidden">
        {/* Host video (grande) */}
        <div className="flex-1 bg-dark-900 rounded-2xl overflow-hidden relative">
          <video ref={hostVidRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-white font-semibold">
            {show?.host?.full_name || 'Host'}
          </div>
        </div>

        {/* Mi cámara + otros co-hosts */}
        <div className="flex sm:flex-col gap-2 sm:w-40">
          <div className="flex-1 sm:flex-none sm:h-40 bg-dark-800 rounded-xl overflow-hidden relative border-2 border-brand-500/50">
            <video ref={localVid} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute bottom-1 left-1 bg-brand-500 rounded px-1.5 py-0.5 text-[9px] text-white font-bold">TÚ</div>
            {!camOn && (
              <div className="absolute inset-0 bg-dark-900 flex items-center justify-center">
                <FiVideoOff className="text-gray-600" size={28} />
              </div>
            )}
          </div>
          {Object.entries(peerStreams).map(([pid, s]) => (
            <PeerTile key={pid} stream={s} />
          ))}
        </div>
      </div>

      {/* Controles */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 z-30">
        {!connected ? (
          <button onClick={connect} disabled={connecting}
            className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-50">
            {connecting ? <FiRefreshCw className="animate-spin" size={16} /> : <FiVideo size={16} />}
            {connecting ? 'Conectando…' : 'Entrar al show'}
          </button>
        ) : (
          <>
            <button onClick={toggleMic}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${micOn ? 'bg-dark-700 text-white' : 'bg-red-500 text-white'}`}>
              {micOn ? <FiMic size={18} /> : <FiMicOff size={18} />}
            </button>
            <button onClick={toggleCam}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${camOn ? 'bg-dark-700 text-white' : 'bg-red-500 text-white'}`}>
              {camOn ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
            </button>
            <button onClick={disconnect}
              className="w-12 h-12 rounded-2xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center" aria-label="Colgar llamada">
              <FiPhoneOff size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PeerTile({ stream }) {
  const v = useRef(null);
  const a = useRef(null);
  useEffect(() => {
    if (v.current && stream.video) v.current.srcObject = new MediaStream([stream.video]);
    if (a.current && stream.audio) a.current.srcObject = new MediaStream([stream.audio]);
  }, [stream.video, stream.audio]);
  return (
    <div className="flex-1 sm:flex-none sm:h-32 bg-dark-800 rounded-xl overflow-hidden relative">
      <video ref={v} autoPlay playsInline muted className="w-full h-full object-cover" />
      <audio ref={a} autoPlay />
      {stream.name && (
        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5 text-[9px] text-white truncate max-w-[90%]">
          {stream.name}
        </div>
      )}
    </div>
  );
}
