import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiVideo, FiMic, FiMicOff, FiVideoOff,
  FiCalendar, FiLock, FiSave, FiRefreshCw,
  FiAlertCircle, FiMonitor,
  FiUsers, FiX, FiZap, FiWifi, FiWifiOff,
  FiSlash, FiRotateCw, FiBookmark,
  FiCopy, FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { LiveKitSession } from '../lib/livekitSession.js';
import { useAuthStore } from '../store/authStore.js';
import { SHOW_CATEGORIES } from './LiveShows.jsx';

const REACTIONS = ['❤️', '🔥', '⭐', '😍'];

const QUALITY_OPTIONS = [
  { key: '360p',  label: '360p',  w: 640,  h: 360,  fps: 24 },
  { key: '720p',  label: '720p',  w: 1280, h: 720,  fps: 30 },
  { key: '1080p', label: '1080p', w: 1920, h: 1080, fps: 30 },
];

const DEFAULT_SHOW = {
  title: '', description: '', show_type: 'broadcast',
  ticket_price: '', category: 'chat', scheduled_at: '',
  tip_goal: '', private_rate: '20', exclusive_rate: '35', min_private_minutes: '3',
};

const isDesktop = window.innerWidth >= 1024 && !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

function StatusPill({ status, label, icon: Icon }) {
  const map = {
    idle:        { cls: 'bg-dark-700 text-gray-500',           dot: 'bg-gray-600',                 txt: 'Pendiente'     },
    checking:    { cls: 'bg-yellow-500/15 text-yellow-400',    dot: 'bg-yellow-400 animate-pulse',  txt: 'Verificando…'  },
    granted:     { cls: 'bg-green-500/15 text-green-400',      dot: 'bg-green-400',                 txt: 'Listo'         },
    denied:      { cls: 'bg-red-500/15 text-red-400',          dot: 'bg-red-400',                   txt: 'Sin permiso'   },
    unavailable: { cls: 'bg-gray-500/15 text-gray-400',        dot: 'bg-gray-500',                  txt: 'No encontrado' },
  };
  const s = map[status] || map.idle;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <Icon size={11} />
      <span>{label}</span>
      <span className="opacity-50">· {s.txt}</span>
    </div>
  );
}

