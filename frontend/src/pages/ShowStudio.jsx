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
  FiMenu, FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { LiveKitSession, HQ_AUDIO_CONSTRAINTS } from '../lib/livekitSession.js';
import { useAuthStore } from '../store/authStore.js';
import { SHOW_CATEGORIES } from './LiveShows.jsx';
import DraggableTipGoal from '../components/ui/DraggableTipGoal.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import BigGiftAnimation, { useGiftAnimationQueue } from '../components/ui/BigGiftAnimation.jsx';
import CaptionOverlay from '../components/ui/CaptionOverlay.jsx';
import { useCaptionsHost, captionsSupported } from '../lib/useLiveCaptions.js';
import BattleOverlay from '../components/ui/BattleOverlay.jsx';
import BattleInviteModal from '../components/ui/BattleInviteModal.jsx';
import StudioOnboarding from '../components/ui/StudioOnboarding.jsx';
import GiftGoalsManager from '../components/ui/GiftGoalsManager.jsx';
import ShowAdvancedPanel from '../components/ui/ShowAdvancedPanel.jsx';

const REACTIONS = ['❤️', '🔥', '⭐', '😍'];

// 720p y 1080p son los presets principales. 360p queda como opción ultra-low
// para creators con conexión muy mala. 60fps disponible en 1080p para gaming
// streams donde la fluidez importa más que el bitrate.
const QUALITY_OPTIONS = [
  { key: '360p',     label: '360p',      w: 640,  h: 360,  fps: 24 },
  { key: '720p',     label: 'HD 720p',   w: 1280, h: 720,  fps: 30 },
  { key: '1080p',    label: 'Full HD',   w: 1920, h: 1080, fps: 30 },
  { key: '1080p60',  label: '1080p 60',  w: 1920, h: 1080, fps: 60 },
];

const DEFAULT_SHOW = {
  title: '', description: '', show_type: 'broadcast',
  ticket_price: '', category: 'chat', scheduled_at: '',
  tip_goal: '', private_rate: '20', exclusive_rate: '35', min_private_minutes: '3',
  private_countdown_sec: '10',
};

const DEFAULT_LAYOUT = {
  rightWidth:      288,
  rightSide:       'right',
  rightCollapsed:  false,
  dockHeight:      176,
  dockPosition:    'bottom',
  dockCollapsed:   false,
  dockOrder:       ['escenas', 'fuentes', 'mezclador', 'controles'],
};

const DOCK_LABELS = { escenas: 'Escenas', fuentes: 'Fuentes', mezclador: 'Mezclador', controles: 'Controles' };

const isDesktop = window.innerWidth >= 1024 && !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

function StatusPill({ status, label, icon: Icon }) {
  const map = {
    idle:        { cls: 'bg-dark-700 text-gray-500',           dot: 'bg-gray-600',                txt: 'Pendiente'     },
    checking:    { cls: 'bg-yellow-500/15 text-yellow-400',    dot: 'bg-yellow-400 animate-pulse', txt: 'Verificando…'  },
    granted:     { cls: 'bg-green-500/15 text-green-400',      dot: 'bg-green-400',               txt: 'Listo'         },
    denied:      { cls: 'bg-red-500/15 text-red-400',          dot: 'bg-red-400',                 txt: 'Sin permiso'   },
    unavailable: { cls: 'bg-gray-500/15 text-gray-400',        dot: 'bg-gray-500',                txt: 'No encontrado' },
  };
  const s = map[status] || map.idle;
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <Icon size={10} />
      <span>{label}</span>
      <span className="opacity-50">· {s.txt}</span>
    </div>
  );
}

