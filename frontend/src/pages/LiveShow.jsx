import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiUsers, FiDollarSign,
  FiX, FiRadio, FiZap, FiAlertCircle, FiMonitor, FiCamera,
  FiRefreshCw, FiChevronDown, FiChevronUp, FiMessageCircle,
  FiSend, FiShare2, FiWifi, FiWifiOff, FiGift, FiAward,
  FiSlash, FiBell, FiBellOff, FiRotateCw, FiClock, FiBookmark,
  FiCopy,
} from 'react-icons/fi';
import GiftPanel from '../components/ui/GiftPanel.jsx';
import AgeVerificationModal from '../components/ui/AgeVerificationModal.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useAds } from '../hooks/useAds.js';
import { supabase } from '../lib/supabase.js';
import { LiveKitSession } from '../lib/livekitSession.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import PaymentModal from '../components/ui/PaymentModal.jsx';

const TIP_OPTIONS = [
  { coins: 20,  label: '20',  usd: '$1'  },
  { coins: 100, label: '100', usd: '$5'  },
  { coins: 200, label: '200', usd: '$10' },
  { coins: 500, label: '500', usd: '$25' },
];

const REACTIONS = ['❤️', '🔥', '⭐', '😍'];

const isDesktop =
  window.innerWidth >= 1024 &&
  !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

const QUALITY_OPTIONS = [
  { key: '360p',  label: '360p',  sub: 'Bajo ancho de banda', w: 640,  h: 360,  fps: 24 },
  { key: '720p',  label: '720p',  sub: 'Recomendado',         w: 1280, h: 720,  fps: 30 },
  { key: '1080p', label: '1080p', sub: 'Alta calidad',        w: 1920, h: 1080, fps: 30 },
];

// ── Pill de estado de dispositivo ────────────────────────────────────────────
function DevicePill({ status, label, icon: Icon }) {
  const map = {
    idle:        { cls: 'bg-dark-600 text-gray-400',        dot: 'bg-gray-500',                txt: 'Pendiente'      },
    checking:    { cls: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400 animate-pulse', txt: 'Verificando...' },
    granted:     { cls: 'bg-green-500/20 text-green-400',   dot: 'bg-green-400',                txt: 'Activo'         },
    denied:      { cls: 'bg-red-500/20 text-red-400',       dot: 'bg-red-400',                  txt: 'Denegado'       },
    unavailable: { cls: 'bg-gray-500/20 text-gray-400',     dot: 'bg-gray-500',                 txt: 'No encontrado'  },
  };
  const s = map[status] || map.idle;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <Icon size={11} />
      <span>{label}</span>
      <span className="opacity-60">· {s.txt}</span>
    </div>
  );
}