export default function ShowStudio() {
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuthStore();

  // ── SETUP STATE ──────────────────────────────────────────────────────────────
  const [profile, setProfile]       = useState(null);
  const [show, setShow]             = useState(DEFAULT_SHOW);
  const [saving, setSaving]         = useState(false);
  const [goingLive, setGoingLive]   = useState(false);
  const [countdown, setCountdown]   = useState(null);

  const [permCamera, setPermCamera]             = useState('idle');
  const [permMic, setPermMic]                   = useState('idle');
  const [cameraDevices, setCameraDevices]       = useState([]);
  const [micDevices, setMicDevices]             = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId]       = useState('');
  const [videoQuality, setVideoQuality]         = useState('720p');
  const [previewActive, setPreviewActive]       = useState(false);
  const [vuLevel, setVuLevel]                   = useState(0);

  // ── LIVE STATE ───────────────────────────────────────────────────────────────
  const [showId, setShowId]                   = useState(null);
  const [isLive, setIsLive]                   = useState(false);
  const [pendingLocalStream, setPendingLocalStream] = useState(null);
  const [liveDuration, setLiveDuration]       = useState(0);
  const [viewerCount, setViewerCount]         = useState(0);
  const [peakViewers, setPeakViewers]         = useState(0);
  const [totalCoinsEarned, setTotalCoinsEarned] = useState(0);
  const [audioLevel, setAudioLevel]           = useState(0);
  const [muted, setMuted]                     = useState(false);
  const [cameraOff, setCameraOff]             = useState(false);
  const [screenSharing, setScreenSharing]     = useState(false);
  const [connState, setConnState]             = useState('connected');
  const [chatMessages, setChatMessages]       = useState([]);
  const [chatInput, setChatInput]             = useState('');
  const [reactions, setReactions]             = useState([]);
  const [giftAnimations, setGiftAnimations]   = useState([]);
  const [tippers, setTippers]                 = useState([]);
  const [viewerList, setViewerList]           = useState([]);
  const [rightTab, setRightTab]               = useState('public');
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateRequest, setPrivateRequest]   = useState(null);
  const [pinnedMessage, setPinnedMessage]     = useState('');
  const [pinnedInput, setPinnedInput]         = useState('');
  const [showPinInput, setShowPinInput]       = useState(false);
  const [showModeration, setShowModeration]   = useState(false);
  const [bannedUsers, setBannedUsers]         = useState(new Map());

  // ── REFS ─────────────────────────────────────────────────────────────────────
  const previewStreamRef = useRef(null);
  const previewVideoRef  = useRef(null);
  const vuIntervalRef    = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const rtcRef           = useRef(null);
  const localStreamRef   = useRef(null);
  const localVideoRef    = useRef(null);
  const chatChannelRef   = useRef(null);
  const liveTimerRef     = useRef(null);
  const audioLevelRef    = useRef(null);
  const screenTrackRef   = useRef(null);
  const chatEndRef       = useRef(null);
  const lastChatSentRef  = useRef(0);

  // ── EFFECTS ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/profiles/${user.id}`).then(r => setProfile(r.data.profile)).catch(() => {});
    return () => {
      stopPreview();
      leaveShowChannel();
      leaveShow();
      clearInterval(liveTimerRef.current);
      clearInterval(audioLevelRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isLive || !pendingLocalStream) return;
    if (localVideoRef.current) localVideoRef.current.srcObject = pendingLocalStream;
    setPendingLocalStream(null);
  }, [isLive, pendingLocalStream]);

  useEffect(() => {
    if (previewActive && permCamera === 'granted' && previewVideoRef.current && previewStreamRef.current) {
      previewVideoRef.current.srcObject = previewStreamRef.current;
    }
  }, [previewActive, permCamera]);

  useEffect(() => {
    if (!isLive || !showId) return;
    const ping = () => api.post(`/api/shows/${showId}/heartbeat`).catch(() => {});
    ping();
    const timer = setInterval(ping, 30_000);
    return () => clearInterval(timer);
  }, [isLive, showId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── PREVIEW / DEVICES ────────────────────────────────────────────────────────
  const enumerateDevices = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(devs.filter(d => d.kind === 'videoinput'));
      setMicDevices(devs.filter(d => d.kind === 'audioinput'));
    } catch {}
  };

  const startVuMeter = (stream) => {
    try {
      audioCtxRef.current = new AudioContext();
      const src = audioCtxRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      src.connect(analyserRef.current);
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      vuIntervalRef.current = setInterval(() => {
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setVuLevel(Math.min(100, Math.round((avg / 128) * 100)));
      }, 80);
    } catch {}
  };

  const stopVuMeter = () => {
    clearInterval(vuIntervalRef.current);
    setVuLevel(0);
    try { audioCtxRef.current?.close(); } catch {}
  };

  const stopPreview = useCallback(() => {
    stopVuMeter();
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
    setPreviewActive(false);
    setPermCamera('idle');
    setPermMic('idle');
  }, []);

  const startPreview = async () => {
    stopPreview();
    previewStreamRef.current = new MediaStream();
    setPreviewActive(true);
    setPermCamera('checking');
    setPermMic('checking');
    const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId
          ? { deviceId: { exact: selectedCameraId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps }
          : { width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
      });
      stream.getVideoTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermCamera('granted');
      if (previewVideoRef.current) previewVideoRef.current.srcObject = previewStreamRef.current;
    } catch (err) {
      setPermCamera(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      stream.getAudioTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermMic('granted');
      startVuMeter(previewStreamRef.current);
    } catch (err) {
      setPermMic(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
    }
    await enumerateDevices();
  };

  const switchCamera = async (deviceId) => {
    setSelectedCameraId(deviceId);
    if (!previewStreamRef.current) return;
    previewStreamRef.current.getVideoTracks().forEach(t => { t.stop(); previewStreamRef.current.removeTrack(t); });
    setPermCamera('checking');
    try {
      const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
      });
      stream.getVideoTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermCamera('granted');
      if (previewVideoRef.current) previewVideoRef.current.srcObject = previewStreamRef.current;
    } catch { setPermCamera('denied'); }
  };

  const switchMic = async (deviceId) => {
    setSelectedMicId(deviceId);
    if (!previewStreamRef.current) return;
    stopVuMeter();
    previewStreamRef.current.getAudioTracks().forEach(t => { t.stop(); previewStreamRef.current.removeTrack(t); });
    setPermMic('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      stream.getAudioTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermMic('granted');
      startVuMeter(previewStreamRef.current);
    } catch { setPermMic('denied'); }
  };

  // ── SHOW CREATION / LIVE ─────────────────────────────────────────────────────
  const buildPayload = () => ({
    ...show,
    ticket_price: parseFloat(show.ticket_price) || 0,
    tip_goal:     parseFloat(show.tip_goal) || null,
    scheduled_at: show.scheduled_at || undefined,
    private_rate:        parseInt(show.private_rate) || 20,
    exclusive_rate:      parseInt(show.exclusive_rate) || 35,
    min_private_minutes: parseInt(show.min_private_minutes) || 3,
  });

  const handleSave = async () => {
    if (!show.title.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      await api.post('/api/shows', buildPayload());
      toast.success('Show guardado en Mis Shows');
      stopPreview();
      navigate('/creator/dashboard?tab=shows');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const startCountdown = () => {
    if (!show.title.trim()) { toast.error('El título es obligatorio'); return; }
    setCountdown(3);
    let n = 3;
    const t = setInterval(() => {
      n--;
      if (n > 0) { setCountdown(n); }
      else { clearInterval(t); setCountdown(null); handleGoLive(); }
    }, 1000);
  };

  const handleGoLive = async () => {
    setGoingLive(true);
    try {
      const { data: created } = await api.post('/api/shows', buildPayload());
      const id = created.show?.id;
      if (!id) throw new Error('Sin ID');
      setShowId(id);

      await api.post(`/api/shows/${id}/start`);

      const roomId = `show_${id.replace(/-/g, '')}`;
      let stream = previewStreamRef.current;
      if (!stream || stream.getTracks().length === 0) {
        const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
        stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps }
            : { width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
        });
      }
      localStreamRef.current = stream;
      previewStreamRef.current = null;

      const rtc = new LiveKitSession(roomId);
      rtcRef.current = rtc;
      await rtc.join(true, { skipAutoMedia: true });
      await rtc.publishStream(stream);

      try {
        const audioCtx = new AudioContext();
        await audioCtx.resume();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        audioLevelRef.current = setInterval(() => {
          analyser.getByteFrequencyData(buf);
          setAudioLevel(buf.reduce((s, v) => s + v, 0) / buf.length / 255);
        }, 80);
      } catch {}

      joinShowChannel(id, 'host');
      setIsLive(true);
      liveTimerRef.current = setInterval(() => setLiveDuration(d => d + 1), 1000);
      setPendingLocalStream(stream);
      toast.success('¡Estás en vivo!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar el show');
      setGoingLive(false);
    }
  };

  const handleEndShow = async () => {
    if (!showId) return;
    clearInterval(liveTimerRef.current);
    clearInterval(audioLevelRef.current);
    if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
    try { await api.post(`/api/shows/${showId}/end`); } catch {}
    await chatChannelRef.current?.send({ type: 'broadcast', event: 'show_ended', payload: {} }).catch(() => {});
    leaveShowChannel();
    await leaveShow();
    toast.success('Show terminado');
    navigate('/creator/dashboard?tab=shows');
  };

  const leaveShow = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    await rtcRef.current?.leave().catch(() => {});
    rtcRef.current = null;
  };

  // ── LIVE DEVICE SWITCHING ────────────────────────────────────────────────────
  const switchLiveCamera = async (deviceId) => {
    try {
      const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
      });
      const newTrack = stream.getVideoTracks()[0];
      await rtcRef.current?.replaceVideoTrack(newTrack);
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      const newStream = new MediaStream([newTrack, ...audioTracks]);
      localStreamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
      setSelectedCameraId(deviceId);
      toast.success('Cámara cambiada');
    } catch { toast.error('Error al cambiar cámara'); }
  };

  const switchLiveMic = async (deviceId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newTrack = stream.getAudioTracks()[0];
      await rtcRef.current?.replaceAudioTrack(newTrack);
      localStreamRef.current?.getAudioTracks().forEach(t => t.stop());
      const videoTracks = localStreamRef.current?.getVideoTracks() || [];
      const newStream = new MediaStream([...videoTracks, newTrack]);
      localStreamRef.current = newStream;
      setSelectedMicId(deviceId);
      toast.success('Micrófono cambiado');
    } catch { toast.error('Error al cambiar micrófono'); }
  };

  const toggleScreenShare = async () => {
    if (!rtcRef.current) return;
    if (screenSharing) {
      try {
        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (camTrack) {
          await rtcRef.current.replaceVideoTrack(camTrack);
          if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        }
        setScreenSharing(false);
      } catch { toast.error('Error al detener pantalla compartida'); }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        await rtcRef.current.replaceVideoTrack(screenTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => {
          setScreenSharing(false);
          screenTrackRef.current = null;
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) {
            rtcRef.current?.replaceVideoTrack(camTrack).catch(() => {});
            if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
          }
        };
        setScreenSharing(true);
      } catch { toast.error('No se pudo compartir pantalla'); }
    }
  };

  const toggleMute = () => { rtcRef.current?.setMic(muted); setMuted(v => !v); };
  const toggleCamera = () => { rtcRef.current?.setCam(cameraOff); setCameraOff(v => !v); };

  // ── SUPABASE REALTIME ────────────────────────────────────────────────────────
  const addGiftAnimation = useCallback((emoji, senderName) => {
    const gid = `${Date.now()}-${Math.random()}`;
    setGiftAnimations(prev => [...prev, { id: gid, emoji, senderName }]);
    setTimeout(() => setGiftAnimations(prev => prev.filter(g => g.id !== gid)), 3000);
  }, []);

  const joinShowChannel = useCallback((id, role) => {
    const ch = supabase.channel(`show:${id}`, {
      config: { presence: { key: user?.id || 'anon' } },
    })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count);
        setViewerList(Object.values(state).flatMap(v => v).filter(Boolean));
        setPeakViewers(prev => {
          if (count > prev) {
            if ([10, 50, 100, 500].includes(count)) toast(`🎉 ¡${count} viewers!`, { duration: 4000 });
            return count;
          }
          return prev;
        });
      })
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        setChatMessages(prev => [...prev.slice(-79), payload]);
      })
      .on('broadcast', { event: 'react' }, ({ payload }) => {
        const rid = `${Date.now()}-${Math.random()}`;
        setReactions(prev => [...prev, { id: rid, emoji: payload.emoji, x: Math.random() * 40 - 20 }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2600);
      })
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        addGiftAnimation(payload.emoji, payload.senderName);
        setTotalCoinsEarned(c => c + Math.round((payload.coins || 0) * 0.7));
        api.get(`/api/shows/${id}/tippers`).then(r => setTippers(r.data.tippers || [])).catch(() => {});
      })
      .on('broadcast', { event: 'private_request' }, ({ payload }) => {
        setPrivateRequest(payload);
      })
      .on('broadcast', { event: 'dm' }, ({ payload }) => {
        setPrivateMessages(prev => [...prev.slice(-99), payload]);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            userId: user?.id, role, ts: Date.now(),
            name:   authProfile?.full_name  || 'Anónimo',
            avatar: authProfile?.avatar_url || null,
            tier:   authProfile?.premium_tier || 'basic',
          }).catch(() => {});
          setConnState('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnState('reconnecting');
        }
      });
    chatChannelRef.current = ch;
  }, [addGiftAnimation, user?.id, authProfile]);

  const leaveShowChannel = () => {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !chatChannelRef.current) return;
    const now = Date.now();
    if (now - lastChatSentRef.current < 1500) { toast.error('Espera un momento', { id: 'chat-throttle' }); return; }
    lastChatSentRef.current = now;
    setChatInput('');
    const msg = { text, name: authProfile?.full_name || 'Anónimo', avatar: authProfile?.avatar_url || null, userId: user?.id, ts: Date.now() };
    await chatChannelRef.current.send({ type: 'broadcast', event: 'msg', payload: msg });
    setChatMessages(prev => [...prev.slice(-79), msg]);
  };

  const sendReaction = async (emoji) => {
    const rid = `${Date.now()}-${Math.random()}`;
    setReactions(prev => [...prev, { id: rid, emoji, x: Math.random() * 40 - 20 }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2600);
    chatChannelRef.current?.send({ type: 'broadcast', event: 'react', payload: { emoji } });
  };

  const handleBanUser = async (msg) => {
    if (!msg.userId || !showId) return;
    try {
      await api.post(`/api/shows/${showId}/ban/${msg.userId}`);
      setChatMessages(prev => prev.filter(m => m.userId !== msg.userId));
      setBannedUsers(prev => new Map(prev).set(msg.userId, msg.name));
      toast.success(`${msg.name} baneado`);
    } catch { toast.error('Error al banear'); }
  };

  const handleUnbanUser = async (userId, name) => {
    if (!showId) return;
    try {
      await api.delete(`/api/shows/${showId}/ban/${userId}`);
      setBannedUsers(prev => { const m = new Map(prev); m.delete(userId); return m; });
      toast.success(`${name} desbaneado`);
    } catch { toast.error('Error al desbanear'); }
  };

  const handleAcceptPrivate = () => {
    if (!privateRequest) return;
    chatChannelRef.current?.send({
      type: 'broadcast', event: 'private_accept',
      payload: { viewerId: privateRequest.viewerId, type: privateRequest.type, rate: privateRequest.rate, hostName: authProfile?.full_name || 'El host' },
    }).catch(() => {});
    setPrivateRequest(null);
    toast.success(`Show privado iniciado con ${privateRequest.viewerName}`);
  };

  const handleDeclinePrivate = () => {
    if (!privateRequest) return;
    chatChannelRef.current?.send({ type: 'broadcast', event: 'private_decline', payload: { viewerId: privateRequest.viewerId } }).catch(() => {});
    setPrivateRequest(null);
    toast('Solicitud rechazada');
  };

  const handleSavePinnedMessage = () => {
    setPinnedMessage(pinnedInput.trim());
    setShowPinInput(false);
    toast(pinnedInput.trim() ? 'Mensaje fijado' : 'Mensaje fijado eliminado');
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/shows/${showId}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado 🔗'); }
    catch { toast.error('No se pudo copiar'); }
  };

  const fmtDuration = (s) =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const set = (key, val) => setShow(s => ({ ...s, [key]: val }));
  const canGoLive = permCamera === 'granted' && permMic === 'granted';

  // ── COUNTDOWN OVERLAY ────────────────────────────────────────────────────────
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <AnimatePresence mode="wait">
          <motion.div key={countdown}
            initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4 }} className="text-center"
          >
            <p className="text-white/50 text-xl mb-2">Comenzando en</p>
            <p className="text-white font-black" style={{ fontSize: '10rem', lineHeight: 1 }}>{countdown}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── LIVE STUDIO ──────────────────────────────────────────────────────────────
  if (isLive) {
    const tipTotal  = tippers.reduce((s, t) => s + t.coins_total, 0);
    const tipGoal   = parseFloat(show.tip_goal) * 20 || 0;
    const tipGoalPct = tipGoal > 0 ? Math.min(100, (tipTotal / tipGoal) * 100) : 0;

    return (
      <div className="fixed inset-0 bg-dark-900 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Left: video + controls ── */}
        <div className="flex flex-col lg:flex-1 relative min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-dark-900/95 border-b border-white/5 shrink-0 z-10">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> EN VIVO
              </span>
              <span className="text-white font-mono text-sm font-semibold tabular-nums">{fmtDuration(liveDuration)}</span>
              {connState !== 'connected' && (
                <span className={`text-xs flex items-center gap-1 ${connState === 'reconnecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {connState === 'reconnecting' ? <FiWifi size={12} className="animate-pulse" /> : <FiWifiOff size={12} />}
                  {connState === 'reconnecting' ? 'Reconectando…' : 'Sin conexión'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-sm text-gray-300"><FiUsers size={13} />{viewerCount}</span>
              <span className="flex items-center gap-1 text-sm text-yellow-400 font-bold"><FiZap size={13} />{totalCoinsEarned}</span>
              <button onClick={handleCopyLink} className="w-7 h-7 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors ml-1">
                <FiCopy size={12} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Video */}
          <div className="relative bg-black flex-1 lg:min-h-0">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

            {cameraOff && (
              <div className="absolute inset-0 bg-dark-900 flex flex-col items-center justify-center">
                <FiVideoOff className="text-gray-600 mb-2" size={48} />
                <p className="text-gray-500 text-sm">Cámara apagada</p>
              </div>
            )}

            {/* Tip goal bar */}
            {tipGoal > 0 && (
              <div className="absolute bottom-3 left-3 right-3">
                <div className="bg-black/80 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-[10px] font-bold flex items-center gap-1">
                      <FiZap size={9} className="text-yellow-400" />
                      {tipGoalPct >= 100 ? '🎉 ¡Meta alcanzada!' : 'Meta de propinas'}
                    </span>
                    <span className="text-yellow-400 text-[10px] font-bold">{tipTotal} / {tipGoal} ⚡</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-brand-500"
                      animate={{ width: `${tipGoalPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Gift animations */}
            <div className="absolute top-4 left-4 pointer-events-none z-10">
              <AnimatePresence>
                {giftAnimations.map(g => (
                  <motion.div key={g.id}
                    initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -100, scale: 1.2 }}
                    exit={{ opacity: 0 }} transition={{ duration: 2.4, ease: 'easeOut' }}
                    className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 mb-1"
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="text-white text-xs font-medium">{g.senderName}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Floating reactions */}
            <div className="absolute bottom-20 right-4 pointer-events-none">
              <AnimatePresence>
                {reactions.map(r => (
                  <motion.div key={r.id}
                    initial={{ opacity: 1, y: 0, x: r.x, scale: 1 }}
                    animate={{ opacity: 0, y: -180, x: r.x + (Math.random() - 0.5) * 30, scale: 1.3 }}
                    exit={{ opacity: 0 }} transition={{ duration: 2.4, ease: 'easeOut' }}
                    className="text-3xl absolute bottom-0 right-0"
                  >{r.emoji}</motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Private request popup */}
          <AnimatePresence>
            {privateRequest && (
              <motion.div
                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-dark-800 border border-purple-500/40 rounded-2xl p-4 shadow-2xl w-72"
              >
                <div className="flex items-center gap-3 mb-3">
                  {privateRequest.viewerAvatar
                    ? <img src={privateRequest.viewerAvatar} className="w-10 h-10 rounded-full object-cover" alt="" />
                    : <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 font-bold">{privateRequest.viewerName[0]}</div>
                  }
                  <div>
                    <p className="text-white text-sm font-bold">{privateRequest.viewerName}</p>
                    <p className="text-purple-300 text-xs">
                      solicita show {privateRequest.type === 'exclusive' ? 'exclusivo' : 'privado'} · <span className="font-bold">{privateRequest.rate} coins/min</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAcceptPrivate} className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors">Aceptar</button>
                  <button onClick={handleDeclinePrivate} className="flex-1 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm font-semibold transition-colors">Rechazar</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Controls bar */}
          <div className="bg-dark-800 border-t border-white/5 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <button onClick={handleEndShow}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shrink-0"
              >
                <FiX size={14} /> Terminar
              </button>
              <div className="flex items-center gap-2">
                <button onClick={toggleMute}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${muted ? 'bg-red-500/30 border border-red-500/60 text-red-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                >
                  {muted ? <FiMicOff size={16} /> : <FiMic size={16} />}
                </button>
                <div className="flex items-end gap-px shrink-0" style={{ height: 12 }}>
                  {[0.1, 0.3, 0.55, 0.3, 0.1].map((thr, i) => (
                    <div key={i}
                      className={`w-1 rounded-sm transition-colors duration-75 ${!muted && audioLevel > thr ? 'bg-green-400' : 'bg-white/15'}`}
                      style={{ height: [4, 7, 12, 7, 4][i] }}
                    />
                  ))}
                </div>
                <button onClick={toggleCamera}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${cameraOff ? 'bg-red-500/30 border border-red-500/60 text-red-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                >
                  {cameraOff ? <FiVideoOff size={16} /> : <FiVideo size={16} />}
                </button>
                {isDesktop && (
                  <button onClick={toggleScreenShare}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${screenSharing ? 'bg-blue-500/30 border border-blue-500/60 text-blue-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                  >
                    <FiMonitor size={16} />
                  </button>
                )}
                {cameraDevices.length > 1 && (
                  <select value={selectedCameraId} onChange={e => switchLiveCamera(e.target.value)}
                    className="bg-white/10 border border-white/20 text-white text-[11px] rounded-xl px-2 py-2 outline-none max-w-[110px] truncate cursor-pointer"
                  >
                    {cameraDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cam ${d.deviceId.slice(0,5)}`}</option>)}
                  </select>
                )}
                {micDevices.length > 1 && (
                  <select value={selectedMicId} onChange={e => switchLiveMic(e.target.value)}
                    className="bg-white/10 border border-white/20 text-white text-[11px] rounded-xl px-2 py-2 outline-none max-w-[110px] truncate cursor-pointer"
                  >
                    {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: stats + chat panel ── */}
        <div className="w-full lg:w-80 flex flex-col bg-dark-800 border-t border-white/5 lg:border-t-0 lg:border-l shrink-0" style={{ height: '100dvh' }}>

          {/* Stats */}
          <div className="px-4 py-3 border-b border-white/5 shrink-0">
            <div className="grid grid-cols-4 gap-1">
              <div className="text-center py-1.5 rounded-lg bg-dark-700/50">
                <p className="text-white font-black text-sm leading-none">{viewerCount}</p>
                <p className="text-gray-500 text-[9px] mt-0.5">Ahora</p>
              </div>
              <div className="text-center py-1.5 rounded-lg bg-dark-700/50">
                <p className="text-white font-black text-sm leading-none">{peakViewers}</p>
                <p className="text-gray-500 text-[9px] mt-0.5">Pico</p>
              </div>
              <div className="text-center py-1.5 rounded-lg bg-dark-700/50">
                <p className="text-yellow-400 font-black text-sm leading-none">⚡{totalCoinsEarned}</p>
                <p className="text-green-400 text-[9px] mt-0.5 font-medium">${(totalCoinsEarned * 0.04).toFixed(2)}</p>
              </div>
              <div className="text-center py-1.5 rounded-lg bg-dark-700/50">
                <p className="text-white font-black text-sm leading-none">{tippers.length}</p>
                <p className="text-gray-500 text-[9px] mt-0.5">Tippers</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 shrink-0">
            {[
              { key: 'public',  label: 'Público' },
              { key: 'private', label: `Privado${privateMessages.length > 0 ? ` (${privateMessages.length})` : ''}` },
              { key: 'viewers', label: `${viewerCount} 👥` },
            ].map(t => (
              <button key={t.key} onClick={() => setRightTab(t.key)}
                className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${rightTab === t.key ? 'text-white border-brand-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB: Público */}
          {rightTab === 'public' && (
            <>
              {tippers.length > 0 && (
                <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
                  <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">Top propinas</p>
                  <div className="space-y-1.5">
                    {tippers.slice(0, 3).map((t, i) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className="text-[10px] font-black w-4" style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32' }}>#{i+1}</span>
                        <img src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.full_name||'U')}&size=40&background=1a1a2e&color=f43f5e`}
                          className="w-5 h-5 rounded-full object-cover shrink-0" alt="" />
                        <span className="text-white text-xs flex-1 truncate">{t.full_name}</span>
                        <span className="text-yellow-400 text-xs font-bold shrink-0">⚡{t.coins_total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {pinnedMessage && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
                    <div className="px-3 py-2 bg-brand-500/10 border-b border-brand-500/20 flex items-start gap-2">
                      <FiBookmark size={11} className="text-brand-400 shrink-0 mt-0.5" />
                      <p className="text-brand-200 text-xs leading-tight flex-1">{pinnedMessage}</p>
                      <button onClick={() => { setPinnedMessage(''); setPinnedInput(''); }} className="text-gray-500 hover:text-gray-300 shrink-0 transition-colors">
                        <FiX size={11} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
                {chatMessages.length === 0
                  ? <p className="text-gray-600 text-xs text-center py-4">El chat está vacío</p>
                  : chatMessages.slice(-50).map((msg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {msg.avatar
                        ? <img src={msg.avatar} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                        : <div className="w-5 h-5 rounded-full bg-brand-500/30 shrink-0 mt-0.5" />
                      }
                      <div className="bg-dark-700 rounded-xl px-2.5 py-1.5 min-w-0">
                        <span className="text-brand-300 text-[10px] font-semibold">{msg.name}</span>
                        <p className="text-white text-xs leading-tight break-words">{msg.text}</p>
                      </div>
                    </div>
                  ))
                }
                <div ref={chatEndRef} />
              </div>

              {/* Host tools */}
              <div className="px-3 pt-2 pb-1 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowPinInput(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showPinInput || pinnedMessage ? 'bg-brand-500/20 border border-brand-500/40 text-brand-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}
                  >
                    <FiBookmark size={12} /> Fijar
                  </button>
                  <button onClick={() => setShowModeration(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showModeration ? 'bg-red-500/20 border border-red-500/40 text-red-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}
                  >
                    <FiSlash size={12} /> Moderar
                  </button>
                </div>
                <AnimatePresence>
                  {showPinInput && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-dark-700 border border-white/10 text-white text-xs rounded-xl px-3 py-2 placeholder-gray-500 outline-none"
                          placeholder="Mensaje a fijar…"
                          value={pinnedInput}
                          onChange={e => setPinnedInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSavePinnedMessage()}
                          maxLength={100}
                        />
                        <button onClick={handleSavePinnedMessage} className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs rounded-xl font-medium transition-colors">Fijar</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {showModeration && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                      <div className="bg-dark-700 rounded-xl p-3 max-h-40 overflow-y-auto">
                        <p className="text-xs font-bold text-white mb-2 flex items-center gap-1"><FiSlash size={10} className="text-red-400" /> Chat reciente</p>
                        {chatMessages.length === 0
                          ? <p className="text-gray-600 text-xs">Sin mensajes</p>
                          : chatMessages.slice(-10).reverse().map((msg, i) => (
                            <div key={i} className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
                              <span className="text-white text-xs flex-1 truncate">
                                <span className="text-brand-300 font-medium">{msg.name}:</span> {msg.text}
                              </span>
                              {msg.userId && msg.userId !== user?.id && !bannedUsers.has(msg.userId) && (
                                <button onClick={() => handleBanUser(msg)} className="w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center shrink-0">
                                  <FiSlash size={10} className="text-red-400" />
                                </button>
                              )}
                            </div>
                          ))
                        }
                      </div>
                      {bannedUsers.size > 0 && (
                        <div className="bg-dark-700 rounded-xl p-3 mt-2">
                          <p className="text-xs font-bold text-white mb-2 flex items-center gap-1"><FiRotateCw size={10} className="text-orange-400" /> Baneados ({bannedUsers.size})</p>
                          {[...bannedUsers.entries()].map(([uid, name]) => (
                            <div key={uid} className="flex items-center gap-2 py-1">
                              <span className="text-gray-300 text-xs flex-1 truncate">{name}</span>
                              <button onClick={() => handleUnbanUser(uid, name)} className="w-6 h-6 rounded-full bg-green-500/20 hover:bg-green-500/40 flex items-center justify-center shrink-0">
                                <FiRotateCw size={10} className="text-green-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat input */}
              <div className="px-3 py-3 shrink-0">
                <div className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2 border border-white/5">
                  <input
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
                    placeholder="Escribe al chat…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                    maxLength={120}
                  />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim()}
                    className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center shrink-0 disabled:opacity-40"
                  >
                    <FiSend size={12} className="text-white" />
                  </button>
                </div>
                <div className="flex gap-1.5 mt-2 justify-center">
                  {REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => sendReaction(emoji)}
                      className="w-8 h-8 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-base active:scale-90 transition-transform"
                    >{emoji}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB: Privado */}
          {rightTab === 'private' && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
                {privateMessages.length === 0
                  ? <p className="text-gray-600 text-xs text-center py-8">Sin mensajes privados aún</p>
                  : privateMessages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {msg.fromAvatar
                        ? <img src={msg.fromAvatar} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px] text-purple-300">{(msg.fromName||'?')[0]}</div>
                      }
                      <div className="bg-purple-900/30 border border-purple-500/20 rounded-xl px-2.5 py-1.5 min-w-0">
                        <span className="text-purple-300 text-[10px] font-semibold">{msg.fromName}</span>
                        <p className="text-white text-xs leading-tight break-words">{msg.text}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
              <div className="px-3 py-2 border-t border-white/5 shrink-0">
                <p className="text-gray-600 text-[10px] text-center">Mensajes privados de los espectadores</p>
              </div>
            </>
          )}

          {/* TAB: Viewers */}
          {rightTab === 'viewers' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
              <div className="bg-dark-700/50 rounded-xl p-3 mb-3">
                <p className="text-white font-bold text-sm mb-1.5">{viewerCount} viendo ahora</p>
                <div className="space-y-0.5">
                  {(() => {
                    const vipC  = viewerList.filter(v => v.tier === 'vip').length;
                    const premC = viewerList.filter(v => v.tier === 'premium').length;
                    const basC  = viewerList.filter(v => !v.tier || v.tier === 'basic').length;
                    return (
                      <>
                        {vipC  > 0 && <p className="text-[11px] text-yellow-400">👑 VIP: {vipC}</p>}
                        {premC > 0 && <p className="text-[11px] text-brand-400">⭐ Premium: {premC}</p>}
                        {basC  > 0 && <p className="text-[11px] text-gray-500">Básico: {basC}</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="space-y-1.5">
                {viewerList.filter(v => v.role === 'viewer').map((v, i) => (
                  <div key={v.userId || i} className="flex items-center gap-2">
                    {v.avatar
                      ? <img src={v.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                      : <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{(v.name||'?')[0]}</div>
                    }
                    <span className="text-white text-xs flex-1 truncate">{v.name || 'Anónimo'}</span>
                    {v.tier === 'vip'     && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">VIP</span>}
                    {v.tier === 'premium' && <span className="text-[9px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">PRO</span>}
                  </div>
                ))}
                {viewerList.filter(v => v.role === 'viewer').length === 0 && (
                  <p className="text-gray-600 text-xs text-center py-4">Sin espectadores aún</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SETUP UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <div className="sticky top-0 z-30 bg-dark-900/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => { stopPreview(); navigate('/creator/dashboard'); }}
          className="w-9 h-9 bg-dark-700 hover:bg-dark-600 rounded-xl flex items-center justify-center transition-colors shrink-0"
        >
          <FiArrowLeft size={16} className="text-gray-300" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500/20 rounded-xl flex items-center justify-center">
            <FiMonitor size={15} className="text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Estudio de Show</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Configura y prueba tu setup antes de ir en vivo</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 lg:p-6 max-w-6xl mx-auto w-full">

        {/* Left: config */}
        <div className="flex-1 space-y-5 order-2 lg:order-1">

          <div className="card p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detalles del show</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Título *</label>
                <input className="input-field" placeholder="Ej: Sesión de baile 🔥"
                  value={show.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Descripción <span className="text-gray-600">(opcional)</span></label>
                <textarea className="input-field resize-none text-sm" rows={3}
                  placeholder="Cuéntales a tus fans qué verán…"
                  value={show.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tipo de show</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'broadcast', label: 'Broadcast',    desc: 'Múltiples viewers', icon: FiMonitor },
                { key: 'private',   label: 'Privado 1-a-1', desc: 'Solo un viewer',   icon: FiLock    },
              ].map(({ key, label, desc, icon: Icon }) => (
                <button key={key} onClick={() => set('show_type', key)}
                  className={`p-3 rounded-xl text-left transition-all border flex items-start gap-2.5 ${show.show_type === key ? 'bg-brand-500/15 border-brand-500/40' : 'bg-dark-700 border-white/5 hover:border-white/15'}`}
                >
                  <Icon size={14} className={show.show_type === key ? 'text-brand-400 mt-0.5' : 'text-gray-500 mt-0.5'} />
                  <div>
                    <p className={`text-sm font-semibold ${show.show_type === key ? 'text-white' : 'text-gray-300'}`}>{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Categoría</h2>
            <div className="flex flex-wrap gap-1.5">
              {SHOW_CATEGORIES
                .filter(c => c.key !== 'adult' || profile?.is_adult_creator)
                .map(({ key, label, emoji }) => (
                  <button key={key} onClick={() => set('category', key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${show.category === key ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'}`}
                  >
                    {emoji} {label}
                  </button>
                ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Precio y programación</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Precio ticket</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">$</span>
                  <input className="input-field pl-7 text-sm" type="number" placeholder="0 = gratis"
                    value={show.ticket_price} onChange={e => set('ticket_price', e.target.value)} min="0" step="0.01" />
                </div>
                {show.ticket_price > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1.5">Recibirás ${(parseFloat(show.ticket_price) * 0.7).toFixed(2)} por ticket (70%)</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1"><FiCalendar size={10} /> Programar (opcional)</label>
                <input className="input-field text-sm" type="datetime-local"
                  value={show.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-400 font-medium mb-1.5 block">Meta de propinas <span className="text-gray-600">(opcional)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🎯</span>
                <input className="input-field pl-8 text-sm" type="number" placeholder="Ej: 500 coins"
                  value={show.tip_goal} onChange={e => set('tip_goal', e.target.value)} min="0" />
              </div>
            </div>
          </div>

          <div className="card p-4 border border-purple-500/20 bg-purple-500/5">
            <p className="text-purple-300 text-xs font-semibold flex items-center gap-1.5 mb-3">
              <FiLock size={11} /> Tarifas para show privado
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'private_rate',        label: 'Privado (coins/min)' },
                { key: 'exclusive_rate',      label: 'Exclusivo (coins/min)' },
                { key: 'min_private_minutes', label: 'Tiempo mín. (min)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-gray-400 text-[10px] mb-1 block">{label}</label>
                  <input className="input-field text-sm py-2 text-center" type="number" min="1"
                    value={show[key]} onChange={e => set(key, e.target.value)} />
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-[10px] mt-2">
              Tú recibes 70% · Privado: {Math.round((show.private_rate || 20) * 0.7)} coins/min · Exclusivo: {Math.round((show.exclusive_rate || 35) * 0.7)} coins/min
            </p>
          </div>
        </div>

        {/* Right: camera preview + CTAs */}
        <div className="w-full lg:w-80 xl:w-96 space-y-4 order-1 lg:order-2">
          <div className="card p-4 lg:sticky lg:top-24">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vista previa</h2>

            <div className="relative rounded-xl overflow-hidden bg-dark-800 aspect-video mb-3">
              {previewActive && permCamera === 'granted' ? (
                <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  {permCamera === 'denied' ? (
                    <>
                      <FiVideoOff size={28} className="text-red-400" />
                      <p className="text-red-400 text-xs text-center px-4">Permiso de cámara denegado.<br />Revisa la configuración del navegador.</p>
                    </>
                  ) : permCamera === 'checking' ? (
                    <>
                      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-gray-400 text-xs">Iniciando cámara…</p>
                    </>
                  ) : (
                    <>
                      <FiVideo size={28} className="text-gray-600" />
                      <p className="text-gray-500 text-xs text-center">Activa la vista previa<br />para ver tu cámara</p>
                    </>
                  )}
                </div>
              )}
              {previewActive && permCamera === 'granted' && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white text-[10px] font-semibold">PREVIEW</span>
                </div>
              )}
            </div>

            {permMic === 'granted' && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <FiMic size={10} className="text-gray-500" />
                  <span className="text-[10px] text-gray-500">Nivel de audio</span>
                </div>
                <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500"
                    animate={{ width: `${vuLevel}%` }}
                    transition={{ duration: 0.08 }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 mb-3">
              <StatusPill status={permCamera} label="Cámara"    icon={permCamera === 'denied' ? FiVideoOff : FiVideo} />
              <StatusPill status={permMic}    label="Micrófono" icon={permMic    === 'denied' ? FiMicOff   : FiMic}   />
            </div>

            {previewActive && (cameraDevices.length > 0 || micDevices.length > 0) && (
              <div className="space-y-2 mb-3">
                {cameraDevices.length > 0 && (
                  <select className="input-field text-xs py-1.5" value={selectedCameraId} onChange={e => switchCamera(e.target.value)}>
                    {cameraDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${d.deviceId.slice(0, 6)}`}</option>)}
                  </select>
                )}
                {micDevices.length > 0 && (
                  <select className="input-field text-xs py-1.5" value={selectedMicId} onChange={e => switchMic(e.target.value)}>
                    {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono ${d.deviceId.slice(0, 6)}`}</option>)}
                  </select>
                )}
                <select className="input-field text-xs py-1.5" value={videoQuality} onChange={e => setVideoQuality(e.target.value)}>
                  {QUALITY_OPTIONS.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              </div>
            )}

            {!previewActive ? (
              <button onClick={startPreview}
                className="w-full flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 border border-white/10 hover:border-white/20 text-gray-300 text-sm font-medium py-2.5 rounded-xl transition-all"
              >
                <FiVideo size={14} /> Activar vista previa
              </button>
            ) : (
              <button onClick={stopPreview}
                className="w-full flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-gray-400 text-xs py-2 rounded-xl transition-colors"
              >
                <FiRefreshCw size={11} /> Detener preview
              </button>
            )}

            <div className="border-t border-white/5 my-4" />

            <div className="space-y-2">
              <button
                onClick={startCountdown}
                disabled={goingLive || saving || !show.title.trim()}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 text-white font-bold text-sm py-3 rounded-xl transition-colors"
              >
                {goingLive
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Ir en vivo ahora</>
                }
              </button>
              {!canGoLive && show.title.trim() && (
                <p className="text-[11px] text-yellow-500/80 flex items-center gap-1">
                  <FiAlertCircle size={10} /> Activa el preview para verificar cámara y micrófono
                </p>
              )}
              <button
                onClick={handleSave}
                disabled={saving || goingLive || !show.title.trim()}
                className="w-full flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 disabled:opacity-40 text-gray-300 font-medium text-sm py-2.5 rounded-xl border border-white/10 hover:border-white/20 transition-all"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <><FiSave size={13} /> Guardar para después</>
                }
              </button>
              <p className="text-[11px] text-gray-600 text-center">
                Aparecerá en Mis Shows · puedes ir en vivo cuando quieras
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