function PollPanel({ showId, isLive }) {
  const [poll, setPollData] = useState(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!showId) return;
    try {
      const { data } = await api.get(`/api/shows/${showId}/poll`);
      setPollData(data?.active ? data : null);
    } catch {}
  };

  useEffect(() => { load(); }, [showId]);
  useEffect(() => {
    if (!poll?.active) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [poll?.active]);

  if (!isLive) return (
    <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-500 text-xs">
      Las encuestas solo se pueden lanzar mientras el show está en vivo
    </div>
  );

  const create = async () => {
    const q = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return toast.error('Pregunta y mínimo 2 opciones');
    setSubmitting(true);
    try {
      await api.post(`/api/shows/${showId}/poll`, { question: q, options: opts, active: true });
      toast.success('Encuesta publicada');
      setQuestion(''); setOptions(['', '']);
      load();
    } catch {
      toast.error('Error');
    } finally {
      setSubmitting(false);
    }
  };

  const close = async () => {
    try {
      await api.post(`/api/shows/${showId}/poll`, { question: poll.question, options: (poll.results || []).map(r => r.text), active: false });
      toast.success('Encuesta cerrada');
      setPollData(null);
    } catch {
      toast.error('Error');
    }
  };

  if (poll?.active) {
    const total = poll.total_votes || 0;
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-white text-xs font-bold">{poll.question}</p>
        <div className="space-y-1.5">
          {(poll.results || []).map((r, i) => {
            const pct = total > 0 ? Math.round((r.votes / total) * 100) : 0;
            return (
              <div key={i} className="bg-dark-800 rounded-lg p-2 relative overflow-hidden">
                <div className="absolute inset-0 bg-brand-500/20" style={{ width: `${pct}%` }} />
                <div className="relative flex items-center justify-between text-xs">
                  <span className="text-white truncate">{r.text}</span>
                  <span className="text-gray-400 font-mono">{r.votes} · {pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 text-center">{total} {total === 1 ? 'voto' : 'votos'}</p>
        <button onClick={close} className="w-full text-xs font-bold py-2 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25">
          Cerrar encuesta
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <p className="text-[10px] text-gray-500 uppercase font-bold">Nueva encuesta</p>
      <input
        className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 outline-none focus:border-brand-500/50"
        placeholder="Pregunta…"
        value={question}
        onChange={e => setQuestion(e.target.value.substring(0, 200))}
      />
      {options.map((opt, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            className="flex-1 bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 outline-none focus:border-brand-500/50"
            placeholder={`Opción ${i + 1}`}
            value={opt}
            onChange={e => setOptions(o => o.map((v, j) => j === i ? e.target.value.substring(0, 80) : v))}
          />
          {options.length > 2 && (
            <button onClick={() => setOptions(o => o.filter((_, j) => j !== i))}
              className="px-2 text-xs text-red-400 hover:text-red-300">×</button>
          )}
        </div>
      ))}
      {options.length < 4 && (
        <button onClick={() => setOptions(o => [...o, ''])}
          className="text-[10px] text-brand-400 hover:text-brand-300">+ Agregar opción</button>
      )}
      <button onClick={create} disabled={submitting}
        className="btn-primary w-full text-xs py-2 disabled:opacity-50">
        {submitting ? 'Publicando…' : 'Publicar encuesta'}
      </button>
    </div>
  );
}

function CoHostsPanel({ showId }) {
  const [coHosts, setCoHosts] = useState([]);
  const [search, setSearch]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting]   = useState(null);

  const load = async () => {
    if (!showId) return;
    try {
      const { data } = await api.get(`/api/shows/${showId}/co-hosts`);
      setCoHosts(data?.co_hosts || []);
    } catch {}
  };
  useEffect(() => { load(); }, [showId]);

  // Carga creators con show LIVE. Si q está vacío trae todos los live;
  // con texto filtra del lado del servidor.
  const doSearch = async (q) => {
    setSearch(q);
    setSearching(true);
    try {
      const { data } = await api.get(`/api/shows/live-creators${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setResults(data?.creators || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Precargar la lista al montar (sin necesidad de teclear)
  useEffect(() => { doSearch(''); /* eslint-disable-next-line */ }, []);

  const invite = async (userId) => {
    if (!userId) { toast.error('Selecciona un creador'); return; }
    if (!showId) { toast.error('Guarda el show primero (Config)'); return; }
    setInviting(userId);
    try {
      await api.post(`/api/shows/${showId}/co-hosts/invite`, { user_id: userId });
      toast.success('Invitación enviada');
      setSearch(''); setResults([]);
      load();
    } catch (err) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error;
      console.error('[inviteCoHost] failed', { status, serverMsg, userId, showId });
      toast.error(serverMsg || `No se pudo invitar (HTTP ${status || '?'})`);
    } finally {
      setInviting(null);
    }
  };

  const remove = async (userId) => {
    try {
      await api.delete(`/api/shows/${showId}/co-hosts/${userId}`);
      toast.success('Co-host removido');
      load();
    } catch {
      toast.error('Error');
    }
  };

  if (!showId) return (
    <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-500 text-xs">
      Guarda el show primero para poder invitar co-hosts
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <p className="text-[10px] text-gray-500 uppercase font-bold">Invitar creador</p>
      <input
        className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 outline-none focus:border-brand-500/50"
        placeholder="Buscar por nombre o @username"
        value={search}
        onChange={e => doSearch(e.target.value)}
      />
      <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold mt-1">
        {search ? 'Resultados' : 'En vivo ahora'}
      </p>
      {searching && <p className="text-[10px] text-gray-500">Buscando…</p>}
      {!searching && results.length === 0 && (
        <p className="text-[10px] text-gray-600 text-center py-3">
          {search ? 'Sin resultados' : 'Nadie más está en vivo'}
        </p>
      )}
      {results.slice(0, 8).map(p => (
        <div key={p.id} className="flex items-center gap-2 p-1.5 rounded bg-dark-800">
          <div className="relative shrink-0">
            <img loading="lazy" src={p.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.full_name || 'U')}
              className="w-7 h-7 rounded-full object-cover" alt="" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-dark-800 animate-pulse" title="En vivo" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white truncate font-semibold">{p.full_name}</p>
            {p.live_show_title && (
              <p className="text-[9px] text-gray-500 truncate">🔴 {p.live_show_title}</p>
            )}
          </div>
          <button
            onClick={() => invite(p.id)}
            disabled={inviting === p.id}
            className="text-[10px] px-2 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded font-bold disabled:opacity-50 shrink-0"
          >
            {inviting === p.id ? '…' : 'Invitar'}
          </button>
        </div>
      ))}

      <p className="text-[10px] text-gray-500 uppercase font-bold pt-2 border-t border-white/5">Co-hosts ({coHosts.length})</p>
      {coHosts.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-3">Sin co-hosts. Invita a otros creadores para co-presentar.</p>
      )}
      {coHosts.map(c => (
        <div key={c.user?.id} className="flex items-center gap-2 p-2 rounded bg-dark-800">
          <img loading="lazy" src={c.user?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.user?.full_name || 'U')}
            className="w-7 h-7 rounded-full" alt="" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-semibold truncate">{c.user?.full_name}</p>
            <p className="text-[9px] text-gray-500">
              {c.status === 'invited' ? '⏳ Invitación pendiente' :
               c.status === 'accepted' ? '✅ Aceptó' : c.status}
            </p>
          </div>
          <button
            onClick={() => remove(c.user?.id)}
            className="text-[10px] px-2 py-1 bg-red-500/15 text-red-300 hover:bg-red-500/25 rounded font-bold"
          >
            Quitar
          </button>
        </div>
      ))}
    </div>
  );
}

// Timer del tiempo mínimo pagado por el viewer. Si todavía no se cumple,
// se muestra "🔒 N:NN" en el banner — el host no puede dar Terminar.
function PrivateMinTimer({ minEndsAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((new Date(minEndsAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    if (!minEndsAt) return;
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((new Date(minEndsAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [minEndsAt]);
  if (secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="text-amber-300 text-[10px] font-bold tabular-nums" title="Tiempo mínimo pagado por el viewer">
      🔒 {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

// Banner countdown que ve el HOST durante los 10s previos al reconnect.
function PrivateCountdownBannerHost({ endsAt, type, viewerName }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-purple-600/95 backdrop-blur-md rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xl shadow-purple-500/40 animate-pulse">
      <div className="text-2xl font-black text-white tabular-nums">{secs}</div>
      <div className="text-left">
        <p className="text-white text-[11px] font-black tracking-wider">
          🔒 {type === 'exclusive' ? 'CAM2CAM iniciando' : 'PRIVADO iniciando'}
        </p>
        <p className="text-purple-100 text-[10px]">
          {type === 'exclusive'
            ? `Solo ${viewerName} y tú. Otros viewers serán desconectados.`
            : `Tu show pasa a privado con ${viewerName}.`}
        </p>
      </div>
    </div>
  );
}

export default function ShowStudio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuthStore();
  const confirm = useConfirm();

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
  // Default 1080p — el browser hace fallback a 720p si la cámara no llega.
  // Persistimos preferencia en localStorage para que cada creator mantenga
  // su elección entre sesiones.
  const [videoQuality, setVideoQuality] = useState(() => {
    try { return localStorage.getItem('destino-video-quality') || '1080p'; }
    catch { return '1080p'; }
  });
  useEffect(() => {
    try { localStorage.setItem('destino-video-quality', videoQuality); } catch {}
  }, [videoQuality]);
  const [previewActive, setPreviewActive]       = useState(false);
  const [vuLevel, setVuLevel]                   = useState(0);

  // ── LIVE STATE ───────────────────────────────────────────────────────────────
  const [showId, setShowId]                         = useState(null);
  const [isLive, setIsLive]                         = useState(false);
  const [captionsOn, setCaptionsOn]                  = useState(false);
  const bigGiftQueue                                 = useGiftAnimationQueue();
  const bigGiftQueueRef                              = useRef(bigGiftQueue);
  bigGiftQueueRef.current                            = bigGiftQueue;
  const [pendingLocalStream, setPendingLocalStream] = useState(null);
  const [liveDuration, setLiveDuration]             = useState(0);
  const [viewerCount, setViewerCount]               = useState(0);
  const [peakViewers, setPeakViewers]               = useState(0);
  const [totalCoinsEarned, setTotalCoinsEarned]     = useState(0);
  const [audioLevel, setAudioLevel]                 = useState(0);
  const [muted, setMuted]                           = useState(false);
  const [cameraOff, setCameraOff]                   = useState(false);
  const [screenSharing, setScreenSharing]           = useState(false);
  const [connState, setConnState]                   = useState('connected');
  const [chatMessages, setChatMessages]             = useState([]);
  const [chatInput, setChatInput]                   = useState('');
  const [reactions, setReactions]                   = useState([]);
  const [giftAnimations, setGiftAnimations]         = useState([]);
  const [tippers, setTippers]                       = useState([]);
  const [viewerList, setViewerList]                 = useState([]);
  // 'config' | 'chat' | 'private' | 'viewers' — 4 tabs visibles siempre
  const [rightTab, setRightTab]                     = useState('config');
  const [privateMessages, setPrivateMessages]       = useState([]);
  const [privateRequest, setPrivateRequest]         = useState(null);
  const [pinnedMessage, setPinnedMessage]           = useState('');
  const [pinnedInput, setPinnedInput]               = useState('');
  const [showPinInput, setShowPinInput]             = useState(false);
  const [showModeration, setShowModeration]         = useState(false);
  const [bannedUsers, setBannedUsers]               = useState(new Map());
  const [activeReconnect, setActiveReconnect]       = useState(null);
  const [slowMode, setSlowMode]                     = useState(false);

  // ── BATTLES ──────────────────────────────────────────────────────────────────
  const [activeBattle, setActiveBattle]             = useState(null);
  const [battleSearch, setBattleSearch]             = useState('');
  const [battleResults, setBattleResults]           = useState([]);
  const [battleInviting, setBattleInviting]         = useState(null);
  const [showBattleSearch, setShowBattleSearch]     = useState(false);
  // Stream del oponente (otro host) durante el battle. Lo recibimos
  // conectándonos como subscriber-only a su room LiveKit en paralelo al
  // nuestro. Se muestra en un tile del canvas.
  const [opponentStream, setOpponentStream]         = useState(null);
  const opponentRtcRef = useRef(null);
  const opponentVideoRef = useRef(null);

  // ── PRIVATE SHOW (host side) ─────────────────────────────────────────────────
  // Cuando aceptamos un request privado, reconectamos a un room nuevo y
  // mostramos el track del viewer si es cam2cam exclusive.
  const [privateSession, setPrivateSessionHost]     = useState(null); // {viewerId, viewerName, type, rate, roomId}
  const [privateViewerStream, setPrivateViewerStream] = useState(null); // MediaStream del viewer (solo exclusive)
  const privateViewerVideoRef = useRef(null);

  // ── GIFT GOALS ──────────────────────────────────────────────────────────────
  // Cargados al iniciar/reconectar. Actualizados por broadcast cuando un viewer
  // manda un gift que matchea (backend emite gift_goal_progress).
  const [giftGoals, setGiftGoals] = useState([]);

  // ── Grabación ────────────────────────────────────────────────────────────────
  const [recording, setRecording]       = useState(false);
  const [uploadingRec, setUploadingRec] = useState(false);
  const [recDuration, setRecDuration]   = useState(0);
  const mediaRecorderRef = useRef(null);
  const recChunksRef     = useRef([]);
  const recTimerRef      = useRef(null);

  const startRecording = () => {
    if (recording || !localStreamRef.current) return;
    try {
      const mimeOptions = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
      const mimeType = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || '';
      // Bitrate target: 6 Mbps para 1080p, 2.5 Mbps para 720p o menor.
      // Detectamos la resolución del track local y elegimos el correcto.
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const settings = videoTrack?.getSettings?.() || {};
      const isHD1080 = (settings.height || 720) >= 1080;
      const videoBitsPerSecond = isHD1080 ? 6_000_000 : 2_500_000;
      const audioBitsPerSecond = 128_000; // 128 kbps audio estéreo
      const rec = new MediaRecorder(localStreamRef.current, {
        mimeType, videoBitsPerSecond, audioBitsPerSecond,
      });
      recChunksRef.current = [];
      rec.ondataavailable = e => { if (e.data?.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = uploadRecording;
      rec.start(1000);
      mediaRecorderRef.current = rec;
      setRecording(true);
      setRecDuration(0);
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000);
      toast.success('Grabación iniciada');
    } catch (e) {
      toast.error('Tu navegador no soporta grabación');
    }
  };

  const stopRecording = () => {
    if (!recording || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setRecording(false);
    clearInterval(recTimerRef.current);
    recTimerRef.current = null;
  };

  const uploadRecording = async () => {
    if (recChunksRef.current.length === 0) return;
    setUploadingRec(true);
    try {
      const blob = new Blob(recChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'video/webm' });
      const fd = new FormData();
      fd.append('recording', blob, `show-${showId}-${Date.now()}.webm`);
      const { data } = await api.post(`/api/shows/${showId}/recording/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0,
      });
      toast.success('Grabación guardada — disponible como replay');
      return data.recording_url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir grabación');
    } finally {
      setUploadingRec(false);
      recChunksRef.current = [];
    }
  };

  // Limpieza
  useEffect(() => () => {
    if (mediaRecorderRef.current && recording) {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    clearInterval(recTimerRef.current);
  }, []);

  // ── LAYOUT STATE (persiste en localStorage) ──────────────────────────────────
  const [layout, setLayout] = useState(() => {
    try {
      const s = localStorage.getItem('destino-studio-layout');
      return s ? { ...DEFAULT_LAYOUT, ...JSON.parse(s) } : DEFAULT_LAYOUT;
    } catch { return DEFAULT_LAYOUT; }
  });
  const patchLayout = useCallback((patch) => {
    setLayout(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem('destino-studio-layout', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── REFS ─────────────────────────────────────────────────────────────────────
  const previewStreamRef = useRef(null);
  const previewVideoRef  = useRef(null);
  const canvasContainerRef = useRef(null);
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
  const dndRef           = useRef(null);

  // ── EFFECTS ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/profiles/${user.id}`).then(r => setProfile(r.data.profile)).catch(() => {});
    enumerateDevices();
    return () => {
      stopPreview();
      leaveShowChannel();
      leaveShow();
      clearInterval(liveTimerRef.current);
      clearInterval(audioLevelRef.current);
    };
  }, []);

  // Al entrar en vivo, cambiar al tab Chat si estaba en Config
  useEffect(() => {
    if (isLive) setRightTab(t => t === 'config' ? 'chat' : t);
  }, [isLive]);

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

  // Live captions del host (cuando captionsOn + isLive)
  useCaptionsHost(showId, profile?.language ? `${profile.language}-${profile.country || 'ES'}` : 'es-ES', isLive && captionsOn);

  // Sincronizar captions_enabled en el show para que el viewer renderice el overlay
  useEffect(() => {
    if (!showId || !isLive) return;
    supabase.from('live_shows').update({ captions_enabled: captionsOn }).eq('id', showId).then(() => {}).catch(() => {});
  }, [captionsOn, showId, isLive]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/shows/my');
        const live = (data.shows || []).find(s => s.status === 'live');
        if (live) setActiveReconnect({ id: live.id, title: live.title, started_at: live.started_at, tip_goal: live.tip_goal });
      } catch {}
    })();
  }, []);

  // ── RESIZE PANELS ────────────────────────────────────────────────────────────
  const startResize = useCallback((type, e) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const snap = { rightWidth: layout.rightWidth, dockHeight: layout.dockHeight, rightSide: layout.rightSide, dockPosition: layout.dockPosition };
    const onMove = (ev) => {
      if (type === 'right') {
        const delta = snap.rightSide === 'right' ? startX - ev.clientX : ev.clientX - startX;
        patchLayout({ rightWidth: Math.max(220, Math.min(520, snap.rightWidth + delta)) });
      } else if (type === 'dock') {
        const delta = snap.dockPosition === 'bottom' ? startY - ev.clientY : ev.clientY - startY;
        patchLayout({ dockHeight: Math.max(88, Math.min(380, snap.dockHeight + delta)) });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [layout.rightWidth, layout.dockHeight, layout.rightSide, layout.dockPosition, patchLayout]);

  // ── DOCK DRAG-TO-REORDER ─────────────────────────────────────────────────────
  const onDockDragStart = (e, key) => { dndRef.current = key; e.dataTransfer.effectAllowed = 'move'; };
  const onDockDragOver  = (e) => e.preventDefault();
  const onDockDrop = (e, targetKey) => {
    e.preventDefault();
    const src = dndRef.current; dndRef.current = null;
    if (!src || src === targetKey) return;
    const order = [...layout.dockOrder];
    const [removed] = order.splice(order.indexOf(src), 1);
    order.splice(order.indexOf(targetKey), 0, removed);
    patchLayout({ dockOrder: order });
  };

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
        audio: selectedMicId
          ? { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: selectedMicId } }
          : HQ_AUDIO_CONSTRAINTS,
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
      });
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
    private_countdown_sec: Math.max(5, Math.min(180, parseInt(show.private_countdown_sec) || 10)),
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
          audio: selectedMicId
          ? { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: selectedMicId } }
          : HQ_AUDIO_CONSTRAINTS,
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

      await enumerateDevices();
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

  const handleReconnect = async ({ id, title, started_at, tip_goal }) => {
    setGoingLive(true);
    setActiveReconnect(null);
    try {
      try {
        const { data: sd } = await api.get(`/api/shows/${id}`);
        if (sd?.show) {
          setShow({
            title: sd.show.title || '',
            description: sd.show.description || '',
            show_type: sd.show.show_type || 'broadcast',
            ticket_price: String(sd.show.ticket_price || ''),
            category: sd.show.category || 'chat',
            scheduled_at: sd.show.scheduled_at || '',
            tip_goal: String(sd.show.tip_goal || ''),
            private_rate: String(sd.show.private_rate || '20'),
            exclusive_rate: String(sd.show.exclusive_rate || '35'),
            min_private_minutes: String(sd.show.min_private_minutes || '3'),
            private_countdown_sec: String(sd.show.private_countdown_sec || '10'),
          });
          // Cargar gift goals existentes para mostrarlos en el manager
          if (Array.isArray(sd.show.gift_goals)) setGiftGoals(sd.show.gift_goals);
        }
      } catch {}

      const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
      let stream = previewStreamRef.current;
      if (!stream || stream.getTracks().length === 0) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId
          ? { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: selectedMicId } }
          : HQ_AUDIO_CONSTRAINTS,
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps }
            : { width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
        });
      }
      localStreamRef.current = stream;
      previewStreamRef.current = null;

      const roomId = `show_${id.replace(/-/g, '')}`;
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

      await enumerateDevices();
      setShowId(id);
      joinShowChannel(id, 'host');
      setIsLive(true);
      if (started_at) {
        const elapsed = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000);
        if (elapsed > 0) setLiveDuration(elapsed);
      }
      liveTimerRef.current = setInterval(() => setLiveDuration(d => d + 1), 1000);
      setPendingLocalStream(stream);
      toast.success('¡Reconectado al show!');
    } catch (err) {
      toast.error(err.message || 'Error al reconectar');
      setGoingLive(false);
      setActiveReconnect({ id, title, started_at, tip_goal });
    }
  };

  // ── BATTLES handlers ─────────────────────────────────────────────────────────
  // Carga creators con show LIVE. Si q está vacío, devuelve todos. Si q tiene
  // texto, filtra por nombre/username del lado del servidor.
  const searchBattleOpponents = async (q) => {
    setBattleSearch(q);
    try {
      const { data } = await api.get(`/api/shows/live-creators${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setBattleResults((data?.creators || []).slice(0, 10));
    } catch { setBattleResults([]); }
  };

  // Cuando se abre el modal de battle, precargar la lista de live creators
  useEffect(() => {
    if (!showBattleSearch) return;
    searchBattleOpponents('');
  }, [showBattleSearch]);

  const inviteBattleOpponent = async (opponentId) => {
    if (!opponentId) { toast.error('Selecciona un creador'); return; }
    if (!showId || !isLive) { toast.error('Inicia el show primero'); return; }
    setBattleInviting(opponentId);
    try {
      await api.post('/api/battles/invite', {
        opponent_id: opponentId, duration_minutes: 5,
      });
      toast.success('Invitación enviada — espera que acepte');
      setBattleSearch(''); setBattleResults([]); setShowBattleSearch(false);
    } catch (err) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error;
      console.error('[inviteBattle] failed', { status, serverMsg, opponentId });
      toast.error(serverMsg || `No se pudo invitar (HTTP ${status || '?'})`);
    } finally { setBattleInviting(null); }
  };

  const handleBattleAccepted = useCallback((battle) => {
    setActiveBattle(battle);
    // Broadcast al show channel para que viewers vean el overlay
    chatChannelRef.current?.send({
      type: 'broadcast', event: 'battle_started',
      payload: { battleId: battle.id },
    }).catch(() => {});
  }, []);

  // Subscribe-only al room del oponente para ver su cámara en un tile.
  // Mientras dura el battle, este RTC vive paralelo al rtcRef.current (mi
  // propio publisher). Al terminar el battle, cerramos esta sesión.
  useEffect(() => {
    if (!activeBattle || !user?.id) {
      // Cleanup si había una conexión previa
      if (opponentRtcRef.current) {
        opponentRtcRef.current.leave().catch(() => {});
        opponentRtcRef.current = null;
      }
      setOpponentStream(null);
      return;
    }

    const amIHost1 = activeBattle.host1_id === user.id;
    const opponentShowId = amIHost1 ? activeBattle.show2_id : activeBattle.show1_id;
    const opponentHostId = amIHost1 ? activeBattle.host2_id : activeBattle.host1_id;
    if (!opponentShowId || !opponentHostId) return;

    const opponentRoomId = `show_${opponentShowId.replace(/-/g, '')}`;
    let cancelled = false;

    (async () => {
      try {
        const rtc = new LiveKitSession(opponentRoomId);
        rtc.onRemoteTrack = (track, participant) => {
          // Solo nos interesa el track del oponente (host del otro show)
          if (participant?.identity !== opponentHostId) return;
          if (track.kind === 'video') {
            const ms = new MediaStream([track.mediaStreamTrack]);
            setOpponentStream(ms);
          } else if (track.kind === 'audio') {
            // Reproducir audio del oponente. Lo agregamos al DOM con tag
            // específico para limpiarlo al terminar el battle.
            const a = document.createElement('audio');
            a.autoplay = true;
            a.srcObject = new MediaStream([track.mediaStreamTrack]);
            a.dataset.battleOpponentAudio = 'true';
            document.body.appendChild(a);
          }
        };
        opponentRtcRef.current = rtc;
        // canPublish=false: solo me suscribo, no envío nada al room oponente
        await rtc.join(false, { skipAutoMedia: true });
        if (cancelled) await rtc.leave().catch(() => {});
      } catch (e) {
        console.warn('[battle] no se pudo conectar al room del oponente:', e?.message);
      }
    })();

    return () => {
      cancelled = true;
      if (opponentRtcRef.current) {
        opponentRtcRef.current.leave().catch(() => {});
        opponentRtcRef.current = null;
      }
      setOpponentStream(null);
      // Limpiar elementos <audio> del oponente
      document.querySelectorAll('audio[data-battle-opponent-audio]').forEach(a => {
        try { a.srcObject = null; a.remove(); } catch {}
      });
    };
  }, [activeBattle, user?.id]);

  const handleBattleEnded = useCallback(() => {
    setActiveBattle(null);
    chatChannelRef.current?.send({
      type: 'broadcast', event: 'battle_ended', payload: {},
    }).catch(() => {});
  }, []);

  // Poll activo: si estoy live y alguien aceptó mi invite, lo detecto aquí
  useEffect(() => {
    if (!isLive || !showId) return;
    const checkActive = async () => {
      try {
        const { data } = await api.get(`/api/battles/active?show_id=${showId}`);
        if (data.battle && !activeBattle) {
          setActiveBattle(data.battle);
        }
      } catch {}
    };
    checkActive();
    const t = setInterval(checkActive, 10_000);
    return () => clearInterval(t);
  }, [isLive, showId, activeBattle]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
      });
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

  const toggleMute   = () => { rtcRef.current?.setMic(muted);    setMuted(v => !v); };
  const toggleCamera = () => { rtcRef.current?.setCam(cameraOff); setCameraOff(v => !v); };

  // ── SUPABASE REALTIME ────────────────────────────────────────────────────────
  const addGiftAnimation = useCallback((emoji, senderName, imageUrl = null) => {
    const gid = `${Date.now()}-${Math.random()}`;
    setGiftAnimations(prev => [...prev, { id: gid, emoji, senderName, imageUrl }]);
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
        addGiftAnimation(payload.emoji, payload.senderName, payload.image_url);
        setTotalCoinsEarned(c => c + Math.round((payload.coins || 0) * 0.7));
        api.get(`/api/shows/${id}/tippers`).then(r => setTippers(r.data.tippers || [])).catch(() => {});
        // Animación full-screen para regalos grandes (>= 200 coins)
        if ((payload.coins || 0) >= 200) {
          bigGiftQueueRef.current?.enqueue({
            senderName: payload.senderName, avatar: payload.avatar,
            emoji: payload.emoji, image_url: payload.image_url,
            coins: payload.coins, label: payload.label || 'Regalo',
          });
        }
      })
      .on('broadcast', { event: 'gift_goal_progress' }, ({ payload }) => {
        if (Array.isArray(payload?.goals)) setGiftGoals(payload.goals);
      })
      .on('broadcast', { event: 'gift_goal_reached' }, ({ payload }) => {
        const goal = payload?.goal;
        if (!goal) return;
        toast.success(`🎉 ¡Goal logrado! ${goal.reward_text || ''}`, { duration: 6000 });
      })
      .on('broadcast', { event: 'tip' }, ({ payload }) => {
        addGiftAnimation('⚡', payload.senderName);
        setTotalCoinsEarned(c => c + Math.round((payload.coins || 0) * 0.7));
        api.get(`/api/shows/${id}/tippers`).then(r => setTippers(r.data.tippers || [])).catch(() => {});
        toast(`⚡ ${payload.senderName} envió ${payload.coins} coins${payload.message ? ': ' + payload.message : ''}`, { duration: 4000 });
      })
      .on('broadcast', { event: 'private_request' }, ({ payload }) => {
        setPrivateRequest(payload);
        setRightTab('private'); // auto-switch al tab privado
        toast(`${payload.viewerName} quiere un show privado (${payload.rate}/min)`, { icon: '🔒', duration: 6000 });
      })
      .on('broadcast', { event: 'private_end' }, ({ payload }) => {
        if (privateRequest?.viewerId === payload.viewerId) setPrivateRequest(null);

        // Si yo (host) estoy en sesión privada con este viewer y él la terminó,
        // entrar en modo pausa: limpiar el tile del viewer, cortar su audio,
        // marcar state='ended'. El host decide cuándo volver a broadcast.
        setPrivateSessionHost(prev => {
          if (!prev) return prev;
          if (prev.viewerId !== payload.viewerId) return prev;
          return { ...prev, state: 'ended' };
        });
        setPrivateViewerStream(null);
        cleanupPrivateAudioElements();

        if (payload.endedBy === 'viewer') {
          toast(`El viewer terminó el show privado · pulsa "Volver a broadcast" cuando estés listo`,
            { icon: '⏸️', duration: 6000 });
        }
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

  const handleAcceptPrivate = async (forceReset = false) => {
    if (!privateRequest) return;
    try {
      if (forceReset) {
        await api.post(`/api/shows/${showId}/private/reset`).catch(() => {});
      }
      const { data } = await api.post(`/api/shows/${showId}/private/accept`, {
        viewerId: privateRequest.viewerId,
        viewerName: privateRequest.viewerName,
        type: privateRequest.type,
      });
      const { privateRoomId, type, countdownSec = 10, minEndsAt } = data;
      const reqSnapshot = privateRequest;
      setPrivateRequest(null);

      // Estado intermedio "countdown" para que la UI muestre el overlay
      setPrivateSessionHost({
        viewerId: reqSnapshot.viewerId,
        viewerName: reqSnapshot.viewerName,
        type, rate: data.rate,
        roomId: privateRoomId,
        state: 'countdown',
        countdownEndsAt: Date.now() + countdownSec * 1000,
        minEndsAt,
      });

      // Tras el countdown:
      //  · exclusive: reconnect al room privado (cam2cam 1-a-1).
      //  · private: NO reconnect — el host sigue en el room público; backend
      //    activará el bloqueo de no-allowed_viewers cuando el cliente llame
      //    POST /private/activate.
      setTimeout(async () => {
        try {
          if (type === 'exclusive' && privateRoomId) {
            await reconnectToRoom(privateRoomId);
          }
          await api.post(`/api/shows/${showId}/private/activate`).catch(() => {});
          setPrivateSessionHost(prev => prev ? { ...prev, state: 'active', countdownEndsAt: null } : null);
          toast.success(
            type === 'exclusive'
              ? `🔒 CAM2CAM activo con ${reqSnapshot.viewerName}`
              : `🔒 Show privado activo con ${reqSnapshot.viewerName}`
          );
        } catch (e) {
          console.error('[host] activate privado falló:', e);
          toast.error('No se pudo activar el privado');
        }
      }, countdownSec * 1000);
    } catch (err) {
      const code = err.response?.data?.code;
      const reqInfo = privateRequest;
      if (code === 'PRIVATE_ALREADY_ACTIVE' && !forceReset) {
        // Ofrecer reset con un toast accionable
        toast((t) => (
          <div className="flex items-center gap-2">
            <span className="text-xs">Hay otra sesión colgada. ¿Limpiar y aceptar?</span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                setPrivateRequest(reqInfo);
                handleAcceptPrivate(true);
              }}
              className="bg-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded"
            >Sí, limpiar</button>
          </div>
        ), { duration: 8000 });
        return;
      }
      toast.error(err.response?.data?.error || 'Error al aceptar');
    }
  };

  // Reconecta el LiveKit del host a un room distinto sin perder cámara/mic.
  // El localStreamRef puede tener tracks "ended" tras el leave() del room
  // anterior. Si pasa, re-capturamos con getUserMedia para conseguir tracks
  // frescos. También refrescamos localVideoRef.srcObject para que el host
  // siga viéndose en su preview.
  const reconnectToRoom = async (newRoomId) => {
    if (!rtcRef.current) return;
    try {
      await rtcRef.current.leave().catch(() => {});
    } catch {}

    // Re-capturar media si los tracks quedaron en estado "ended"
    let stream = localStreamRef.current;
    const needsFresh = !stream
      || stream.getTracks().some(t => t.readyState === 'ended')
      || stream.getTracks().length === 0;
    if (needsFresh) {
      try {
        const qOpt = QUALITY_OPTIONS.find(q => q.key === videoQuality) || QUALITY_OPTIONS[1];
        stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId
          ? { ...HQ_AUDIO_CONSTRAINTS, deviceId: { exact: selectedMicId } }
          : HQ_AUDIO_CONSTRAINTS,
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps }
            : { width: qOpt.w, height: qOpt.h, frameRate: qOpt.fps },
        });
        // Cerrar tracks viejos del stream anterior
        localStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} });
        localStreamRef.current = stream;
      } catch (e) {
        console.error('[reconnectToRoom] getUserMedia falló:', e);
        toast.error('No se pudo reactivar cámara/micrófono');
        return;
      }
    }

    const rtc = new LiveKitSession(newRoomId);
    rtcRef.current = rtc;
    rtc.onLocalVideo = (track) => {
      // Actualizar el preview local del host
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }
    };
    rtc.onRemoteTrack = (track, participant) => {
      if (track.kind === 'video') {
        const remoteStream = new MediaStream([track.mediaStreamTrack]);
        setPrivateViewerStream(remoteStream);
        if (privateViewerVideoRef.current) {
          privateViewerVideoRef.current.srcObject = remoteStream;
        }
      } else if (track.kind === 'audio') {
        // El elemento <audio> debe seguir vivo para que se oiga al viewer
        const a = document.createElement('audio');
        a.autoplay = true;
        a.srcObject = new MediaStream([track.mediaStreamTrack]);
        a.dataset.privateViewerAudio = 'true';
        document.body.appendChild(a);
      }
    };
    // Detección de desconexión del viewer aceptado: si cierra pestaña sin
    // pulsar Terminar, LiveKit emite ParticipantDisconnected. Cerramos la
    // sesión del lado del host para que pase a modo pausa.
    rtc.onParticipantLeft = (participant) => {
      const pid = participant?.identity;
      // Solo nos importa el viewer aceptado, no co-hosts u otros
      setPrivateSessionHost(prev => {
        if (!prev || prev.viewerId !== pid) return prev;
        // Llamada async fuera del setState
        Promise.resolve().then(async () => {
          try {
            await api.post(`/api/shows/${showId}/private/end`, {
              viewerId: pid, reason: 'viewer_disconnected',
            });
          } catch {}
          setPrivateViewerStream(null);
          cleanupPrivateAudioElements();
          toast('El viewer se desconectó — pulsa "Volver a broadcast" cuando estés listo',
            { icon: '⚠️', duration: 6000 });
        });
        return { ...prev, state: 'ended' };
      });
    };

    try {
      await rtc.join(true, { skipAutoMedia: true });
      await rtc.publishStream(stream);
    } catch (e) {
      console.error('[reconnectToRoom] join/publish falló:', e);
      toast.error('Error reconectando');
      return;
    }

    // Asegurar que el video preview muestra el stream actualizado
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };

  // Limpiar elementos <audio> de viewers privados al salir del modo privado
  const cleanupPrivateAudioElements = () => {
    document.querySelectorAll('audio[data-private-viewer-audio]').forEach(a => {
      try { a.srcObject = null; a.remove(); } catch {}
    });
  };

  const handleEndPrivateShow = async () => {
    if (!privateSession) return;
    try {
      await api.post(`/api/shows/${showId}/private/end`, {
        viewerId: privateSession.viewerId,
        reason: 'host_ended',
      });
      // Marca como 'ended' en local — el host queda en modo pausa hasta que
      // explícitamente pulse "Volver a transmitir".
      setPrivateSessionHost(prev => prev ? { ...prev, state: 'ended' } : null);
      setPrivateViewerStream(null);
      cleanupPrivateAudioElements();
      toast('Show privado terminado · pulsa "Volver a broadcast" cuando estés listo', { icon: '⏸️', duration: 5000 });
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const remaining = err.response?.data?.remaining_seconds;
      if (code === 'MIN_DURATION_NOT_MET') {
        const min = Math.ceil((remaining || 0) / 60);
        toast.error(`No puedes terminar todavía. Faltan ~${min} min de lo que pagó el viewer.`, { duration: 5000 });
      } else {
        toast.error(err.response?.data?.error || 'Error al terminar');
      }
    }
  };

  // Tras terminar privado, vuelve al room público SOLO cuando el host quiere.
  // Para 'private' no había reconnect (estaba en el room público), así que
  // solo limpiamos la session. Para 'exclusive' sí reconnect al público.
  const handleResumePublicShow = async () => {
    try {
      await api.post(`/api/shows/${showId}/private/resume`);
      if (privateSession?.type === 'exclusive') {
        const publicRoomId = `show_${showId.replace(/-/g, '')}`;
        await reconnectToRoom(publicRoomId);
      }
      setPrivateSessionHost(null);
      toast.success('🔴 De vuelta al show público');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo volver a broadcast');
    }
  };

  const handleDeclinePrivate = async () => {
    if (!privateRequest) return;
    try {
      await api.post(`/api/shows/${showId}/private/decline`, { viewerId: privateRequest.viewerId });
    } catch {}
    setPrivateRequest(null);
    toast('Solicitud rechazada');
  };

  const handleSavePinnedMessage = () => {
    setPinnedMessage(pinnedInput.trim());
    setShowPinInput(false);
    toast(pinnedInput.trim() ? 'Mensaje fijado' : 'Mensaje fijado eliminado');
  };

  const handleToggleSlowMode = () => {
    const next = !slowMode;
    setSlowMode(next);
    chatChannelRef.current?.send({ type: 'broadcast', event: 'slow_mode', payload: { enabled: next } });
    toast(next ? 'Modo lento activado (30s entre mensajes)' : 'Modo lento desactivado', { id: 'slow-mode' });
  };

  const handleCopyLink = async () => {
    const apiBase = import.meta.env.VITE_API_URL;
    const url = apiBase
      ? `${apiBase}/share/show/${showId}`
      : `${window.location.origin}/#/shows/${showId}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado 🔗'); }
    catch { toast.error('No se pudo copiar'); }
  };

  const fmtDuration = (s) =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const set = (key, val) => setShow(s => ({ ...s, [key]: val }));
  const canGoLive = permCamera === 'granted' && permMic === 'granted';

  // ── Live edit: snapshot del show al pasar a vivo + detector de cambios ───────
  const liveSnapshotRef = useRef(null);
  useEffect(() => {
    if (isLive && !liveSnapshotRef.current) {
      // Tomamos snapshot solo cuando arrancamos live, no en cada cambio
      liveSnapshotRef.current = {
        title: show.title,
        description: show.description,
        category: show.category,
        ticket_price: show.ticket_price,
        scheduled_at: show.scheduled_at,
      };
    } else if (!isLive) {
      liveSnapshotRef.current = null;
    }
  }, [isLive]);

  const editableFields = ['title', 'description', 'category', 'ticket_price', 'scheduled_at',
    'private_rate', 'exclusive_rate', 'min_private_minutes', 'private_countdown_sec'];
  const liveDirty = !!liveSnapshotRef.current && editableFields.some(k => {
    const a = liveSnapshotRef.current[k] ?? '';
    const b = show[k] ?? '';
    return String(a) !== String(b);
  });
  const [savingLive, setSavingLive] = useState(false);

  const applyLiveChanges = async () => {
    if (!isLive || !showId || !liveDirty || savingLive) return;
    setSavingLive(true);
    try {
      const payload = {
        title: show.title,
        description: show.description,
        category: show.category,
        ticket_price: parseFloat(show.ticket_price) || 0,
        scheduled_at: show.scheduled_at || null,
        private_rate: parseInt(show.private_rate) || 20,
        exclusive_rate: parseInt(show.exclusive_rate) || 35,
        min_private_minutes: parseInt(show.min_private_minutes) || 3,
        private_countdown_sec: Math.max(5, Math.min(180, parseInt(show.private_countdown_sec) || 10)),
      };
      await api.patch(`/api/shows/${showId}/live-update`, payload);
      // Actualizar snapshot — los cambios son ahora el nuevo baseline
      liveSnapshotRef.current = {
        title: show.title,
        description: show.description,
        category: show.category,
        ticket_price: show.ticket_price,
        scheduled_at: show.scheduled_at,
        private_rate: show.private_rate,
        exclusive_rate: show.exclusive_rate,
        min_private_minutes: show.min_private_minutes,
        private_countdown_sec: show.private_countdown_sec,
      };
      toast.success('Cambios aplicados al show');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudieron aplicar los cambios');
    } finally {
      setSavingLive(false);
    }
  };

  // ── COUNTDOWN OVERLAY ────────────────────────────────────────────────────────
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <AnimatePresence mode="wait">
          <motion.div key={countdown}
            initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4 }} className="text-center"
          >
            <p className="text-white/50 text-xl mb-2">{t('studio.go_live')}</p>
            <p className="text-white font-black" style={{ fontSize: '10rem', lineHeight: 1 }}>{countdown}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  if (goingLive && !isLive) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
          <p className="text-white text-xl font-bold mb-2">{t('common.loading')}</p>
          <p className="text-gray-400 text-sm">{t('studio.preparing')}</p>
        </div>
      </div>
    );
  }

  // ── DERIVED ──────────────────────────────────────────────────────────────────
  const audioVu    = isLive ? audioLevel : vuLevel / 100;
  const tipTotal   = tippers.reduce((s, t) => s + t.coins_total, 0);
  const tipGoal    = parseFloat(show.tip_goal) || 0;
  const tipGoalPct = tipGoal > 0 ? Math.min(100, (tipTotal / tipGoal) * 100) : 0;

  // ── DOCK SECTION HEADER ──────────────────────────────────────────────────────
  const renderDockSectionHeader = (sectionKey) => (
    <div
      className="px-2 py-1.5 border-b border-white/5 shrink-0 flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={e => onDockDragStart(e, sectionKey)}
      onDragOver={onDockDragOver}
      onDrop={e => onDockDrop(e, sectionKey)}
      title="Arrastrar para reordenar"
    >
      <FiMenu size={8} className="text-gray-700 shrink-0" />
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{DOCK_LABELS[sectionKey]}</span>
    </div>
  );

  // ── DOCK SECTION RENDERER ────────────────────────────────────────────────────
  const renderDockSection = (key) => {
    switch (key) {

      case 'escenas': return (
        <div key="escenas" className="w-32 border-r border-white/5 flex flex-col shrink-0">
          {renderDockSectionHeader('escenas')}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {[
              { k: 'broadcast', label: 'Broadcast',     icon: FiMonitor },
              { k: 'private',   label: 'Privado 1-a-1', icon: FiLock    },
            ].map(({ k, label, icon: Icon }) => (
              <button key={k} onClick={() => set('show_type', k)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-all ${show.show_type === k ? 'bg-brand-500/20 border border-brand-500/30 text-brand-300' : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/8 hover:text-gray-300'}`}
              >
                <Icon size={10} />
                <span className="text-[10px] font-medium truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      );

      case 'fuentes': return (
        <div key="fuentes" className="flex-1 border-r border-white/5 flex flex-col min-w-0">
          {renderDockSectionHeader('fuentes')}
          <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
            {/* Cámara — siempre visible */}
            <div className="flex items-center gap-1.5">
              <FiVideo size={9} className="text-gray-500 shrink-0" />
              {cameraDevices.length > 0 ? (
                <select className="flex-1 bg-[#1e1e24] border border-white/10 text-white text-[10px] rounded px-1.5 py-1 outline-none cursor-pointer"
                  value={selectedCameraId}
                  onChange={e => isLive ? switchLiveCamera(e.target.value) : switchCamera(e.target.value)}>
                  {cameraDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${d.deviceId.slice(0,6)}`}</option>)}
                </select>
              ) : (
                <span className="text-[10px] text-gray-600 flex-1 italic">Cámara — activa preview</span>
              )}
            </div>
            {/* Micrófono — siempre visible */}
            <div className="flex items-center gap-1.5">
              <FiMic size={9} className="text-gray-500 shrink-0" />
              {micDevices.length > 0 ? (
                <select className="flex-1 bg-[#1e1e24] border border-white/10 text-white text-[10px] rounded px-1.5 py-1 outline-none cursor-pointer"
                  value={selectedMicId}
                  onChange={e => isLive ? switchLiveMic(e.target.value) : switchMic(e.target.value)}>
                  {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,6)}`}</option>)}
                </select>
              ) : (
                <span className="text-[10px] text-gray-600 flex-1 italic">Micrófono — activa preview</span>
              )}
            </div>
            {/* Calidad (solo setup) */}
            {!isLive && (
              <div className="flex items-center gap-1.5">
                <FiMonitor size={9} className="text-gray-500 shrink-0" />
                <select className="flex-1 bg-[#1e1e24] border border-white/10 text-white text-[10px] rounded px-1.5 py-1 outline-none cursor-pointer"
                  value={videoQuality} onChange={e => setVideoQuality(e.target.value)}>
                  {QUALITY_OPTIONS.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              </div>
            )}
            {/* Compartir pantalla (solo en vivo y desktop) */}
            {isLive && isDesktop && (
              <button onClick={toggleScreenShare}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-all ${screenSharing ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'}`}
              >
                <FiMonitor size={9} /> {screenSharing ? 'Detener pantalla' : 'Compartir pantalla'}
              </button>
            )}
          </div>
        </div>
      );

      case 'mezclador': return (
        <div key="mezclador" className="w-52 border-r border-white/5 flex flex-col shrink-0">
          {renderDockSectionHeader('mezclador')}
          <div className="flex-1 p-2 flex flex-col gap-2">
            <div className="flex items-end gap-px" style={{ height: 36 }}>
              {Array.from({ length: 20 }).map((_, i) => {
                const active = audioVu > ((i + 1) / 20) * 0.8;
                const color  = i < 14 ? 'bg-green-500' : i < 17 ? 'bg-yellow-400' : 'bg-red-500';
                return (
                  <div key={i}
                    className={`flex-1 rounded-sm transition-all duration-75 ${active ? color : 'bg-white/10'}`}
                    style={{ height: `${28 + (i % 3) * 4}%` }}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isLive ? (cameraOff ? 'bg-red-500' : 'bg-green-400') : (permCamera === 'granted' ? 'bg-green-400' : 'bg-gray-600')}`} />
                <span className="text-[9px] text-gray-500">Cámara</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isLive ? (muted ? 'bg-red-500' : 'bg-green-400 animate-pulse') : (permMic === 'granted' ? 'bg-green-400 animate-pulse' : 'bg-gray-600')}`} />
                <span className="text-[9px] text-gray-500">Mic</span>
              </div>
            </div>
            {isLive ? (
              <div className="flex gap-1.5">
                <button onClick={toggleMute}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[9px] font-medium transition-all flex-1 justify-center ${muted ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'}`}
                >
                  {muted ? <FiMicOff size={10} /> : <FiMic size={10} />}
                  {muted ? 'Silenciado' : 'Mic ON'}
                </button>
                <button onClick={toggleCamera}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[9px] font-medium transition-all flex-1 justify-center ${cameraOff ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'}`}
                >
                  {cameraOff ? <FiVideoOff size={10} /> : <FiVideo size={10} />}
                  {cameraOff ? 'Cam OFF' : 'Cam ON'}
                </button>
              </div>
            ) : (
              <>
                <StatusPill status={permCamera} label="Cam" icon={permCamera === 'denied' ? FiVideoOff : FiVideo} />
                <StatusPill status={permMic}    label="Mic" icon={permMic    === 'denied' ? FiMicOff   : FiMic}   />
              </>
            )}
          </div>
        </div>
      );

      case 'controles': return (
        <div key="controles" className="w-48 flex flex-col shrink-0">
          {renderDockSectionHeader('controles')}
          <div className="flex-1 p-2 flex flex-col gap-2 justify-center">
            {isLive ? (
              <>
                <button onClick={handleEndShow}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs py-3 rounded transition-colors"
                >
                  <FiX size={13} /> Terminar show
                </button>
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={uploadingRec}
                  className={`w-full flex items-center justify-center gap-1.5 font-bold text-[10px] py-2 rounded transition-colors disabled:opacity-50 ${recording ? 'bg-red-700/40 border border-red-500/50 text-red-200 animate-pulse' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${recording ? 'bg-red-500' : 'bg-red-500'}`} />
                  {uploadingRec ? 'Subiendo...' : recording ? `Grabando ${fmtDuration(recDuration)}` : 'Grabar replay'}
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex items-end gap-px flex-1" style={{ height: 10 }}>
                    {[0.1, 0.3, 0.55, 0.3, 0.1].map((thr, i) => (
                      <div key={i}
                        className={`flex-1 rounded-sm transition-colors duration-75 ${!muted && audioLevel > thr ? 'bg-green-400' : 'bg-white/15'}`}
                        style={{ height: [4, 6, 10, 6, 4][i] }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-gray-500 shrink-0">{viewerCount} viewers</span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-gray-400 font-mono">{fmtDuration(liveDuration)}</span>
                </div>
              </>
            ) : (
              <>
                {!previewActive ? (
                  <button onClick={startPreview}
                    className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 text-[10px] font-medium py-2 rounded transition-all"
                  >
                    <FiVideo size={10} /> Activar preview
                  </button>
                ) : (
                  <button onClick={stopPreview}
                    className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-500 text-[10px] py-1.5 rounded transition-colors"
                  >
                    <FiRefreshCw size={9} /> Detener preview
                  </button>
                )}
                <button
                  onClick={startCountdown}
                  disabled={saving || !show.title.trim()}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 text-white font-bold text-xs py-2.5 rounded transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Ir en vivo
                </button>
                {!canGoLive && show.title.trim() && (
                  <p className="text-[9px] text-yellow-500/70 flex items-center gap-1">
                    <FiAlertCircle size={8} /> Activa preview primero
                  </p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !show.title.trim()}
                  className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-400 font-medium text-[10px] py-2 rounded border border-white/10 hover:border-white/20 transition-all"
                >
                  {saving
                    ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : <><FiSave size={10} /> Guardar</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      );

      default: return null;
    }
  };

  // ── DOCK PANEL ───────────────────────────────────────────────────────────────
  const renderDockPanel = () => layout.dockCollapsed ? (
    <div
      className={`h-6 bg-[#131316] flex items-center px-2 gap-3 shrink-0 ${layout.dockPosition === 'bottom' ? 'border-t' : 'border-b'} border-white/5`}
    >
      <button
        onClick={() => patchLayout({ dockCollapsed: false })}
        className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors shrink-0"
        title="Expandir dock"
      >
        {layout.dockPosition === 'bottom' ? <FiChevronUp size={10} /> : <FiChevronDown size={10} />}
      </button>
      {layout.dockOrder.map(k => (
        <span key={k} className="text-[9px] font-bold text-gray-700 uppercase tracking-wider">{DOCK_LABELS[k]}</span>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => patchLayout({ dockPosition: layout.dockPosition === 'bottom' ? 'top' : 'bottom' })}
        className="text-[9px] text-gray-700 hover:text-gray-500 transition-colors px-1"
        title={layout.dockPosition === 'bottom' ? 'Mover dock arriba' : 'Mover dock abajo'}
      >
        {layout.dockPosition === 'bottom' ? '↑ arriba' : '↓ abajo'}
      </button>
    </div>
  ) : (
    <div
      className={`bg-[#131316] flex shrink-0 ${layout.dockPosition === 'bottom' ? 'border-t' : 'border-b'} border-white/5`}
      style={{ height: layout.dockHeight }}
    >
      {layout.dockOrder.map(k => renderDockSection(k))}
      <div className="w-6 flex flex-col items-center py-1 gap-1.5 shrink-0 border-l border-white/5">
        <button
          onClick={() => patchLayout({ dockCollapsed: true })}
          className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
          title="Colapsar dock"
        >
          {layout.dockPosition === 'bottom' ? <FiChevronDown size={9} /> : <FiChevronUp size={9} />}
        </button>
        <button
          onClick={() => patchLayout({ dockPosition: layout.dockPosition === 'bottom' ? 'top' : 'bottom' })}
          className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors"
          title={layout.dockPosition === 'bottom' ? 'Mover dock arriba' : 'Mover dock abajo'}
        >
          {layout.dockPosition === 'bottom' ? <FiChevronUp size={9} /> : <FiChevronDown size={9} />}
        </button>
        <div className="flex-1" />
        <span className="text-[7px] text-gray-700 font-bold uppercase tracking-wider"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>DOCK</span>
      </div>
    </div>
  );

  // ── RIGHT PANEL FULL ─────────────────────────────────────────────────────────
  const renderRightPanelFull = () => {
    const hasPrivateAlert = !!privateRequest || privateMessages.length > 0;
    return (
      <div
        className={`bg-[#1c1c21] flex flex-col min-h-0 ${isDesktop ? 'shrink-0' : 'flex-1'}`}
        style={{
          width: isDesktop ? layout.rightWidth : '100%',
          borderLeft:  isDesktop && layout.rightSide === 'right' ? '1px solid rgba(255,255,255,0.05)' : 'none',
          borderRight: isDesktop && layout.rightSide === 'left'  ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}
      >
        {/* Header */}
        {/* Header del panel — solo en desktop para no duplicar info del header del studio */}
        <div className={`${!isDesktop && isLive ? 'hidden' : 'flex'} px-2 py-1 border-b border-white/5 shrink-0 items-center gap-1`}>
          {isLive && (
            <span className="flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full mr-1 shrink-0">
              <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" /> VIVO
            </span>
          )}
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex-1 truncate">
            {isLive ? fmtDuration(liveDuration) : 'Panel'}
          </span>
          {isDesktop && (
            <>
              <button
                onClick={() => patchLayout({ rightSide: layout.rightSide === 'right' ? 'left' : 'right' })}
                className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-700 hover:text-gray-300 transition-colors"
                title={layout.rightSide === 'right' ? 'Mover a la izquierda' : 'Mover a la derecha'}
              >
                {layout.rightSide === 'right' ? <FiChevronLeft size={10} /> : <FiChevronRight size={10} />}
              </button>
              <button
                onClick={() => patchLayout({ rightCollapsed: true })}
                className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-700 hover:text-gray-300 transition-colors"
                title="Colapsar panel"
              >
                {layout.rightSide === 'right' ? <FiChevronRight size={10} /> : <FiChevronLeft size={10} />}
              </button>
            </>
          )}
        </div>

        {/* Stats en vivo */}
        {isLive && (
          <div className="px-2 py-1.5 border-b border-white/5 shrink-0 grid grid-cols-4 gap-1">
            {[
              { val: viewerCount, sub: 'Ahora', cls: 'text-white' },
              { val: peakViewers, sub: 'Pico',  cls: 'text-white' },
              { val: `⚡${totalCoinsEarned}`, sub: `$${(totalCoinsEarned * 0.04).toFixed(2)}`, cls: 'text-yellow-400' },
              { val: tippers.length, sub: 'Tips', cls: 'text-white' },
            ].map((s, i) => (
              <div key={i} className="text-center py-1 rounded bg-dark-700/50">
                <p className={`font-black text-xs leading-none ${s.cls}`}>{s.val}</p>
                <p className={`text-[8px] mt-0.5 ${i === 2 ? 'text-green-400 font-medium' : 'text-gray-600'}`}>{s.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Controles rápidos móvil en vivo: Mic, Cam, Terminar */}
        {!isDesktop && isLive && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 shrink-0 bg-dark-800">
            <button
              onClick={toggleMute}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors ${muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-gray-300 border border-white/10'}`}
            >
              {muted ? <FiMicOff size={13} /> : <FiMic size={13} />}
              {muted ? 'Off' : 'Mic'}
            </button>
            <button
              onClick={toggleCamera}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors ${cameraOff ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-gray-300 border border-white/10'}`}
            >
              {cameraOff ? <FiVideoOff size={13} /> : <FiVideo size={13} />}
              {cameraOff ? 'Off' : 'Cam'}
            </button>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={uploadingRec}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors ${recording ? 'bg-red-600 text-white animate-pulse' : 'bg-white/5 text-gray-300 border border-white/10'} disabled:opacity-50`}
              title={recording ? 'Detener grabación' : 'Grabar replay'}
            >
              <span className={`w-2 h-2 rounded-full ${recording ? 'bg-white' : 'bg-red-500'}`} />
              {uploadingRec ? '...' : recording ? fmtDuration(recDuration) : 'REC'}
            </button>
            <button
              onClick={handleEndShow}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shrink-0"
            >
              <FiX size={14} /> Fin
            </button>
          </div>
        )}

        {/* 4 Tabs — siempre visibles */}
        <div className="flex border-b border-white/5 shrink-0">
          {[
            { key: 'config',  label: '⚙ Config' },
            { key: 'chat',    label: isLive ? `💬 ${chatMessages.length > 0 ? chatMessages.length : 'Chat'}` : '💬 Chat' },
            { key: 'private', label: `🔒${hasPrivateAlert ? ' 🔴' : ''}${privateMessages.length > 0 ? ` ${privateMessages.length}` : ''}` },
            { key: 'poll',    label: '📊 Poll' },
            { key: 'cohosts', label: '🎬 Co' },
            { key: 'viewers', label: isLive ? `👥 ${viewerCount}` : '👥' },
          ].map(t => (
            <button key={t.key} onClick={() => setRightTab(t.key)}
              className={`flex-1 py-1.5 text-[9px] font-semibold transition-colors border-b-2 truncate px-0.5 ${rightTab === t.key ? 'text-white border-brand-500' : 'text-gray-600 border-transparent hover:text-gray-400'}`}
            >{t.label}</button>
          ))}
        </div>

        {/* ── TAB Config ── */}
        {rightTab === 'config' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {/* Banner "Aplicar cambios" — solo en vivo, cuando hay diff con el snapshot */}
            {isLive && liveDirty && (
              <div className="sticky top-0 -mx-3 px-3 py-2 bg-amber-500/10 border-y border-amber-500/30 backdrop-blur-md z-10 flex items-center gap-2">
                <div className="text-amber-300 text-[10px] flex-1">
                  <p className="font-bold leading-tight">Cambios sin aplicar</p>
                  <p className="text-amber-400/70 text-[9px]">Los viewers verán la nueva info al aplicar</p>
                </div>
                <button
                  onClick={applyLiveChanges}
                  disabled={savingLive}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-black rounded transition-colors disabled:opacity-50 shrink-0"
                >
                  {savingLive ? 'Aplicando…' : 'Aplicar'}
                </button>
              </div>
            )}
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Título *</label>
              <input className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 placeholder-gray-600 outline-none focus:border-brand-500/50 transition-colors"
                placeholder="Ej: Sesión de baile 🔥"
                value={show.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Descripción</label>
              <textarea className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 placeholder-gray-600 outline-none resize-none focus:border-brand-500/50 transition-colors" rows={2}
                placeholder="Cuéntales a tus fans…"
                value={show.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Categoría</label>
              <div className="flex flex-wrap gap-1">
                {SHOW_CATEGORIES
                  .filter(c => c.key !== 'adult' || profile?.is_adult_creator)
                  .map(({ key, label, emoji }) => (
                    <button key={key} onClick={() => set('category', key)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${show.category === key ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >{emoji} {label}</button>
                  ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Precio ticket ($)</label>
              <input className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 placeholder-gray-600 outline-none focus:border-brand-500/50 transition-colors"
                type="number" placeholder="0 = gratis"
                value={show.ticket_price} onChange={e => set('ticket_price', e.target.value)} min="0" step="0.01" />
              {show.ticket_price > 0 && (
                <p className="text-[10px] text-gray-600 mt-1">Recibirás ${(parseFloat(show.ticket_price) * 0.7).toFixed(2)} (70%)</p>
              )}
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 flex items-center gap-1"><FiCalendar size={9} /> Programar</label>
              <input className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 outline-none focus:border-brand-500/50 transition-colors"
                type="datetime-local"
                value={show.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Meta de propinas (coins)</label>
              <div className="flex gap-1.5">
                <input className="flex-1 bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors"
                  type="number" placeholder="Ej: 500"
                  value={show.tip_goal} onChange={e => set('tip_goal', e.target.value)} min="0" />
                {isLive && (
                  <button
                    onClick={async () => {
                      try {
                        await api.patch(`/api/shows/${showId}/tip-goal`, { tip_goal: parseFloat(show.tip_goal) || null });
                        toast.success('Meta actualizada');
                      } catch { toast.error('Error al actualizar meta'); }
                    }}
                    className="px-2.5 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold rounded transition-colors shrink-0"
                  >
                    Aplicar
                  </button>
                )}
              </div>
              {tipGoal > 0 && (
                <p className="text-[9px] text-yellow-600 mt-1">Meta activa: {tipGoal.toLocaleString()} coins</p>
              )}
            </div>
            {isLive && tipGoal > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-yellow-400">⚡ Meta de propinas</span>
                  <span className="text-yellow-400 font-bold">{tipTotal.toLocaleString()} / {tipGoal.toLocaleString()}</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-yellow-500 transition-all" style={{ width: `${tipGoalPct}%` }} />
                </div>
                {tipGoalPct >= 100 && <p className="text-[9px] text-yellow-400 text-center mt-1 font-bold">🎉 ¡Meta alcanzada!</p>}
              </div>
            )}

            {/* ── BOTONES DE ACCIÓN — solo móvil (en desktop están en el dock) ── */}
            {!isDesktop && (
              <div className="space-y-2 pt-2 border-t border-white/5">
                {isLive ? (
                  <button
                    onClick={handleEndShow}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-3 rounded-xl transition-colors"
                  >
                    <FiX size={16} /> Terminar show
                  </button>
                ) : (
                  <>
                    <button
                      onClick={startCountdown}
                      disabled={goingLive || !show.title.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-xl transition-colors"
                    >
                      {goingLive
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Ir en vivo</>
                      }
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !show.title.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 font-medium text-sm py-2.5 rounded-xl border border-white/10 transition-all"
                    >
                      {saving
                        ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        : <><FiSave size={14} /> Guardar para después</>
                      }
                    </button>
                    {!show.title.trim() && (
                      <p className="text-[11px] text-yellow-500/70 text-center flex items-center justify-center gap-1">
                        <FiAlertCircle size={11} /> Escribe un título para continuar
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB Chat ── */}
        {rightTab === 'chat' && (
          isLive ? (
            <>
              {tippers.length > 0 && (
                <div className="px-3 py-2 border-b border-white/5 shrink-0">
                  <p className="text-gray-500 text-[9px] font-bold uppercase tracking-wide mb-1.5">Top propinas</p>
                  {tippers.slice(0, 3).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black w-3 shrink-0" style={{ color: ['#FFD700','#C0C0C0','#CD7F32'][i] }}>#{i+1}</span>
                      <img loading="lazy" src={t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.full_name||'U')}&size=32&background=1a1a2e&color=f43f5e`}
                        className="w-4 h-4 rounded-full object-cover shrink-0" alt="" />
                      <span className="text-white text-[10px] flex-1 truncate">{t.full_name}</span>
                      <span className="text-yellow-400 text-[10px] font-bold shrink-0">⚡{t.coins_total}</span>
                    </div>
                  ))}
                </div>
              )}
              <AnimatePresence>
                {pinnedMessage && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
                    <div className="px-3 py-1.5 bg-brand-500/10 border-b border-brand-500/20 flex items-start gap-1.5">
                      <FiBookmark size={10} className="text-brand-400 shrink-0 mt-0.5" />
                      <p className="text-brand-200 text-[10px] leading-tight flex-1">{pinnedMessage}</p>
                      <button onClick={() => { setPinnedMessage(''); setPinnedInput(''); }} className="text-gray-500 hover:text-gray-300 shrink-0 transition-colors"><FiX size={10} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
                {chatMessages.length === 0
                  ? <p className="text-gray-600 text-[10px] text-center py-4">El chat está vacío</p>
                  : chatMessages.slice(-60).map((msg, i) => (
                    <div key={i} className="flex items-start gap-1 group">
                      {msg.avatar
                        ? <img loading="lazy" src={msg.avatar} className="w-4 h-4 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                        : <div className="w-4 h-4 rounded-full bg-brand-500/30 shrink-0 mt-0.5" />
                      }
                      <div className="bg-dark-700/80 rounded-lg px-2 py-1 min-w-0 flex-1">
                        <span className="text-brand-300 text-[9px] font-semibold">{msg.name}</span>
                        <p className="text-white text-[10px] leading-tight break-words">{msg.text}</p>
                      </div>
                      {msg.userId && msg.userId !== user?.id && !bannedUsers.has(msg.userId) && (
                        <button onClick={() => handleBanUser(msg)}
                          className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center shrink-0 mt-1 transition-opacity"
                        ><FiSlash size={8} className="text-red-400" /></button>
                      )}
                    </div>
                  ))
                }
                <div ref={chatEndRef} />
              </div>
              <div className="px-2 pt-1 pb-1 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  <button onClick={() => setShowPinInput(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-all ${showPinInput || pinnedMessage ? 'bg-brand-500/20 border border-brand-500/40 text-brand-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'}`}
                  ><FiBookmark size={9} /> Fijar</button>
                  <button onClick={() => setShowModeration(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-all ${showModeration ? 'bg-red-500/20 border border-red-500/40 text-red-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'}`}
                  ><FiSlash size={9} /> Mod</button>
                  <button onClick={handleToggleSlowMode}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-all ${slowMode ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'}`}
                  >🐢 {slowMode ? '30s' : 'Lento'}</button>
                </div>
                <AnimatePresence>
                  {showPinInput && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden mb-1.5">
                      <div className="flex gap-1.5">
                        <input className="flex-1 bg-dark-700 border border-white/10 text-white text-[10px] rounded px-2 py-1 placeholder-gray-500 outline-none"
                          placeholder="Mensaje a fijar…" value={pinnedInput}
                          onChange={e => setPinnedInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSavePinnedMessage()} maxLength={100} />
                        <button onClick={handleSavePinnedMessage} className="px-2 py-1 bg-brand-500 hover:bg-brand-600 text-white text-[9px] rounded font-medium transition-colors">Fijar</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {showModeration && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden mb-1.5">
                      <div className="bg-dark-700 rounded-lg p-2 max-h-28 overflow-y-auto">
                        {chatMessages.slice(-8).reverse().map((msg, i) => (
                          <div key={i} className="flex items-center gap-1.5 py-0.5 border-b border-white/5 last:border-0">
                            <span className="text-white text-[9px] flex-1 truncate"><span className="text-brand-300">{msg.name}:</span> {msg.text}</span>
                            {msg.userId && msg.userId !== user?.id && !bannedUsers.has(msg.userId) && (
                              <button onClick={() => handleBanUser(msg)} className="w-4 h-4 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center shrink-0">
                                <FiSlash size={8} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {bannedUsers.size > 0 && (
                        <div className="bg-dark-700 rounded-lg p-2 mt-1 max-h-20 overflow-y-auto">
                          <p className="text-[9px] font-bold text-white mb-1">Baneados ({bannedUsers.size})</p>
                          {[...bannedUsers.entries()].map(([uid, name]) => (
                            <div key={uid} className="flex items-center gap-1.5 py-0.5">
                              <span className="text-gray-300 text-[9px] flex-1 truncate">{name}</span>
                              <button onClick={() => handleUnbanUser(uid, name)} className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                                <FiRotateCw size={8} className="text-green-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="px-2 py-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-dark-700 rounded-lg px-2.5 py-1.5 border border-white/5 mb-1.5">
                  <input className="flex-1 bg-transparent text-white text-xs placeholder-gray-500 outline-none"
                    placeholder="Escribe al chat…" value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()} maxLength={120} />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim()}
                    className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0 disabled:opacity-40" aria-label="Enviar">
                    <FiSend size={10} className="text-white" />
                  </button>
                </div>
                <div className="flex gap-1 justify-center">
                  {REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => sendReaction(emoji)}
                      className="w-7 h-7 rounded-full bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-sm active:scale-90 transition-transform"
                    >{emoji}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                <FiSend size={20} className="text-brand-400/50" />
              </div>
              <p className="text-gray-500 text-xs font-medium">Chat disponible en vivo</p>
              <p className="text-gray-700 text-[10px] leading-relaxed">El chat aparecerá aquí cuando empieces a transmitir. Los espectadores podrán enviarte mensajes en tiempo real.</p>
            </div>
          )
        )}

        {/* ── TAB Privado ── */}
        {rightTab === 'private' && (
          isLive ? (
            <div className="flex flex-col min-h-0 flex-1">
              {/* Solicitud pendiente */}
              <AnimatePresence>
                {privateRequest && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden shrink-0"
                  >
                    <div className="px-3 py-3 bg-purple-500/10 border-b-2 border-purple-500/30">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wide">Solicitud de show privado</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        {privateRequest.viewerAvatar
                          ? <img loading="lazy" src={privateRequest.viewerAvatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                          : <div className="w-9 h-9 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm shrink-0">{privateRequest.viewerName[0]}</div>
                        }
                        <div className="min-w-0">
                          <p className="text-white text-xs font-bold truncate">{privateRequest.viewerName}</p>
                          <p className="text-purple-300 text-[10px]">
                            {privateRequest.type === 'exclusive' ? 'Exclusivo' : 'Privado'} · <span className="font-bold">{privateRequest.rate} coins/min</span>
                          </p>
                          <p className="text-green-400 text-[9px]">+{Math.round(privateRequest.rate * 0.7)} coins/min para ti</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAcceptPrivate}
                          className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors"
                        >✓ Aceptar</button>
                        <button onClick={handleDeclinePrivate}
                          className="flex-1 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 text-xs font-medium transition-colors"
                        >✕ Rechazar</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Modo actual */}
              <div className="px-3 py-2 border-b border-white/5 shrink-0 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${show.show_type === 'private' ? 'bg-purple-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-[10px] text-gray-400 flex-1">
                  {show.show_type === 'private' ? 'Modo: Privado 1-a-1' : 'Modo: Broadcast'}
                </span>
                <button
                  onClick={() => set('show_type', show.show_type === 'private' ? 'broadcast' : 'private')}
                  className={`text-[9px] px-2 py-0.5 rounded font-medium transition-all ${show.show_type === 'private' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'}`}
                >
                  {show.show_type === 'private' ? '→ Broadcast' : '→ Privado'}
                </button>
              </div>
              {/* Mensajes privados */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-0">
                {privateMessages.length === 0
                  ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                      <FiLock size={20} className="text-gray-700" />
                      <p className="text-gray-600 text-[10px]">Sin mensajes privados aún</p>
                    </div>
                  )
                  : privateMessages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      {msg.fromAvatar
                        ? <img loading="lazy" src={msg.fromAvatar} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                        : <div className="w-5 h-5 rounded-full bg-purple-500/30 flex items-center justify-center shrink-0 mt-0.5 text-[9px] text-purple-300">{(msg.fromName||'?')[0]}</div>
                      }
                      <div className="bg-purple-900/30 border border-purple-500/20 rounded-lg px-2 py-1 min-w-0">
                        <span className="text-purple-300 text-[9px] font-semibold">{msg.fromName}</span>
                        <p className="text-white text-[10px] leading-tight break-words">{msg.text}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
              <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-3">
                <p className="text-purple-300 text-[10px] font-bold flex items-center gap-1.5 mb-1">
                  <FiLock size={10} /> Shows privados 1-a-1
                </p>
                <p className="text-gray-600 text-[9px] leading-relaxed">
                  Los espectadores pueden solicitar un show privado. Recibes el 70% de las coins por minuto.
                </p>
              </div>
              {[
                { key: 'private_rate',       label: 'Tarifa privado (coins/min)',    hint: 'El espectador paga por cada minuto de show privado', min: 1, max: 500 },
                { key: 'exclusive_rate',     label: 'Tarifa exclusivo (coins/min)', hint: 'Solo ese espectador puede ver el show', min: 1, max: 500 },
                { key: 'min_private_minutes', label: 'Duración mínima (min)',        hint: 'Mínimo que se cobrará al aceptar', min: 1, max: 60 },
                { key: 'private_countdown_sec', label: 'Cuenta regresiva al iniciar privado (segundos)',
                  hint: 'Tiempo que ven los demás antes de que cambie a privado/exclusivo. Mínimo 5s, máximo 180s (3 min).', min: 5, max: 180 },
              ].map(({ key, label, hint, min, max }) => (
                <div key={key}>
                  <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">{label}</label>
                  <p className="text-[9px] text-gray-700 mb-1.5">{hint}</p>
                  <input className="w-full bg-[#111115] border border-white/10 text-white text-xs rounded px-2.5 py-1.5 outline-none focus:border-brand-500/50 transition-colors text-center"
                    type="number" min={min} max={max}
                    value={show[key]}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '' || (parseInt(v) >= min && parseInt(v) <= max)) {
                        set(key, v);
                      } else {
                        set(key, String(Math.max(min, Math.min(max, parseInt(v) || min))));
                      }
                    }} />
                </div>
              ))}

              {/* Gift goals: viral mechanic — viewers mandan gifts para
                  desbloquear acciones del host (cambiar outfit, etc.) */}
              <GiftGoalsManager
                showId={showId}
                isLive={isLive}
                initialGoals={giftGoals}
              />

              {/* Slow mode chat + RTMP relay (v64/v65) */}
              {showId && <ShowAdvancedPanel showId={showId} />}
            </div>
          )
        )}

        {/* ── TAB Poll (encuestas en vivo) ── */}
        {rightTab === 'poll' && (
          <PollPanel showId={showId} isLive={isLive} />
        )}

        {/* ── TAB Co-hosts ── */}
        {rightTab === 'cohosts' && (
          <CoHostsPanel showId={showId} />
        )}

        {/* ── TAB Viewers ── */}
        {rightTab === 'viewers' && (
          isLive ? (
            <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
              <div className="bg-dark-700/50 rounded-lg p-2 mb-2">
                <p className="text-white font-bold text-xs mb-1">{viewerCount} viendo ahora</p>
                {(() => {
                  const vipC  = viewerList.filter(v => v.tier === 'vip').length;
                  const premC = viewerList.filter(v => v.tier === 'premium').length;
                  const basC  = viewerList.filter(v => !v.tier || v.tier === 'basic').length;
                  return (
                    <>
                      {vipC  > 0 && <p className="text-[9px] text-yellow-400">👑 VIP: {vipC}</p>}
                      {premC > 0 && <p className="text-[9px] text-brand-400">⭐ Premium: {premC}</p>}
                      {basC  > 0 && <p className="text-[9px] text-gray-500">Básico: {basC}</p>}
                    </>
                  );
                })()}
              </div>
              <div className="space-y-1">
                {viewerList.filter(v => v.role === 'viewer').map((v, i) => (
                  <div key={v.userId || i} className="flex items-center gap-1.5">
                    {v.avatar
                      ? <img loading="lazy" src={v.avatar} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                      : <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">{(v.name||'?')[0]}</div>
                    }
                    <span className="text-white text-[10px] flex-1 truncate">{v.name || 'Anónimo'}</span>
                    {v.tier === 'vip'     && <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 py-0.5 rounded-full font-bold shrink-0">VIP</span>}
                    {v.tier === 'premium' && <span className="text-[8px] bg-brand-500/20 text-brand-400 px-1 py-0.5 rounded-full font-bold shrink-0">PRO</span>}
                  </div>
                ))}
                {viewerList.filter(v => v.role === 'viewer').length === 0 && (
                  <p className="text-gray-600 text-[10px] text-center py-4">Sin espectadores aún</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FiUsers size={24} className="text-gray-700" />
              <p className="text-gray-500 text-xs font-medium">Sin espectadores aún</p>
              <p className="text-gray-700 text-[10px]">La lista aparecerá cuando empieces en vivo.</p>
            </div>
          )
        )}
      </div>
    );
  };

  // ── RIGHT PANEL COLLAPSED ─────────────────────────────────────────────────────
  const renderRightPanelCollapsed = () => (
    <div
      className="w-7 bg-[#1c1c21] flex flex-col items-center py-2 gap-2 shrink-0"
      style={{ borderLeft: layout.rightSide === 'right' ? '1px solid rgba(255,255,255,0.05)' : 'none', borderRight: layout.rightSide === 'left' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
    >
      <button
        onClick={() => patchLayout({ rightCollapsed: false })}
        className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
        title="Expandir panel"
      >
        {layout.rightSide === 'right' ? <FiChevronLeft size={10} /> : <FiChevronRight size={10} />}
      </button>
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[8px] text-gray-600 font-bold uppercase tracking-wider select-none"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >{isLive ? 'CHAT' : 'CONFIG'}</span>
      </div>
    </div>
  );

  // ── RESIZE HANDLES ───────────────────────────────────────────────────────────
  const renderResizeHandleV = () => (
    <div
      className="w-1 bg-white/0 hover:bg-brand-500/30 active:bg-brand-500/50 cursor-col-resize transition-colors shrink-0 group"
      onMouseDown={e => startResize('right', e)}
      title="Arrastrar para redimensionar"
    >
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-8 w-0.5 rounded-full bg-white/0 group-hover:bg-brand-500/60 transition-colors" />
      </div>
    </div>
  );

  const renderResizeHandleH = () => (
    <div
      className="h-1 bg-white/0 hover:bg-brand-500/30 active:bg-brand-500/50 cursor-row-resize transition-colors shrink-0 group"
      onMouseDown={e => startResize('dock', e)}
      title="Arrastrar para redimensionar"
    >
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-8 h-0.5 rounded-full bg-white/0 group-hover:bg-brand-500/60 transition-colors" />
      </div>
    </div>
  );

  // ── CANVAS ───────────────────────────────────────────────────────────────────
  const renderCanvas = () => (
    <div ref={canvasContainerRef} className="flex-1 bg-black relative flex items-center justify-center min-w-0 overflow-hidden">
      {!isLive && previewActive && permCamera === 'granted' && (
        <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
      )}
      {isLive && (
        <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      )}
      {!isLive && !(previewActive && permCamera === 'granted') && (
        <div className="flex flex-col items-center justify-center gap-3 pointer-events-none">
          {permCamera === 'denied' ? (
            <>
              <FiVideoOff size={40} className="text-red-400/50" />
              <p className="text-red-400/70 text-sm text-center px-8">Permiso de cámara denegado.<br />Revisa la configuración del navegador.</p>
            </>
          ) : permCamera === 'checking' ? (
            <>
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">{t('studio.preparing')}</p>
            </>
          ) : (
            <>
              <FiVideo size={40} className="text-white/8" />
              <p className="text-white/15 text-sm">Sin fuente de video activa</p>
            </>
          )}
        </div>
      )}
      {isLive && cameraOff && (
        <div className="absolute inset-0 bg-[#0a0a0c] flex flex-col items-center justify-center pointer-events-none">
          <FiVideoOff className="text-gray-700 mb-2" size={48} />
          <p className="text-gray-600 text-sm">{t('studio.camera_off')}</p>
        </div>
      )}
      {!isLive && previewActive && permCamera === 'granted' && (
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
          backgroundSize: '10% 10%',
        }} />
      )}
      {(isLive || (previewActive && permCamera === 'granted')) && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 border border-white/10 rounded px-2 py-1 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-[10px] font-bold tracking-wider">{isLive ? t('live.live_now') : t('studio.preview').toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-3 right-3 bg-black/50 border border-white/10 rounded px-2 py-0.5 pointer-events-none">
        <span className="text-white/35 text-[10px] font-mono">{videoQuality}</span>
      </div>
      {isLive && tipGoal > 0 && (
        <DraggableTipGoal
          collected={tipTotal}
          goal={tipGoal}
          containerRef={canvasContainerRef}
        />
      )}
      {isLive && (
        <div className="absolute top-4 left-4 pointer-events-none z-10">
          <AnimatePresence>
            {giftAnimations.map(g => (
              <motion.div key={g.id}
                initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -100, scale: 1.2 }}
                exit={{ opacity: 0 }} transition={{ duration: 2.4, ease: 'easeOut' }}
                className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 mb-1"
              >
                {g.imageUrl ? <img loading="lazy" src={g.imageUrl} alt="" className="w-6 h-6 object-contain" /> : <span className="text-xl">{g.emoji}</span>}
                <span className="text-white text-xs font-medium">{g.senderName}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {isLive && (
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
      )}
      {/* Banner MODO PRIVADO + tile del viewer (cam2cam exclusive) */}
      {isLive && privateSession && (
        <>
          {privateSession.state === 'countdown' ? (
            <PrivateCountdownBannerHost
              endsAt={privateSession.countdownEndsAt}
              type={privateSession.type}
              viewerName={privateSession.viewerName}
            />
          ) : privateSession.state === 'ended' ? (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-600/95 backdrop-blur-md rounded-2xl px-3 py-2 flex items-center gap-2 shadow-2xl shadow-amber-500/40">
              <span className="text-white text-[10px] font-black tracking-wider">⏸️ EN PAUSA</span>
              <span className="text-amber-100 text-[10px]">· Show no transmite</span>
              <button
                onClick={handleResumePublicShow}
                className="bg-white text-amber-700 hover:brightness-110 rounded-full px-2.5 py-0.5 text-[10px] font-black"
              >{t('studio.switch_to_public')}</button>
            </div>
          ) : (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-purple-600/90 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg shadow-purple-500/40">
              <span className="text-white text-[10px] font-black tracking-wider">
                🔒 {privateSession.type === 'exclusive' ? 'CAM2CAM' : 'PRIVADO'}
              </span>
              <span className="text-purple-100 text-[10px]">·</span>
              <span className="text-white text-[10px] font-bold truncate max-w-[120px]">
                {privateSession.viewerName}
              </span>
              <span className="text-purple-100 text-[10px]">·</span>
              <span className="text-yellow-300 text-[10px] font-black">{privateSession.rate}/min</span>
              <PrivateMinTimer minEndsAt={privateSession.minEndsAt} />
              <button
                onClick={handleEndPrivateShow}
                className="ml-1 bg-white/15 hover:bg-white/25 rounded-full px-2 py-0.5 text-white text-[9px] font-bold"
                aria-label="Terminar show privado"
              >{t('studio.end_show')}</button>
            </div>
          )}
          {/* Tile cámara del viewer (solo cam2cam exclusive) */}
          {privateSession.type === 'exclusive' && (
            <div className="absolute bottom-20 left-3 z-20 w-32 sm:w-40 aspect-[3/4] rounded-xl overflow-hidden border-2 border-purple-500 shadow-2xl shadow-purple-500/40 bg-black">
              {privateViewerStream ? (
                <video
                  // callback-ref: setea srcObject al montarse — el ref.current
                  // anterior podía ser null cuando `reconnectToRoom` corría
                  // antes del primer render del <video>.
                  ref={(el) => {
                    privateViewerVideoRef.current = el;
                    if (el && privateViewerStream && el.srcObject !== privateViewerStream) {
                      el.srcObject = privateViewerStream;
                    }
                  }}
                  autoPlay playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center px-2">
                  <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-purple-300 text-[10px] font-bold">Esperando cámara de</p>
                  <p className="text-white text-xs font-bold truncate">{privateSession.viewerName}</p>
                </div>
              )}
              <div className="absolute top-1 left-1 bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">
                {privateSession.viewerName?.split(' ')[0] || 'Viewer'}
              </div>
            </div>
          )}
        </>
      )}
      {/* Tile del oponente durante battle: aparece arriba-derecha con su
          cámara. Antes del primer track, muestra spinner "Esperando…". */}
      {isLive && activeBattle && (
        <div className="absolute top-20 right-3 z-20 w-32 sm:w-40 aspect-[3/4] rounded-xl overflow-hidden border-2 border-pink-500 shadow-2xl shadow-pink-500/40 bg-black">
          {opponentStream ? (
            <video
              ref={(el) => {
                opponentVideoRef.current = el;
                if (el && opponentStream && el.srcObject !== opponentStream) {
                  el.srcObject = opponentStream;
                }
              }}
              autoPlay playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center px-2">
              <div className="w-6 h-6 border-2 border-pink-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-pink-300 text-[10px] font-bold">Esperando cámara del oponente</p>
            </div>
          )}
          <div className="absolute top-1 left-1 bg-pink-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded">
            ⚔️ Oponente
          </div>
        </div>
      )}

      {/* Battle overlay: host es host1 si el battle se invitó desde su show1 */}
      {isLive && activeBattle && (
        <BattleOverlay
          battleId={activeBattle.id}
          viewerSide={
            activeBattle.host1_id === user?.id ? 'host1'
            : activeBattle.host2_id === user?.id ? 'host2'
            : 'viewer'
          }
          onEnded={handleBattleEnded}
        />
      )}
    </div>
  );

  // ── UNIFIED LAYOUT ───────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#1a1a1e] overflow-hidden select-none">

      {/* Title bar */}
      <div className="h-9 bg-[#0d0d0f] border-b border-white/5 flex items-center px-3 gap-2.5 shrink-0">
        <button
          onClick={async () => {
            if (isLive) {
              const ok = await confirm({
                title: '¿Terminar el show?',
                message: 'Vas a cerrar la transmisión en vivo. Tu audiencia será desconectada y la grabación se guardará.',
                confirmLabel: 'Terminar show',
                destructive: true,
              });
              if (ok) handleEndShow();
            } else {
              stopPreview();
              navigate('/creator/dashboard');
            }
          }}
          aria-label="Cerrar show"
          className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
        >
          <FiArrowLeft size={12} className="text-gray-400" />
        </button>
        <div className="w-5 h-5 bg-brand-500/20 rounded flex items-center justify-center shrink-0">
          <FiMonitor size={11} className="text-brand-400" />
        </div>

        {isLive ? (
          <>
            <span className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> EN VIVO
            </span>
            <span className="text-white font-mono text-xs font-semibold tabular-nums shrink-0">{fmtDuration(liveDuration)}</span>
            {show.title && <span className="text-gray-400 text-xs truncate max-w-[160px] hidden sm:block">· {show.title}</span>}
            {connState !== 'connected' && (
              <span className={`text-[10px] flex items-center gap-1 shrink-0 ${connState === 'reconnecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                {connState === 'reconnecting' ? <FiWifi size={10} className="animate-pulse" /> : <FiWifiOff size={10} />}
                {connState === 'reconnecting' ? 'Reconectando…' : 'Sin conexión'}
              </span>
            )}
            <div className="flex-1" />
            <span className="flex items-center gap-1 text-xs text-gray-300 shrink-0"><FiUsers size={11} />{viewerCount}</span>
            <span className="flex items-center gap-1 text-xs text-yellow-400 font-bold shrink-0"><FiZap size={11} />{totalCoinsEarned}</span>
            {!activeBattle && (
              <button
                onClick={() => setShowBattleSearch(s => !s)}
                className="px-2 h-6 rounded bg-pink-500/15 hover:bg-pink-500/25 text-pink-300 text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                title="Lanzar battle 1v1"
                aria-label="Lanzar battle"
              >
                ⚔️ Battle
              </button>
            )}
            <button onClick={handleCopyLink} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors shrink-0" title="Copiar link" aria-label="Copiar">
              <FiCopy size={11} className="text-gray-400" />
            </button>
          </>
        ) : (
          <>
            <span className="text-white text-xs font-semibold">{t('studio.title')}</span>
            {show.title && <span className="text-gray-500 text-xs truncate max-w-[160px]">— {show.title}</span>}
            <div className="flex-1" />
            {activeReconnect && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded px-2 py-1 shrink-0">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-[10px] font-semibold truncate max-w-[120px]">{activeReconnect.title}</span>
                <button onClick={() => handleReconnect(activeReconnect)}
                  className="text-red-400 hover:text-red-300 text-[10px] font-bold transition-colors"
                >Reconectar</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* ── LAYOUT MÓVIL ── */}
        {!isDesktop ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Cámara — full bleed cuando live, preview compacta cuando setup
                IMPORTANTE: usar flex para que renderCanvas (flex-1) llene la altura */}
            <div className="shrink-0 flex" style={{ height: isLive ? '50vh' : '220px' }}>
              {renderCanvas()}
            </div>
            {/* Panel — chat/controles cuando live, config cuando preview */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {renderRightPanelFull()}
            </div>
          </div>
        ) : (
          /* ── LAYOUT DESKTOP: dock + canvas + panel lateral ── */
          <>
            {layout.dockPosition === 'top' && (
              <>
                {renderDockPanel()}
                {renderResizeHandleH()}
              </>
            )}

            <div className="flex-1 flex min-h-0">
              {layout.rightSide === 'left' && (
                layout.rightCollapsed
                  ? renderRightPanelCollapsed()
                  : <>{renderRightPanelFull()}{renderResizeHandleV()}</>
              )}
              {renderCanvas()}
              {layout.rightSide === 'right' && (
                layout.rightCollapsed
                  ? renderRightPanelCollapsed()
                  : <>{renderResizeHandleV()}{renderRightPanelFull()}</>
              )}
            </div>

            {layout.dockPosition === 'bottom' && (
              <>
                {renderResizeHandleH()}
                {renderDockPanel()}
              </>
            )}
          </>
        )}
      </div>

      {/* Status bar — oculto en móvil para no desperdiciar espacio */}
      <div className="hidden lg:flex h-5 bg-[#0d0d0f] border-t border-white/5 items-center px-3 gap-4 shrink-0">
        {isLive ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] text-red-400 font-semibold">{t('live.live_now')}</span>
            </div>
            <span className="text-[9px] text-gray-600 font-mono">{fmtDuration(liveDuration)}</span>
            <span className="text-[9px] text-gray-600">{viewerCount} viewers · pico {peakViewers}</span>
            <span className="text-[9px] text-yellow-600">⚡{totalCoinsEarned}</span>
            {connState !== 'connected' && (
              <span className={`text-[9px] ${connState === 'reconnecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                {connState === 'reconnecting' ? '⟳ Reconectando…' : '✕ Sin conexión'}
              </span>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${permCamera === 'granted' ? 'bg-green-400' : permCamera === 'denied' ? 'bg-red-500' : 'bg-gray-600'}`} />
              <span className="text-[9px] text-gray-600">{t('studio.camera')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${permMic === 'granted' ? 'bg-green-400 animate-pulse' : permMic === 'denied' ? 'bg-red-500' : 'bg-gray-600'}`} />
              <span className="text-[9px] text-gray-600">{t('studio.microphone')}</span>
            </div>
            <span className="text-[9px] text-gray-700">{videoQuality}</span>
            <span className="text-[9px] text-gray-700">
              {SHOW_CATEGORIES.find(c => c.key === show.category)?.emoji} {SHOW_CATEGORIES.find(c => c.key === show.category)?.label}
            </span>
          </>
        )}
        <div className="flex-1" />
        {/* Toggle de captions live */}
        {isLive && captionsSupported && (
          <button
            onClick={() => setCaptionsOn(v => !v)}
            title={captionsOn ? 'Apagar subtítulos' : 'Encender subtítulos en vivo'}
            className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
              captionsOn ? 'bg-purple-500/20 text-purple-300' : 'bg-dark-700 text-gray-500 hover:text-white'
            }`}
          >
            CC {captionsOn ? 'ON' : 'OFF'}
          </button>
        )}
        <span className="text-[9px] text-gray-700">Destino TV Studio</span>
      </div>

      {/* Animación full-screen para regalos >= 200 coins (host también la ve) */}
      <BigGiftAnimation gift={bigGiftQueue.current} onComplete={bigGiftQueue.dequeue} />

      {/* Modal para invitar a otro creator a un battle */}
      <AnimatePresence>
        {showBattleSearch && isLive && !activeBattle && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 glass z-[70] flex items-center justify-center p-4"
            onClick={() => setShowBattleSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              role="dialog" aria-modal="true" aria-labelledby="battle-search-title"
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#1a1a1e] border border-white/10 rounded-2xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 id="battle-search-title" className="text-white font-black text-lg flex items-center gap-2">
                  <span aria-hidden="true">⚔️</span> Lanzar battle 1v1
                </h3>
                <button onClick={() => setShowBattleSearch(false)} aria-label="Cerrar" className="text-gray-400 hover:text-white">
                  <FiX size={18} />
                </button>
              </div>
              <p className="text-gray-400 text-xs mb-3">Busca a otro creador en vivo. Battle de 5 minutos · gana quien reciba más coins.</p>
              <input
                autoFocus
                className="w-full bg-[#111115] border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-pink-500/50"
                placeholder="Buscar por nombre o @username"
                value={battleSearch}
                onChange={e => searchBattleOpponents(e.target.value)}
              />
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mt-3 mb-1">
                {battleSearch ? 'Resultados' : 'En vivo ahora'}
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {battleResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => inviteBattleOpponent(p.id)}
                    disabled={battleInviting === p.id}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors disabled:opacity-50"
                  >
                    <div className="relative shrink-0">
                      <img loading="lazy"
                        src={p.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.full_name || 'U')}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-[#1a1a1e] animate-pulse" title="En vivo" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-white text-sm font-semibold truncate">{p.full_name}</p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {p.live_show_title ? `🔴 ${p.live_show_title}` : 'En vivo'}
                      </p>
                    </div>
                    <span className="text-[10px] text-pink-300 font-bold shrink-0">
                      {battleInviting === p.id ? '…' : 'Invitar'}
                    </span>
                  </button>
                ))}
                {battleResults.length === 0 && (
                  <p className="text-center text-gray-500 text-xs py-6">
                    {battleSearch
                      ? 'Sin resultados con ese nombre'
                      : 'Nadie más está en vivo ahora — intenta buscar por @username'}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de invitación entrante a battle (cuando otro host me invita) */}
      {isLive && <BattleInviteModal onAccepted={handleBattleAccepted} showId={showId} />}

      {/* Onboarding tutorial — solo la primera vez que el creator entra */}
      <StudioOnboarding />
    </div>
  );
}