// ── Guía OBS ──────────────────────────────────────────────────────────────────
function OBSGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card border-blue-500/20 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <FiMonitor className="text-blue-400" size={15} />
          <span className="text-blue-400 text-sm font-medium">Transmitir desde OBS</span>
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-semibold">PC</span>
        </div>
        {open ? <FiChevronUp className="text-gray-500" size={14} /> : <FiChevronDown className="text-gray-500" size={14} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              <p className="text-gray-400 text-xs leading-relaxed">
                Con la <strong className="text-gray-200">Cámara Virtual de OBS</strong> puedes enviar cualquier escena directamente al show.
              </p>
              {[
                { n: 1, t: 'Abre OBS Studio en tu PC' },
                { n: 2, t: 'Ve a Herramientas → Iniciar cámara virtual' },
                { n: 3, t: 'Selecciona "OBS Virtual Camera" en el desplegable de cámara' },
                { n: 4, t: 'Tu escena de OBS aparecerá en el preview' },
              ].map(({ n, t }) => (
                <div key={n} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                  <p className="text-gray-300 text-xs leading-relaxed">{t}</p>
                </div>
              ))}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2">
                <p className="text-blue-300 text-xs">Tip: haz clic en <strong>"Reintentar dispositivos"</strong> después de activar la cámara virtual.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function LiveShow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuthStore();
  const { showBottomBanner, hideBottomBanner } = useAds();

  // Show data
  const [show, setShow]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [joining, setJoining]         = useState(false);
  const [inShow, setInShow]           = useState(false);
  const [pendingViewerTracks, setPendingViewerTracks] = useState(null);
  const [isLive, setIsLive]           = useState(false);
  const [muted, setMuted]             = useState(false);
  const [cameraOff, setCameraOff]     = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  // Payment
  const [paymentModal, setPaymentModal] = useState(null);

  // Tips
  const [showTips, setShowTips]       = useState(false);
  const [sendingTip, setSendingTip]   = useState(null);
  const [tipMessage, setTipMessage]   = useState('');
  const [latestTip, setLatestTip]     = useState(null);

  // Live chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState('');
  const [showChat, setShowChat]         = useState(false);
  const chatEndRef    = useRef(null);
  const chatChannelRef = useRef(null);

  // Emoji reactions
  const [reactions, setReactions] = useState([]);

  // Connection state
  const [connState, setConnState] = useState('connected');

  // Gifts + leaderboard
  const [showGifts, setShowGifts]       = useState(false);
  const [coinBalance, setCoinBalance]   = useState(0);
  const [tippers, setTippers]           = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [giftAnimations, setGiftAnimations]   = useState([]);

  const lastChatSentRef = useRef(0);

  // Moderation (host)
  const [showModeration, setShowModeration] = useState(false);
  const [bannedUsers, setBannedUsers] = useState(new Map()); // userId -> name

  // Interest (viewer, scheduled shows)
  const [interested, setInterested]       = useState(false);
  const [interestCount, setInterestCount] = useState(0);
  const [togglingInterest, setTogglingInterest] = useState(false);

  // Studio (host en vivo)
  const [liveDuration, setLiveDuration]   = useState(0);
  const [totalCoinsEarned, setTotalCoinsEarned] = useState(0);
  const [audioLevel, setAudioLevel]       = useState(0);
  const [videoQuality, setVideoQuality]   = useState('720p');
  const [screenSharing, setScreenSharing] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState('');
  const [pinnedInput, setPinnedInput]     = useState('');
  const [showPinInput, setShowPinInput]   = useState(false);
  const [countdown, setCountdown]         = useState(null);
  const [showAgeModal, setShowAgeModal]   = useState(false);
  const [peakViewers, setPeakViewers]     = useState(0);
  const liveTimerRef  = useRef(null);
  const audioLevelRef = useRef(null);
  const screenTrackRef = useRef(null);
  const prevViewerRef  = useRef(0);

  // Host stream — applied via useEffect once the studio video element is mounted
  const [pendingLocalStream, setPendingLocalStream] = useState(null);

  // Show privado
  const [privateModal, setPrivateModal]       = useState(false);
  const [privateSession, setPrivateSession]   = useState(null); // { type, rate, startTime }
  const [privateRequest, setPrivateRequest]   = useState(null); // { viewerId, viewerName, viewerAvatar, type, rate }
  const [privateMinutes, setPrivateMinutes]   = useState(0);
  const [privateBalance, setPrivateBalance]   = useState(0);
  const privateTickRef = useRef(null);

  // Viewer list, DMs, reactions counter, right panel tab
  const [viewerList, setViewerList]           = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [totalReactions, setTotalReactions]   = useState(0);
  const [rightTab, setRightTab]               = useState('public'); // 'public' | 'private' | 'viewers'
  const [dmInput, setDmInput]                 = useState('');
  const dmEndRef = useRef(null);

  // Pre-show
  const [preShow, setPreShow]             = useState(false);
  const [permCamera, setPermCamera]       = useState('idle');
  const [permMic, setPermMic]             = useState('idle');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [micDevices, setMicDevices]       = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId]       = useState('');

  // Refs: LiveKit + streams
  const rtcRef          = useRef(null);
  const localStreamRef  = useRef(null);
  const previewStreamRef = useRef(null);
  const hostVideoRef    = useRef(null);
  const localVideoRef   = useRef(null);
  const previewVideoRef = useRef(null);

  // Refs to track live state and role for cleanup/pagehide (avoid stale closures)
  const isLiveRef    = useRef(false);
  const isHostRef    = useRef(false);
  const authTokenRef = useRef(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Set srcObject on preview video after permissions
  useEffect(() => {
    if (permCamera === 'granted' && previewVideoRef.current && previewStreamRef.current) {
      previewVideoRef.current.srcObject = previewStreamRef.current;
    }
  }, [permCamera, preShow]);

  useEffect(() => {
    loadShow();
  }, [id]);

  // Keep refs in sync so cleanup handlers always see current values
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);
  useEffect(() => {
    if (show) isHostRef.current = show.host?.id === user?.id;
  }, [show, user?.id]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      authTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      authTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cleanup on React unmount (SPA navigation away) — never auto-end; host must click Terminar
  useEffect(() => {
    return () => {
      cleanupPreviewTracks();
      leaveShowChannel();
      leaveShow();
      hideBottomBanner();
    };
  }, []);

  // Heartbeat: while host is live, ping every 30 s so the backend knows the show is active.
  // The cleanup job ends shows with no heartbeat for 10+ min (handles crashes/lost connection).
  useEffect(() => {
    if (!isLive || !show || show.host?.id !== user?.id) return;
    const ping = () => api.post(`/api/shows/${id}/heartbeat`).catch(() => {});
    ping(); // immediate first ping
    const timer = setInterval(ping, 30_000);
    return () => clearInterval(timer);
  }, [isLive, id, show?.host?.id, user?.id]);

  // Apply pending viewer tracks once the video element is in the DOM (inShow=true)
  useEffect(() => {
    if (!inShow || !pendingViewerTracks) return;
    if (pendingViewerTracks.video && hostVideoRef.current) {
      hostVideoRef.current.srcObject = new MediaStream([pendingViewerTracks.video]);
    }
    if (pendingViewerTracks.audio) {
      const el = new Audio();
      el.srcObject = new MediaStream([pendingViewerTracks.audio]);
      el.play().catch(() => {});
    }
    setPendingViewerTracks(null);
  }, [inShow, pendingViewerTracks]);

  // Apply host's local stream once the studio video element is mounted
  useEffect(() => {
    if (!inShow || !pendingLocalStream) return;
    if (localVideoRef.current) localVideoRef.current.srcObject = pendingLocalStream;
    setPendingLocalStream(null);
  }, [inShow, pendingLocalStream]);

  const loadShow = async () => {
    try {
      const [showRes, balanceRes, interestRes] = await Promise.all([
        api.get(`/api/shows/${id}`),
        api.get('/api/coins/balance').catch(() => ({ data: { coins: 0 } })),
        api.get(`/api/shows/${id}/interest`).catch(() => ({ data: { interested: false, interest_count: 0 } })),
      ]);
      const s = showRes.data.show;

      // El host gestiona su show desde /studio — redirigir si el show está activo
      if (s.is_host && s.status === 'live') {
        navigate('/studio', { replace: true });
        return;
      }

      setShow(s);
      setViewerCount(s.viewer_count || 0);
      setCoinBalance(balanceRes.data.coins || 0);
      setInterested(interestRes.data.interested);
      setInterestCount(interestRes.data.interest_count || 0);
      // Banner publicitario para espectadores gratuitos (no para el host)
      if (s.host?.id !== user?.id) showBottomBanner();
    } catch (err) {
      if (err.response?.data?.code === 'AGE_VERIFICATION_REQUIRED') {
        setShowAgeModal(true);
        setLoading(false);
        return;
      }
      toast.error('Show no encontrado');
      navigate('/shows');
    } finally {
      setLoading(false);
    }
  };

  const loadTippers = async () => {
    try {
      const { data } = await api.get(`/api/shows/${id}/tippers`);
      setTippers(data.tippers || []);
    } catch {}
  };

  // ── Supabase Realtime: chat + reacciones + presencia ─────────────────────────
  const addGiftAnimation = useCallback((emoji, senderName) => {
    const gid = `${Date.now()}-${Math.random()}`;
    setGiftAnimations(prev => [...prev, { id: gid, emoji, senderName }]);
    setTimeout(() => setGiftAnimations(prev => prev.filter(g => g.id !== gid)), 3000);
    loadTippers();
  }, []);

  const joinShowChannel = useCallback((showId, role = 'viewer') => {
    const ch = supabase.channel(`show:${showId}`, {
      config: { presence: { key: user?.id || 'anon' } },
    })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count);
        // Build viewer list from presence data
        const list = Object.values(state).flatMap(v => v).filter(Boolean);
        setViewerList(list);
        setPeakViewers(prev => {
          if (count > prev) {
            if ([10, 50, 100, 500].includes(count))
              toast(`🎉 ¡${count} viewers!`, { duration: 4000 });
            return count;
          }
          return prev;
        });
      })
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        setChatMessages(prev => [...prev.slice(-79), payload]);
      })
      .on('broadcast', { event: 'react' }, ({ payload }) => {
        addReaction(payload.emoji);
      })
      .on('broadcast', { event: 'gift' }, ({ payload }) => {
        addGiftAnimation(payload.emoji, payload.senderName);
        if (role === 'host') setTotalCoinsEarned(c => c + Math.round((payload.coins || 0) * 0.7));
      })
      .on('broadcast', { event: 'show_ended' }, () => {
        if (role !== 'host') {
          toast('El show terminó', { icon: '📺' });
          navigate('/shows');
        }
      })
      .on('broadcast', { event: 'private_request' }, ({ payload }) => {
        if (role === 'host') setPrivateRequest(payload);
      })
      .on('broadcast', { event: 'private_accept' }, ({ payload }) => {
        if (role === 'viewer' && payload.viewerId === user?.id) {
          setPrivateSession({ type: payload.type, rate: payload.rate, startTime: Date.now() });
          setPrivateBalance(coinBalance);
          setPrivateMinutes(0);
          startPrivateTick(payload.type, payload.rate);
          toast.success(`¡Show privado iniciado! ${payload.rate} coins/min`);
        }
      })
      .on('broadcast', { event: 'private_decline' }, ({ payload }) => {
        if (role === 'viewer' && payload.viewerId === user?.id) {
          toast('El host declinó tu solicitud privada', { icon: '❌' });
        }
      })
      .on('broadcast', { event: 'private_end' }, ({ payload }) => {
        if (role === 'viewer' && privateSession) {
          clearInterval(privateTickRef.current);
          setPrivateSession(null);
          toast('Show privado terminado por el host', { icon: '📴' });
        }
        if (role === 'host') setPrivateRequest(null);
      })
      .on('broadcast', { event: 'dm' }, ({ payload }) => {
        if (role === 'host' || payload.fromId === user?.id || payload.toId === user?.id) {
          setPrivateMessages(prev => [...prev.slice(-99), payload]);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            userId:  user?.id,
            role,
            ts:      Date.now(),
            name:    authProfile?.full_name  || 'Anónimo',
            avatar:  authProfile?.avatar_url || null,
            tier:    authProfile?.premium_tier || 'basic',
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
    if (now - lastChatSentRef.current < 1500) {
      toast.error('Espera un momento antes de enviar otro mensaje', { id: 'chat-throttle' });
      return;
    }
    lastChatSentRef.current = now;
    setChatInput('');
    const msg = {
      text,
      name: authProfile?.full_name || 'Anónimo',
      avatar: authProfile?.avatar_url || null,
      userId: user?.id,
      ts: Date.now(),
    };
    await chatChannelRef.current.send({ type: 'broadcast', event: 'msg', payload: msg });
    setChatMessages(prev => [...prev.slice(-79), msg]);
  };

  const sendDM = async () => {
    const text = dmInput.trim();
    if (!text || !chatChannelRef.current) return;
    const msg = {
      fromId:     user?.id,
      fromName:   authProfile?.full_name  || 'Anónimo',
      fromAvatar: authProfile?.avatar_url || null,
      toId:       show?.host?.id,
      text,
      ts: Date.now(),
    };
    await chatChannelRef.current.send({ type: 'broadcast', event: 'dm', payload: msg });
    setPrivateMessages(prev => [...prev, msg]);
    setDmInput('');
    setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const sendReaction = async (emoji) => {
    addReaction(emoji);
    chatChannelRef.current?.send({ type: 'broadcast', event: 'react', payload: { emoji } });
  };

  const addReaction = (emoji) => {
    const rid = `${Date.now()}-${Math.random()}`;
    setReactions(prev => [...prev, { id: rid, emoji, x: Math.random() * 40 - 20 }]);
    setTotalReactions(n => n + 1);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2600);
  };

  // ── Preview stream helpers ────────────────────────────────────────────────────
  const cleanupPreviewTracks = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
  };

  const enumerateDevices = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(devs.filter(d => d.kind === 'videoinput'));
      setMicDevices(devs.filter(d => d.kind === 'audioinput'));
    } catch {}
  };

  // ── Pre-show ──────────────────────────────────────────────────────────────────
  const enterPreShow = async () => {
    cleanupPreviewTracks();
    previewStreamRef.current = new MediaStream();
    setPreShow(true);
    setPermCamera('checking');
    setPermMic('checking');

    const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];

    // Try camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId
          ? { deviceId: { exact: selectedCameraId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps }
          : { width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
      });
      stream.getVideoTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermCamera('granted');
    } catch (err) {
      setPermCamera(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
    }

    // Try mic (store track so we can use it when going live)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });
      stream.getAudioTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermMic('granted');
    } catch (err) {
      setPermMic(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
    }

    await enumerateDevices();
  };

  const cancelPreShow = () => {
    cleanupPreviewTracks();
    setPreShow(false);
    setPermCamera('idle');
    setPermMic('idle');
  };

  const switchCamera = async (deviceId) => {
    setSelectedCameraId(deviceId);
    if (previewStreamRef.current) {
      previewStreamRef.current.getVideoTracks().forEach(t => { t.stop(); previewStreamRef.current.removeTrack(t); });
    }
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
    if (previewStreamRef.current) {
      previewStreamRef.current.getAudioTracks().forEach(t => { t.stop(); previewStreamRef.current.removeTrack(t); });
    }
    setPermMic('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      stream.getAudioTracks().forEach(t => previewStreamRef.current.addTrack(t));
      setPermMic('granted');
    } catch { setPermMic('denied'); }
  };

  // ── Countdown 3-2-1 → go live ────────────────────────────────────────────────
  const startCountdown = () => {
    if (permMic !== 'granted') { toast.error('Se necesita micrófono para iniciar'); return; }
    setCountdown(3);
    let n = 3;
    const t = setInterval(() => {
      n--;
      if (n > 0) {
        setCountdown(n);
      } else {
        clearInterval(t);
        setCountdown(null);
        handleStartShow();
      }
    }, 1000);
  };

  // ── Iniciar show (host) ───────────────────────────────────────────────────────
  const handleStartShow = async () => {
    setJoining(true);
    try {
      await api.post(`/api/shows/${id}/start`);

      const roomId = `show_${id.replace(/-/g, '')}`;

      // Transfer preview stream to live stream
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
      setPendingLocalStream(stream);

      // Init LiveKit and publish — skipAutoMedia: host already has the stream from pre-show
      const rtc = new LiveKitSession(roomId);
      rtcRef.current = rtc;
      await rtc.join(true, { skipAutoMedia: true });
      await rtc.publishStream(stream);

      // VU meter via Web Audio API
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
      setInShow(true);
      setPreShow(false);
      setShowChat(true);
      liveTimerRef.current = setInterval(() => setLiveDuration(d => d + 1), 1000);
      toast.success('¡Estás en vivo!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar el show');
    } finally {
      setJoining(false);
    }
  };

  // ── Comprar ticket ────────────────────────────────────────────────────────────
  const handleBuyTicket = async () => {
    try {
      const { data } = await api.post(`/api/shows/${id}/ticket`);
      setPaymentModal({
        clientSecret: data.clientSecret,
        amount: `$${show.ticket_price}`,
        description: `Ticket · ${show.title}`,
        onSuccess: async (piId) => {
          await api.post(`/api/shows/${id}/ticket/confirm`, { paymentIntentId: piId });
          setPaymentModal(null);
          toast.success('Ticket comprado! Uniéndote al show…');
          await loadShow();
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al comprar el ticket');
    }
  };

  // ── Unirse como viewer ────────────────────────────────────────────────────────
  const handleJoinAsViewer = async () => {
    setJoining(true);
    try {
      await api.get(`/api/shows/${id}/token`);
      const roomId = `show_${id.replace(/-/g, '')}`;

      const rtc = new LiveKitSession(roomId);

      // Use pendingViewerTracks so the useEffect applies tracks once
      // hostVideoRef.current is mounted (inShow=true re-render).
      rtc.onRemoteTrack = (track) => {
        if (track.kind === 'video') {
          setPendingViewerTracks(prev => ({ ...(prev || {}), video: track.mediaStreamTrack }));
        }
        if (track.kind === 'audio') {
          setPendingViewerTracks(prev => ({ ...(prev || {}), audio: track.mediaStreamTrack }));
        }
      };

      rtc.onParticipantLeft = () => {
        toast('El show terminó', { icon: '📺' });
        navigate('/shows');
      };

      rtcRef.current = rtc;
      await rtc.join(false); // viewer: subscribe only

      joinShowChannel(id, 'viewer');
      setInShow(true);
      setShowChat(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al unirse al show');
    } finally {
      setJoining(false);
    }
  };

  const leaveShow = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    await rtcRef.current?.leave().catch(() => {});
    rtcRef.current = null;
  };

  const handleEndShow = async () => {
    isLiveRef.current = false; // prevent double-end from cleanup on unmount
    clearInterval(liveTimerRef.current);
    clearInterval(audioLevelRef.current);
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    // 1. Mark as ended in DB FIRST — so viewers land on correct status
    try { await api.post(`/api/shows/${id}/end`); } catch {}
    // 2. Notify viewers via Supabase channel before disconnecting LiveKit
    await chatChannelRef.current?.send({
      type: 'broadcast', event: 'show_ended', payload: {},
    }).catch(() => {});
    // 3. Then disconnect LiveKit and leave channels
    leaveShowChannel();
    await leaveShow();
    toast.success('Show terminado');
    navigate('/shows');
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

  const handleShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/shows/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado al portapapeles 🔗');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  const handleSavePinnedMessage = () => {
    setPinnedMessage(pinnedInput.trim());
    setShowPinInput(false);
    if (pinnedInput.trim()) toast.success('Mensaje fijado');
    else toast('Mensaje fijado eliminado');
  };

  const handleLeave = async () => {
    leaveShowChannel();
    await leaveShow();
    navigate('/shows');
  };

  const handleSendTip = async (coins) => {
    setSendingTip(coins);
    try {
      await api.post(`/api/shows/${id}/tip`, { coins, message: tipMessage });
      toast.success(`¡${coins} coins enviados!`);
      setTipMessage('');
      setShowTips(false);
      setLatestTip({ coins, message: tipMessage });
      setTimeout(() => setLatestTip(null), 4000);
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error('Saldo insuficiente. Compra coins primero.');
      } else {
        toast.error(err.response?.data?.error || 'Error al enviar propina');
      }
    } finally {
      setSendingTip(null);
    }
  };

  const toggleMute = () => {
    rtcRef.current?.setMic(muted); // muted=false → setMic(false) = mute
    setMuted(v => !v);
  };

  const toggleCamera = () => {
    rtcRef.current?.setCam(cameraOff); // cameraOff=false → setCam(false) = turn off
    setCameraOff(v => !v);
  };

  const fmtDuration = (s) =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

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

  // ── Show privado ─────────────────────────────────────────────────────────────
  const startPrivateTick = (type, rate) => {
    clearInterval(privateTickRef.current);
    privateTickRef.current = setInterval(async () => {
      try {
        const { data } = await api.post(`/api/shows/${id}/private/tick`, { type });
        setPrivateBalance(data.remaining);
        setPrivateMinutes(m => m + 1);
        if (data.remaining < rate) {
          endPrivateSession('balance');
        }
      } catch (err) {
        if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
          endPrivateSession('balance');
        }
      }
    }, 60000); // cada 60 segundos
  };

  const endPrivateSession = (reason = 'manual') => {
    clearInterval(privateTickRef.current);
    privateTickRef.current = null;
    setPrivateSession(null);
    setPrivateMinutes(0);
    if (reason === 'balance') toast.error('Show privado terminado: saldo insuficiente');
    else if (reason === 'host') toast('El host terminó el show privado', { icon: '📴' });
    else toast('Show privado terminado');
    chatChannelRef.current?.send({
      type: 'broadcast', event: 'private_end', payload: { reason },
    }).catch(() => {});
  };

  const handleRequestPrivate = async (type) => {
    setPrivateModal(false);
    let rate;
    try {
      const { data } = await api.post(`/api/shows/${id}/private/validate`, { type });
      rate = data.rate;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Saldo insuficiente');
      return;
    }
    chatChannelRef.current?.send({
      type: 'broadcast',
      event: 'private_request',
      payload: {
        viewerId: user?.id,
        viewerName: authProfile?.full_name || 'Alguien',
        viewerAvatar: authProfile?.avatar_url || null,
        type,
        rate,
      },
    }).catch(() => {});
    toast('Solicitud enviada, esperando al host…', { icon: '⏳' });
  };

  const handleAcceptPrivate = () => {
    if (!privateRequest) return;
    chatChannelRef.current?.send({
      type: 'broadcast',
      event: 'private_accept',
      payload: {
        viewerId: privateRequest.viewerId,
        type: privateRequest.type,
        rate: privateRequest.rate,
        hostName: authProfile?.full_name || 'El host',
      },
    }).catch(() => {});
    setPrivateRequest(null);
    toast.success(`Show privado iniciado con ${privateRequest.viewerName}`);
  };

  const handleDeclinePrivate = () => {
    if (!privateRequest) return;
    chatChannelRef.current?.send({
      type: 'broadcast',
      event: 'private_decline',
      payload: { viewerId: privateRequest.viewerId },
    }).catch(() => {});
    setPrivateRequest(null);
    toast('Solicitud privada rechazada');
  };

  // Cleanup private tick on unmount
  useEffect(() => () => clearInterval(privateTickRef.current), []);

  const handleGiftSent = (giftType, emoji) => {
    const GIFT_COINS = { rose: 10, heart: 50, diamond: 200, crown: 500 };
    setCoinBalance(b => Math.max(0, b - (GIFT_COINS[giftType] || 0)));
    chatChannelRef.current?.send({
      type: 'broadcast', event: 'gift',
      payload: { emoji, senderName: authProfile?.full_name || 'Alguien', coins: GIFT_COINS[giftType] || 0 },
    }).catch(() => {});
    addGiftAnimation(emoji, authProfile?.full_name || 'Tú');
  };

  const handleToggleInterest = async () => {
    setTogglingInterest(true);
    try {
      const { data } = await api.post(`/api/shows/${id}/interest`);
      setInterested(data.interested);
      setInterestCount(c => data.interested ? c + 1 : Math.max(0, c - 1));
      toast.success(data.interested ? '¡Te avisaremos cuando empiece!' : 'Interés eliminado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setTogglingInterest(false);
    }
  };

  const handleBanUser = async (msg) => {
    if (!msg.userId) return;
    try {
      await api.post(`/api/shows/${id}/ban/${msg.userId}`);
      setChatMessages(prev => prev.filter(m => m.userId !== msg.userId));
      setBannedUsers(prev => new Map(prev).set(msg.userId, msg.name));
      toast.success(`${msg.name} baneado del chat`);
    } catch {
      toast.error('Error al banear');
    }
  };

  const handleUnbanUser = async (userId, name) => {
    try {
      await api.delete(`/api/shows/${id}/ban/${userId}`);
      setBannedUsers(prev => { const m = new Map(prev); m.delete(userId); return m; });
      toast.success(`${name} desbaneado`);
    } catch {
      toast.error('Error al desbanear');
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: show?.title || 'Show en vivo',
      text: `Mira el show de ${show?.host?.full_name} en Destino`,
      url: window.location.href,
    };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
      toast.success('Link copiado');
    }
  };

  // ── Age gate ─────────────────────────────────────────────────────────────────
  if (showAgeModal) {
    return (
      <AgeVerificationModal
        onVerified={() => { setShowAgeModal(false); setLoading(true); loadShow(); }}
        onClose={() => navigate('/shows')}
      />
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isHost      = show?.is_host;
  const hasTicket   = show?.has_ticket;
  const needsTicket = show?.ticket_price > 0 && !hasTicket && !isHost;

  // ── Overlay 3-2-1 ────────────────────────────────────────────────────────────
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <AnimatePresence mode="wait">
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <p className="text-white/50 text-xl mb-2">Comenzando en</p>
            <p className="text-white font-black" style={{ fontSize: '10rem', lineHeight: 1 }}>{countdown}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ── PRE-SHOW ──────────────────────────────────────────────────────────────────
  if (preShow) {
    const checked   = permCamera !== 'idle' && permCamera !== 'checking' &&
                      permMic    !== 'idle' && permMic    !== 'checking';
    const canGoLive = permMic === 'granted';
    const anyDenied = permCamera === 'denied' || permMic === 'denied';

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-white/5">
          <button onClick={cancelPreShow} className="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition-colors">← Cancelar</button>
          <span className="text-white text-sm font-semibold">Preparando show</span>
          <div className="w-20" />
        </div>

        <div className="flex-1 px-4 pt-4 pb-2 space-y-4 overflow-y-auto">
          {/* Preview cámara */}
          <div className="relative bg-dark-800 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
            {permCamera === 'granted' ? (
              <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            ) : permCamera === 'checking' ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Accediendo a la cámara…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <FiVideoOff className="text-gray-600" size={44} />
                <p className="text-gray-500 text-sm text-center px-4">
                  {permCamera === 'denied' ? 'Cámara denegada · Solo audio' : 'Sin cámara · Solo audio'}
                </p>
              </div>
            )}
            {checked && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-3 flex-wrap">
                <DevicePill status={permCamera} label="Cámara"    icon={FiVideo} />
                <DevicePill status={permMic}    label="Micrófono" icon={FiMic}   />
              </div>
            )}
            {permCamera === 'granted' && (
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md tracking-wide">PREVIEW</div>
            )}
          </div>

          {cameraDevices.length > 1 && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Cámara</label>
              <select value={selectedCameraId} onChange={e => switchCamera(e.target.value)} className="input-field text-sm py-2 bg-dark-700">
                {cameraDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${d.deviceId.slice(0, 8)}…`}</option>)}
              </select>
            </div>
          )}
          {micDevices.length > 1 && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Micrófono</label>
              <select value={selectedMicId} onChange={e => switchMic(e.target.value)} className="input-field text-sm py-2 bg-dark-700">
                {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono ${d.deviceId.slice(0, 8)}…`}</option>)}
              </select>
            </div>
          )}

          {anyDenied && (
            <div className="card p-4 border-yellow-500/20 bg-yellow-500/5 flex gap-3">
              <FiAlertCircle className="text-yellow-400 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-yellow-400 text-xs font-medium mb-1">Permisos denegados</p>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Permite el acceso a {permCamera === 'denied' && permMic === 'denied' ? 'cámara y micrófono' : permCamera === 'denied' ? 'la cámara' : 'el micrófono'} en la configuración del navegador, luego haz clic en <strong className="text-yellow-300">Reintentar</strong>.
                </p>
              </div>
            </div>
          )}

          {isDesktop && <OBSGuide />}

          {checked && (
            <button onClick={enterPreShow} className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-white text-sm py-2 transition-colors">
              <FiRefreshCw size={13} /> Reintentar dispositivos
            </button>
          )}
        </div>

        <div className="px-4 pb-8 pt-3 border-t border-white/5 space-y-3">
          {/* Calidad de video */}
          {permCamera === 'granted' && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Calidad de video</label>
              <div className="grid grid-cols-3 gap-2">
                {QUALITY_OPTIONS.map(q => (
                  <button key={q.key} onClick={() => setVideoQuality(q.key)}
                    className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                      videoQuality === q.key
                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                        : 'bg-dark-700 border-white/5 text-gray-400 hover:bg-dark-600'
                    }`}
                  >
                    <p className="font-bold">{q.label}</p>
                    <p className="text-[10px] opacity-60">{q.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!checked ? (
            <button onClick={enterPreShow} className="btn-primary w-full flex items-center justify-center gap-2">
              <FiCamera size={16} /> Verificar cámara y micrófono
            </button>
          ) : (
            <button onClick={startCountdown} disabled={!canGoLive || joining} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {joining
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><span className="w-2 h-2 bg-white rounded-full animate-pulse" /> {canGoLive ? 'Ir en vivo' : 'Se necesita micrófono'}</>
              }
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── ESTUDIO DEL HOST ─────────────────────────────────────────────────────────
  if (inShow && isHost) {
    const totalTipCoins = tippers.reduce((s, t) => s + t.coins_total, 0);
    const tipGoalPct = show?.tip_goal > 0
      ? Math.min(100, (totalTipCoins / (show.tip_goal * 20)) * 100)
      : 0;

    return (
      <div className="fixed inset-0 bg-dark-900 flex flex-col lg:flex-row overflow-hidden">

        {/* ── COLUMNA IZQUIERDA: cámara + controles ── */}
        <div className="flex flex-col lg:flex-1 relative min-w-0">

          {/* Header del estudio */}
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
              <button onClick={handleShareLink} className="w-7 h-7 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors ml-1" title="Copiar link del show">
                <FiCopy size={12} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Preview de cámara */}
          <div className="relative bg-black flex-1 lg:min-h-0">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

            {/* Overlay si cámara apagada */}
            {cameraOff && (
              <div className="absolute inset-0 bg-dark-900 flex flex-col items-center justify-center">
                <FiVideoOff className="text-gray-600 mb-2" size={48} />
                <p className="text-gray-500 text-sm">Cámara apagada</p>
              </div>
            )}

            {/* Tip goal bar */}
            {show?.tip_goal > 0 && (
              <div className="absolute bottom-3 left-3 right-3">
                <motion.div
                  className="bg-black/80 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10"
                  animate={tipGoalPct >= 100 ? { scale: [1, 1.03, 1], borderColor: ['rgba(255,255,255,0.1)', 'rgba(234,179,8,0.5)', 'rgba(255,255,255,0.1)'] } : {}}
                  transition={{ duration: 0.6, repeat: tipGoalPct >= 100 ? Infinity : 0, repeatDelay: 2 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-[10px] font-bold flex items-center gap-1">
                      <FiZap size={9} className="text-yellow-400" />
                      {tipGoalPct >= 100 ? '🎉 ¡Meta alcanzada!' : 'Meta de propinas'}
                    </span>
                    <span className="text-yellow-400 text-[10px] font-bold">{totalTipCoins} / {show.tip_goal * 20} ⚡</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${tipGoalPct >= 100 ? 'bg-gradient-to-r from-yellow-400 via-orange-400 to-brand-500' : 'bg-gradient-to-r from-yellow-500 to-brand-500'}`}
                      animate={{ width: `${tipGoalPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              </div>
            )}

            {/* Animaciones de regalos */}
            <div className="absolute top-4 left-4 pointer-events-none z-10">
              <AnimatePresence>
                {giftAnimations.map(g => (
                  <motion.div key={g.id}
                    initial={{ opacity: 1, y: 0, scale: 0.8 }}
                    animate={{ opacity: 0, y: -100, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.4, ease: 'easeOut' }}
                    className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 mb-1"
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="text-white text-xs font-medium">{g.senderName}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Controles del estudio ── */}
          <div className="bg-dark-800 border-t border-white/5 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between gap-3">

              {/* Terminar — izquierda */}
              <button onClick={handleEndShow}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shrink-0"
              >
                <FiX size={14} /> Terminar
              </button>

              {/* Controles de video — derecha */}
              <div className="flex items-center gap-2">

                {/* Mic */}
                <button onClick={toggleMute} title={muted ? 'Activar micrófono' : 'Silenciar'}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${muted ? 'bg-red-500/30 border border-red-500/60 text-red-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                >
                  {muted ? <FiMicOff size={16} /> : <FiMic size={16} />}
                </button>

                {/* VU meter */}
                <div className="flex items-end gap-px shrink-0" style={{ height: 12 }}>
                  {[0.1, 0.3, 0.55, 0.3, 0.1].map((thr, i) => (
                    <div key={i}
                      className={`w-1 rounded-sm transition-colors duration-75 ${!muted && audioLevel > thr ? 'bg-green-400' : 'bg-white/15'}`}
                      style={{ height: [4, 7, 12, 7, 4][i] }}
                    />
                  ))}
                </div>

                {/* Cámara */}
                <button onClick={toggleCamera} title={cameraOff ? 'Activar cámara' : 'Apagar cámara'}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${cameraOff ? 'bg-red-500/30 border border-red-500/60 text-red-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                >
                  {cameraOff ? <FiVideoOff size={16} /> : <FiVideo size={16} />}
                </button>

                {/* Compartir pantalla */}
                {isDesktop && (
                  <button onClick={toggleScreenShare} title={screenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${screenSharing ? 'bg-blue-500/30 border border-blue-500/60 text-blue-400' : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'}`}
                  >
                    <FiMonitor size={16} />
                  </button>
                )}

                {/* Device selects */}
                {cameraDevices.length > 1 && (
                  <select value={selectedCameraId} onChange={e => switchLiveCamera(e.target.value)}
                    className="bg-white/10 border border-white/20 text-white text-[11px] rounded-xl px-2 py-2 outline-none max-w-[110px] truncate cursor-pointer"
                  >
                    {cameraDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Cam ${d.deviceId.slice(0,5)}`}</option>
                    ))}
                  </select>
                )}
                {micDevices.length > 1 && (
                  <select value={selectedMicId} onChange={e => switchLiveMic(e.target.value)}
                    className="bg-white/10 border border-white/20 text-white text-[11px] rounded-xl px-2 py-2 outline-none max-w-[110px] truncate cursor-pointer"
                  >
                    {micDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Notificación de solicitud privada (host) */}
        <AnimatePresence>
          {privateRequest && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
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
                <button
                  onClick={handleAcceptPrivate}
                  className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
                >
                  Aceptar
                </button>
                <button
                  onClick={handleDeclinePrivate}
                  className="flex-1 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-gray-300 text-sm font-semibold transition-colors"
                >
                  Rechazar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── COLUMNA DERECHA: stats + chat ── */}
        <div className="w-full lg:w-80 flex flex-col bg-dark-800 border-t border-white/5 lg:border-t-0 lg:border-l shrink-0" style={{ height: '100dvh' }}>

          {/* Stats rápidos */}
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

          {/* Tabs del panel derecho */}
          <div className="flex border-b border-white/5 shrink-0">
            {[
              { key: 'public',  label: 'Público' },
              { key: 'private', label: `Privado${privateMessages.length > 0 ? ` (${privateMessages.length})` : ''}` },
              { key: 'viewers', label: `${viewerCount} 👥` },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setRightTab(t.key)}
                className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                  rightTab === t.key
                    ? 'text-white border-brand-500'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB: Público (chat) */}
          {rightTab === 'public' && (
            <>
              {/* Top tippers */}
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

              {/* Mensaje fijado */}
              <AnimatePresence>
                {pinnedMessage && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden shrink-0"
                  >
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

              {/* Chat */}
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

              {/* Toolbar del host: Fijar y Moderar */}
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

                {/* Panel de mensaje fijado */}
                <AnimatePresence>
                  {showPinInput && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-2"
                    >
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-dark-700 border border-white/10 text-white text-xs rounded-xl px-3 py-2 placeholder-gray-500 outline-none"
                          placeholder="Mensaje a fijar en el chat…"
                          value={pinnedInput}
                          onChange={e => setPinnedInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSavePinnedMessage()}
                          maxLength={100}
                        />
                        <button onClick={handleSavePinnedMessage}
                          className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs rounded-xl font-medium transition-colors"
                        >Fijar</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Panel de moderación */}
                <AnimatePresence>
                  {showModeration && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-2"
                    >
                      <div className="bg-dark-700 rounded-xl p-3 max-h-40 overflow-y-auto">
                        <p className="text-xs font-bold text-white mb-2 flex items-center gap-1"><FiSlash size={10} className="text-red-400" /> Chat reciente</p>
                        {chatMessages.length === 0
                          ? <p className="text-gray-600 text-xs text-center py-1">Sin mensajes aún</p>
                          : chatMessages.slice(-10).reverse().map((msg, i) => (
                            <div key={i} className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0">
                              <span className="text-white text-xs flex-1 truncate">
                                <span className="text-brand-300 font-medium">{msg.name}:</span> {msg.text}
                              </span>
                              {msg.userId && msg.userId !== user?.id && !bannedUsers.has(msg.userId) && (
                                <button onClick={() => handleBanUser(msg)}
                                  className="w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center shrink-0"
                                  title="Banear"
                                ><FiSlash size={10} className="text-red-400" /></button>
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
                              <button onClick={() => handleUnbanUser(uid, name)}
                                className="w-6 h-6 rounded-full bg-green-500/20 hover:bg-green-500/40 flex items-center justify-center shrink-0"
                                title="Desbanear"
                              ><FiRotateCw size={10} className="text-green-400" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Input del chat */}
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
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB: Privado (DMs de viewers) */}
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
                <div ref={dmEndRef} />
              </div>
              <div className="px-3 py-2 border-t border-white/5 shrink-0">
                <p className="text-gray-600 text-[10px] text-center">Mensajes privados de los espectadores</p>
              </div>
            </>
          )}

          {/* TAB: Viewers (lista de espectadores) */}
          {rightTab === 'viewers' && (
            <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
              {/* Resumen */}
              <div className="bg-dark-700/50 rounded-xl p-3 mb-3">
                <p className="text-white font-bold text-sm mb-1.5">{viewerCount} viendo ahora</p>
                <div className="space-y-0.5">
                  {(() => {
                    const vipC     = viewerList.filter(v => v.tier === 'vip').length;
                    const premC    = viewerList.filter(v => v.tier === 'premium').length;
                    const basicC   = viewerList.filter(v => !v.tier || v.tier === 'basic').length;
                    return (
                      <>
                        {vipC  > 0 && <p className="text-[11px] text-yellow-400 flex items-center gap-1">👑 Usuarios VIP: {vipC}</p>}
                        {premC > 0 && <p className="text-[11px] text-brand-400 flex items-center gap-1">⭐ Premium: {premC}</p>}
                        {basicC > 0 && <p className="text-[11px] text-gray-500">Básico: {basicC}</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
              {/* Lista individual */}
              <div className="space-y-1.5">
                {viewerList.filter(v => v.role === 'viewer').map((v, i) => (
                  <div key={v.userId || i} className="flex items-center gap-2">
                    {v.avatar
                      ? <img src={v.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                      : <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(v.name || '?')[0]}
                        </div>
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

  // ── Componente de panel lateral para viewer (desktop) ──────────────────────
  const ViewerSidePanel = () => (
    <div className="w-80 flex flex-col bg-dark-800 border-l border-white/5 shrink-0" style={{ height: '100dvh' }}>
      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {[
          { key: 'public',  label: 'Público' },
          { key: 'private', label: `Privado${privateMessages.filter(m => m.fromId !== user?.id).length > 0 ? ' •' : ''}` },
          { key: 'viewers', label: `${viewerCount} 👥` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setRightTab(t.key)}
            className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2 ${
              rightTab === t.key
                ? 'text-white border-brand-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Público */}
      {rightTab === 'public' && (
        <>
          {/* Mensaje fijado */}
          {pinnedMessage && (
            <div className="px-3 py-2 bg-brand-500/10 border-b border-brand-500/20 flex items-start gap-2 shrink-0">
              <FiBookmark size={11} className="text-brand-400 shrink-0 mt-0.5" />
              <p className="text-brand-200 text-xs leading-tight">{pinnedMessage}</p>
            </div>
          )}
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
          <div className="px-3 py-3 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2 border border-white/5">
              <input
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
                placeholder="Escribe un mensaje…"
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
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* TAB: Privado (DM al host) */}
      {rightTab === 'private' && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {privateMessages.length === 0
              ? <p className="text-gray-600 text-xs text-center py-8">Envía un mensaje privado al host</p>
              : privateMessages.map((msg, i) => {
                  const isMine = msg.fromId === user?.id;
                  return (
                    <div key={i} className={`flex items-start gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                      {!isMine && (
                        msg.fromAvatar
                          ? <img src={msg.fromAvatar} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                          : <div className="w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px] text-purple-300">{(msg.fromName||'?')[0]}</div>
                      )}
                      <div className={`rounded-xl px-2.5 py-1.5 max-w-[80%] ${isMine ? 'bg-brand-600/40 border border-brand-500/30' : 'bg-purple-900/30 border border-purple-500/20'}`}>
                        {!isMine && <span className="text-purple-300 text-[10px] font-semibold block">{msg.fromName}</span>}
                        <p className="text-white text-xs leading-tight break-words">{msg.text}</p>
                      </div>
                    </div>
                  );
                })
            }
            <div ref={dmEndRef} />
          </div>
          <div className="px-3 py-3 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2 border border-purple-500/20">
              <input
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
                placeholder="Mensaje privado al host…"
                value={dmInput}
                onChange={e => setDmInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendDM()}
                maxLength={120}
              />
              <button onClick={sendDM} disabled={!dmInput.trim()}
                className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                <FiSend size={12} className="text-white" />
              </button>
            </div>
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
                    {vipC  > 0 && <p className="text-[11px] text-yellow-400">👑 Usuarios VIP: {vipC}</p>}
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
  );

  // ── EN SHOW (VIEWER) ──────────────────────────────────────────────────────────
  if (inShow) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col lg:flex-row">

        {/* Video principal */}
        <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex-1 relative bg-dark-900 overflow-hidden">
          <video ref={hostVideoRef} autoPlay playsInline className="w-full h-full object-cover" />

          {/* Info overlay top */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-sm font-medium truncate max-w-[160px]">{show?.title}</span>
            </div>
            <div className="flex items-center gap-2">
              {connState !== 'connected' && (
                <div className="bg-black/50 backdrop-blur-sm rounded-xl px-2 py-2">
                  {connState === 'reconnecting'
                    ? <FiWifi className="text-yellow-400 animate-pulse" size={14} />
                    : <FiWifiOff className="text-red-400" size={14} />
                  }
                </div>
              )}
              <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-1">
                <FiUsers size={12} className="text-gray-300" />
                <span className="text-gray-300 text-sm">{viewerCount}</span>
              </div>
            </div>
          </div>

          {/* Chat flotante (solo móvil — desktop lo tiene en side panel) */}
          {!isDesktop && showChat && (
            <div className="absolute bottom-0 left-0 right-0 pb-[72px] px-3 pointer-events-none">
              <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-hide">
                {chatMessages.slice(-20).map((msg, i) => (
                  <div key={i} className="flex items-start gap-2 pointer-events-auto">
                    {msg.avatar
                      ? <img src={msg.avatar} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                      : <div className="w-5 h-5 rounded-full bg-brand-500/30 shrink-0 mt-0.5" />
                    }
                    <div className="bg-black/60 backdrop-blur-sm rounded-xl px-2.5 py-1 max-w-[85%]">
                      <span className="text-brand-300 text-[10px] font-semibold">{msg.name}</span>
                      <p className="text-white text-xs leading-tight">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}

          {/* Tip goal bar */}
          {show?.tip_goal > 0 && (() => {
            const tipTotal = tippers.reduce((s, t) => s + t.coins_total, 0);
            const tipPct = Math.min(100, (tipTotal / (show.tip_goal * 20)) * 100);
            return (
              <div className="absolute top-16 left-4 right-4 z-10">
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-[10px] font-bold flex items-center gap-1">
                      <FiZap size={9} className="text-yellow-400" />
                      {tipPct >= 100 ? '🎉 ¡Meta!' : 'Meta de propinas'}
                    </span>
                    <span className="text-yellow-400 text-[10px] font-bold">{tipTotal} / {show.tip_goal * 20} ⚡</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${tipPct >= 100 ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gradient-to-r from-yellow-500 to-brand-500'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${tipPct}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Gift animations */}
          <div className="absolute bottom-20 left-4 pointer-events-none z-20">
            <AnimatePresence>
              {giftAnimations.map(g => (
                <motion.div key={g.id}
                  initial={{ opacity: 1, y: 0, scale: 0.8 }}
                  animate={{ opacity: 0, y: -140, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.6, ease: 'easeOut' }}
                  className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 mb-1"
                >
                  <span className="text-xl">{g.emoji}</span>
                  <span className="text-white text-xs font-medium">{g.senderName}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Leaderboard */}
          <AnimatePresence>
            {showLeaderboard && tippers.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
                className="absolute top-16 right-3 bg-dark-800/90 backdrop-blur-md rounded-2xl p-3 z-20 border border-white/10 w-44"
              >
                <p className="text-white text-[11px] font-bold mb-2 flex items-center gap-1"><FiAward size={11} className="text-yellow-400" /> Top Propinas</p>
                {tippers.slice(0, 3).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black" style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32' }}>#{i+1}</span>
                    <img src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.full_name||'U')}&size=40&background=1a1a2e&color=f43f5e`}
                      className="w-5 h-5 rounded-full object-cover shrink-0" alt="" />
                    <span className="text-white text-[10px] truncate flex-1">{t.full_name}</span>
                    <span className="text-yellow-400 text-[10px] font-bold shrink-0">⚡{t.coins_total}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating reactions */}
          <div className="absolute bottom-20 right-4 pointer-events-none">
            <AnimatePresence>
              {reactions.map(r => (
                <motion.div key={r.id}
                  initial={{ opacity: 1, y: 0, x: r.x, scale: 1 }}
                  animate={{ opacity: 0, y: -180, x: r.x + (Math.random() - 0.5) * 30, scale: 1.3 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.4, ease: 'easeOut' }}
                  className="text-3xl absolute bottom-0 right-0"
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Tip recibido */}
        <AnimatePresence>
          {latestTip && (
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black rounded-2xl px-4 py-2 flex items-center gap-2 z-30"
            >
              <FiZap size={16} />
              <span className="font-bold text-sm">{latestTip.coins} coins</span>
              {latestTip.message && <span className="text-xs">· {latestTip.message}</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Panel de tips */}
        <AnimatePresence>
          {showTips && (
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-20 left-4 right-4 bg-dark-800 rounded-2xl p-4 z-30 border border-white/10"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-semibold text-sm">Enviar propina</p>
                <button onClick={() => setShowTips(false)}><FiX className="text-gray-400" size={16} /></button>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {TIP_OPTIONS.map(opt => (
                  <button key={opt.coins} onClick={() => handleSendTip(opt.coins)} disabled={!!sendingTip}
                    className="bg-dark-700 hover:bg-yellow-500/20 border border-white/5 rounded-xl p-2 text-center transition-colors disabled:opacity-50"
                  >
                    <FiZap className="text-yellow-400 mx-auto mb-0.5" size={14} />
                    <p className="text-white text-xs font-bold">{opt.label}</p>
                    <p className="text-gray-500 text-[10px]">{opt.usd}</p>
                    {sendingTip === opt.coins && <div className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mt-1" />}
                  </button>
                ))}
              </div>
              <input className="input-field text-sm py-2" placeholder="Mensaje opcional..." value={tipMessage} onChange={e => setTipMessage(e.target.value)} maxLength={80} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input de chat (solo móvil) */}
        {!isDesktop && (
          <AnimatePresence>
            {showChat && (
              <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                className="absolute bottom-[72px] left-0 right-0 px-3 pb-2 z-20"
              >
                <div className="flex items-center gap-2 bg-dark-800/90 backdrop-blur-sm rounded-2xl p-2 border border-white/10">
                  <input
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none px-2"
                    placeholder="Escribe un mensaje…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                    maxLength={120}
                  />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim()}
                    className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0 disabled:opacity-40"
                  >
                    <FiSend size={13} className="text-white" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Reactions (solo móvil) */}
        {!isDesktop && (
          <div className="absolute bottom-[72px] right-3 flex flex-col gap-1.5 z-20 pb-12">
            {!showChat && !showTips && REACTIONS.map(emoji => (
              <button key={emoji} onClick={() => sendReaction(emoji)}
                className="w-9 h-9 rounded-full bg-dark-800/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-lg active:scale-90 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Gift Panel */}
        <AnimatePresence>
          {showGifts && (
            <GiftPanel showId={id} coinBalance={coinBalance} onClose={() => setShowGifts(false)} onGiftSent={handleGiftSent} />
          )}
        </AnimatePresence>

        {/* Modal show privado */}
        <AnimatePresence>
          {privateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end"
              onClick={() => setPrivateModal(false)}
            >
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full bg-dark-800 rounded-t-3xl p-5 pb-8 border-t border-white/10"
              >
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                <h3 className="text-white font-black text-lg mb-1">Show Privado</h3>
                <p className="text-gray-400 text-sm mb-5">El host transmitirá solo para ti</p>

                <div className="grid grid-cols-2 gap-3">
                  {/* Privado */}
                  <button
                    onClick={() => handleRequestPrivate('private')}
                    className="bg-dark-700 hover:bg-purple-600/20 border border-white/10 hover:border-purple-500/50 rounded-2xl p-4 text-left transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
                      <FiVideo className="text-purple-300" size={18} />
                    </div>
                    <p className="text-white font-bold text-sm mb-0.5">Privado</p>
                    <p className="text-purple-300 font-black text-lg">{show?.private_rate ?? 20} <span className="text-sm font-normal text-gray-400">coins/min</span></p>
                    <p className="text-gray-500 text-xs mt-2">Solo tú y el host</p>
                    <p className="text-gray-600 text-[10px]">Mín. {show?.min_private_minutes ?? 3} minutos</p>
                  </button>

                  {/* Exclusivo */}
                  <button
                    onClick={() => handleRequestPrivate('exclusive')}
                    className="bg-gradient-to-br from-purple-900/40 to-pink-900/30 hover:from-purple-900/60 hover:to-pink-900/50 border border-purple-500/30 hover:border-purple-400/60 rounded-2xl p-4 text-left transition-all relative overflow-hidden"
                  >
                    <div className="absolute top-2 right-2 text-[9px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-bold">EXCLUSIVO</div>
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center mb-3">
                      <FiCamera className="text-pink-300" size={18} />
                    </div>
                    <p className="text-white font-bold text-sm mb-0.5">Exclusivo</p>
                    <p className="text-pink-300 font-black text-lg">{show?.exclusive_rate ?? 35} <span className="text-sm font-normal text-gray-400">coins/min</span></p>
                    <p className="text-gray-400 text-xs mt-2">Cam2Cam disponible</p>
                    <p className="text-gray-600 text-[10px]">Nadie puede espiar</p>
                  </button>
                </div>

                <p className="text-gray-600 text-[11px] text-center mt-4">
                  Balance: <span className="text-gray-400">{coinBalance} coins</span> · Mín. {show?.min_private_minutes ?? 3} min · Sesión empieza al ser aceptado
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controles inferiores (viewer) */}
        <div className="h-[72px] px-3 bg-dark-900/95 border-t border-white/5 flex items-center gap-2 shrink-0 z-10">

          {/* ❤️ contador de reacciones */}
          <button onClick={() => sendReaction('❤️')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors shrink-0"
          >
            <span className="text-lg">❤️</span>
            <span className="text-xs font-bold tabular-nums">
              {totalReactions >= 1000 ? `${(totalReactions/1000).toFixed(1)}k` : totalReactions}
            </span>
          </button>

          <div className="flex-1" />

          {/* Chat (solo móvil) */}
          {!isDesktop && (
            <button onClick={() => { setShowChat(v => !v); setShowTips(false); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showChat ? 'bg-brand-500' : 'bg-dark-700 hover:bg-dark-600'}`}
            >
              <FiMessageCircle className="text-white" size={18} />
            </button>
          )}

          {/* Leaderboard */}
          <button onClick={() => { setShowLeaderboard(v => !v); loadTippers(); }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showLeaderboard ? 'bg-yellow-500' : 'bg-dark-700 hover:bg-dark-600'}`}
          >
            <FiAward className={showLeaderboard ? 'text-black' : 'text-yellow-400'} size={18} />
          </button>

          {/* Propina */}
          <button onClick={() => { setShowTips(v => !v); setShowChat(false); setShowGifts(false); }}
            className={`flex items-center gap-1.5 px-3 h-10 rounded-full font-bold text-sm transition-colors ${showTips ? 'bg-yellow-500 text-black' : 'bg-dark-700 hover:bg-yellow-500/20 text-yellow-400'}`}
          >
            <FiZap size={15} />
            <span className="text-xs">Propina</span>
          </button>

          {/* Regalos */}
          <button onClick={() => { setShowGifts(v => !v); setShowTips(false); setShowChat(false); }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showGifts ? 'bg-brand-500' : 'bg-dark-700 hover:bg-dark-600'}`}
          >
            <FiGift className="text-white" size={18} />
          </button>

          {/* Show privado */}
          {!privateSession ? (
            <button
              onClick={() => setPrivateModal(true)}
              className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold px-3 h-10 rounded-full transition-colors shrink-0"
            >
              <FiDollarSign size={13} />
              <span className="text-xs">Show Privado {show?.private_rate ?? 20}tk</span>
            </button>
          ) : (
            <button
              onClick={() => endPrivateSession('manual')}
              className="flex items-center gap-1.5 bg-purple-600 text-white font-bold px-3 h-10 rounded-full animate-pulse shrink-0"
            >
              <FiDollarSign size={13} />
              <span className="text-xs">{privateMinutes}m · {privateSession.rate}/min</span>
            </button>
          )}

          {/* Salir */}
          <button onClick={handleLeave} className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shrink-0">
            <FiX className="text-white" size={18} />
          </button>
        </div>
        </div>{/* cierra flex-1 flex-col min-w-0 (columna video) */}

        {/* Panel lateral desktop */}
        {isDesktop && <ViewerSidePanel />}
      </div>
    );
  }

  // ── VISTA PREVIA DEL SHOW ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 pt-8 pb-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/shows')} className="text-gray-500 hover:text-white text-sm transition-colors">← Volver</button>
        <button
          onClick={handleShare}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white bg-dark-700 hover:bg-dark-600 rounded-full transition-colors"
        >
          <FiShare2 size={16} />
        </button>
      </div>

      {/* Cover */}
      <div className="relative h-48 rounded-2xl bg-gradient-to-br from-dark-700 to-dark-800 mb-6 overflow-hidden flex items-center justify-center">
        {show?.cover_url
          ? <img src={show.cover_url} alt="" className="w-full h-full object-cover" />
          : <FiRadio className="text-gray-600" size={48} />
        }
        {show?.status === 'live' && (
          <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> EN VIVO
          </span>
        )}
      </div>

      <h1 className="text-xl font-black text-white mb-1">{show?.title}</h1>
      <p className="text-gray-500 text-sm mb-1">Por {show?.host?.full_name}</p>
      {show?.description && <p className="text-gray-400 text-sm mb-4">{show.description}</p>}

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          show?.status === 'live'      ? 'bg-red-500/20 text-red-400'   :
          show?.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                                         'bg-dark-700 text-gray-500'
        }`}>
          {show?.status === 'live' ? 'En vivo' : show?.status === 'scheduled' ? 'Programado' : 'Terminado'}
        </span>
        <span className="text-xs text-gray-500 flex items-center gap-1"><FiUsers size={11} /> {viewerCount} viewers</span>
        {show?.show_type === 'private' && (
          <span className="text-xs text-purple-400 flex items-center gap-1"><FiDollarSign size={10} /> Privado 1-a-1</span>
        )}
      </div>

      <div className="card p-4 mb-6 flex items-center justify-between">
        <span className="text-gray-300 text-sm">Precio del ticket</span>
        <span className={`text-lg font-black ${show?.ticket_price > 0 ? 'text-brand-400' : 'text-green-400'}`}>
          {show?.ticket_price > 0 ? `$${show.ticket_price}` : 'Gratis'}
        </span>
      </div>

      {show?.status === 'ended' ? (
        <div className="space-y-3">
          <div className="text-center text-gray-500 py-2">Este show ya terminó</div>
          {show?.recording_url ? (
            <a
              href={show.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <FiVideo size={16} /> Ver grabación
            </a>
          ) : isHost && (
            <div>
              <input
                className="input-field text-sm mb-2"
                placeholder="URL de la grabación (opcional)..."
                onBlur={async (e) => {
                  if (e.target.value.trim()) {
                    await api.patch(`/api/shows/${id}/recording`, { recording_url: e.target.value.trim() }).catch(() => {});
                    toast.success('Grabación guardada');
                    loadShow();
                  }
                }}
              />
            </div>
          )}
        </div>
      ) : isHost ? (
        show?.status === 'live' ? (
          <button onClick={handleJoinAsViewer} disabled={joining} className="btn-primary w-full">
            {joining ? 'Conectando…' : 'Volver al show'}
          </button>
        ) : (
          <button onClick={enterPreShow} disabled={joining} className="btn-primary w-full flex items-center justify-center gap-2">
            {joining
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><FiRadio size={16} /> Iniciar show en vivo</>
            }
          </button>
        )
      ) : needsTicket ? (
        <button onClick={handleBuyTicket} className="btn-primary w-full flex items-center justify-center gap-2">
          <FiDollarSign size={16} /> Comprar ticket · ${show?.ticket_price}
        </button>
      ) : (
        show?.status === 'live' ? (
          <button onClick={handleJoinAsViewer} disabled={joining} className="btn-primary w-full flex items-center justify-center gap-2">
            {joining
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><FiVideo size={16} /> Unirse al show</>
            }
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-center text-gray-500 py-2">El show aún no ha comenzado</div>
            <button
              onClick={handleToggleInterest}
              disabled={togglingInterest}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                interested
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'btn-secondary'
              }`}
            >
              {interested ? <FiBellOff size={16} /> : <FiBell size={16} />}
              {interested ? 'Cancelar recordatorio' : `Me interesa · ${interestCount > 0 ? interestCount : ''}`}
            </button>
          </div>
        )
      )}

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal && (
          <PaymentModal
            clientSecret={paymentModal.clientSecret}
            amount={paymentModal.amount}
            description={paymentModal.description}
            onSuccess={paymentModal.onSuccess}
            onClose={() => setPaymentModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
