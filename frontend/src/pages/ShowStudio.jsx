import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiVideo, FiMic, FiMicOff, FiVideoOff,
  FiCalendar, FiLock, FiPlay, FiSave, FiRefreshCw,
  FiAlertCircle, FiCheckCircle, FiMonitor,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import { SHOW_CATEGORIES } from './LiveShows.jsx';

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

function StatusPill({ status, label, icon: Icon }) {
  const map = {
    idle:        { cls: 'bg-dark-700 text-gray-500',           dot: 'bg-gray-600',                txt: 'Pendiente'     },
    checking:    { cls: 'bg-yellow-500/15 text-yellow-400',    dot: 'bg-yellow-400 animate-pulse', txt: 'Verificando…'  },
    granted:     { cls: 'bg-green-500/15 text-green-400',      dot: 'bg-green-400',                txt: 'Listo'         },
    denied:      { cls: 'bg-red-500/15 text-red-400',          dot: 'bg-red-400',                  txt: 'Sin permiso'   },
    unavailable: { cls: 'bg-gray-500/15 text-gray-400',        dot: 'bg-gray-500',                 txt: 'No encontrado' },
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
  const { user } = useAuthStore();

  const [profile, setProfile]         = useState(null);
  const [show, setShow]               = useState(DEFAULT_SHOW);
  const [saving, setSaving]           = useState(false);
  const [goingLive, setGoingLive]     = useState(false);

  // Camera preview state
  const [permCamera, setPermCamera]   = useState('idle');
  const [permMic, setPermMic]         = useState('idle');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [micDevices, setMicDevices]       = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId]       = useState('');
  const [videoQuality, setVideoQuality]         = useState('720p');
  const [previewActive, setPreviewActive]       = useState(false);
  const [vuLevel, setVuLevel]                   = useState(0);

  const previewStreamRef = useRef(null);
  const previewVideoRef  = useRef(null);
  const vuIntervalRef    = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);

  useEffect(() => {
    api.get(`/api/profiles/${user.id}`).then(r => setProfile(r.data.profile)).catch(() => {});
    return () => stopPreview();
  }, []);

  // Apply stream to video element when it mounts
  useEffect(() => {
    if (previewActive && permCamera === 'granted' && previewVideoRef.current && previewStreamRef.current) {
      previewVideoRef.current.srcObject = previewStreamRef.current;
    }
  }, [previewActive, permCamera]);

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

  const handleGoLive = async () => {
    if (!show.title.trim()) { toast.error('El título es obligatorio'); return; }
    setGoingLive(true);
    try {
      const { data: created } = await api.post('/api/shows', buildPayload());
      const showId = created.show?.id;
      if (!showId) throw new Error('Sin ID');
      await api.post(`/api/shows/${showId}/start`);
      stopPreview();
      navigate(`/shows/${showId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar el show');
      setGoingLive(false);
    }
  };

  const set = (key, val) => setShow(s => ({ ...s, [key]: val }));

  const canGoLive = permCamera === 'granted' && permMic === 'granted';

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Header */}
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

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 p-4 lg:p-6 max-w-6xl mx-auto w-full">

        {/* ── Columna izquierda: Configuración ── */}
        <div className="flex-1 space-y-5 order-2 lg:order-1">

          {/* Título */}
          <div className="card p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detalles del show</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Título *</label>
                <input className="input-field" placeholder="Ej: Sesión de baile 🔥"
                  value={show.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                  Descripción <span className="text-gray-600">(opcional)</span>
                </label>
                <textarea className="input-field resize-none text-sm" rows={3}
                  placeholder="Cuéntales a tus fans qué verán…"
                  value={show.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Tipo */}
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

          {/* Categoría */}
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

          {/* Precio y fecha */}
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
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Recibirás ${(parseFloat(show.ticket_price) * 0.7).toFixed(2)} por ticket (70%)
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                  <FiCalendar size={10} /> Programar (opcional)
                </label>
                <input className="input-field text-sm" type="datetime-local"
                  value={show.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                Meta de propinas <span className="text-gray-600">(opcional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🎯</span>
                <input className="input-field pl-8 text-sm" type="number" placeholder="Ej: 500 coins"
                  value={show.tip_goal} onChange={e => set('tip_goal', e.target.value)} min="0" />
              </div>
            </div>
          </div>

          {/* Tarifas privado */}
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

        {/* ── Columna derecha: Preview de cámara ── */}
        <div className="w-full lg:w-80 xl:w-96 space-y-4 order-1 lg:order-2">
          <div className="card p-4 lg:sticky lg:top-24">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vista previa</h2>

            {/* Video preview */}
            <div className="relative rounded-xl overflow-hidden bg-dark-800 aspect-video mb-3">
              {previewActive && permCamera === 'granted' ? (
                <video ref={previewVideoRef} autoPlay muted playsInline
                  className="w-full h-full object-cover" />
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

              {/* Live badge */}
              {previewActive && permCamera === 'granted' && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white text-[10px] font-semibold">PREVIEW</span>
                </div>
              )}
            </div>

            {/* VU meter */}
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

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <StatusPill status={permCamera} label="Cámara" icon={permCamera === 'denied' ? FiVideoOff : FiVideo} />
              <StatusPill status={permMic}    label="Micrófono" icon={permMic === 'denied' ? FiMicOff : FiMic} />
            </div>

            {/* Device selectors */}
            {previewActive && (cameraDevices.length > 0 || micDevices.length > 0) && (
              <div className="space-y-2 mb-3">
                {cameraDevices.length > 0 && (
                  <select
                    className="input-field text-xs py-1.5"
                    value={selectedCameraId}
                    onChange={e => switchCamera(e.target.value)}
                  >
                    {cameraDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${d.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                )}
                {micDevices.length > 0 && (
                  <select
                    className="input-field text-xs py-1.5"
                    value={selectedMicId}
                    onChange={e => switchMic(e.target.value)}
                  >
                    {micDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono ${d.deviceId.slice(0, 6)}`}</option>
                    ))}
                  </select>
                )}
                <select className="input-field text-xs py-1.5" value={videoQuality} onChange={e => setVideoQuality(e.target.value)}>
                  {QUALITY_OPTIONS.map(q => (
                    <option key={q.key} value={q.key}>{q.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Preview toggle */}
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

            {/* Divider */}
            <div className="border-t border-white/5 my-4" />

            {/* CTAs */}
            <div className="space-y-2">
              {/* Go live */}
              <button
                onClick={handleGoLive}
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

              {/* Save for later */}
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
