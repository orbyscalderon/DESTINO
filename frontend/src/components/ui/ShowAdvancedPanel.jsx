import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiClock, FiVideo, FiCopy, FiCheck, FiX, FiAlertCircle, FiPlay, FiPause } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Panel para creator en ShowStudio: configura slow mode + RTMP (OBS).
//
// Props:
//   showId

const SLOW_OPTIONS = [
  { value: 0,   label: 'Off' },
  { value: 5,   label: '5s' },
  { value: 15,  label: '15s' },
  { value: 30,  label: '30s' },
  { value: 60,  label: '1m' },
  { value: 120, label: '2m' },
];

export default function ShowAdvancedPanel({ showId }) {
  const [slowSec, setSlowSec] = useState(0);
  const [rtmp, setRtmp] = useState({ enabled: false, stream_key: null, ingress_url: null });
  const [showKey, setShowKey] = useState(false);
  const [copying, setCopying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showId) return;
    let cancel = false;
    Promise.allSettled([
      api.get(`/api/shows/${showId}`),
      api.get(`/api/shows/${showId}/rtmp`),
    ]).then(([showRes, rtmpRes]) => {
      if (cancel) return;
      if (showRes.status === 'fulfilled') {
        setSlowSec(showRes.value.data?.show?.chat_slow_mode_seconds ?? 0);
      }
      if (rtmpRes.status === 'fulfilled') {
        setRtmp(rtmpRes.value.data || { enabled: false });
      }
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [showId]);

  const updateSlow = async (seconds) => {
    setBusy(true);
    try {
      await api.patch(`/api/shows/${showId}/slow-mode`, { seconds });
      setSlowSec(seconds);
      toast.success(seconds === 0 ? 'Slow mode desactivado' : `Slow mode ${seconds}s`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setBusy(false); }
  };

  const toggleRtmp = async () => {
    setBusy(true);
    try {
      if (rtmp.enabled) {
        await api.post(`/api/shows/${showId}/rtmp/disable`);
        setRtmp({ enabled: false, stream_key: null, ingress_url: null });
        toast.success('RTMP desactivado');
      } else {
        const { data } = await api.post(`/api/shows/${showId}/rtmp/enable`);
        setRtmp({ enabled: true, stream_key: data.stream_key, ingress_url: data.ingress_url });
        toast.success('RTMP activado. Configura OBS con las credenciales.');
      }
    } catch (err) {
      if (err.response?.data?.code === 'RTMP_UNAVAILABLE') {
        toast.error('RTMP no configurado en este servidor. Pídele al admin que configure LiveKit Ingress.');
      } else {
        toast.error(err.response?.data?.error || 'Error');
      }
    } finally { setBusy(false); }
  };

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    setCopying(label);
    setTimeout(() => setCopying(null), 1500);
    toast.success('Copiado');
  };

  if (loading) return <div className="card p-4"><div className="skeleton h-24 rounded-lg" /></div>;

  return (
    <div className="space-y-3">
      {/* Slow mode */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <FiClock size={14} className="text-brand-400" />
          <h3 className="text-sm font-bold text-white">Slow mode del chat</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Limita cuánto tiempo deben esperar los viewers entre mensajes. Tú y los mods están exentos.
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          {SLOW_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => updateSlow(o.value)}
              disabled={busy}
              className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 ease-out-expo active:scale-95 ${
                slowSec === o.value
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow-sm'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* RTMP */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2">
            <FiVideo size={14} className={rtmp.enabled ? 'text-green-400' : 'text-purple-400'} />
            <h3 className="text-sm font-bold text-white">Stream con OBS (RTMP)</h3>
          </div>
          <button
            onClick={toggleRtmp}
            disabled={busy}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 ease-out-expo active:scale-95 ${
              rtmp.enabled
                ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] hover:shadow-[0_0_24px_rgba(168,85,247,0.6)]'
            }`}
          >
            {rtmp.enabled ? <><FiPause size={11} className="inline mr-1" />Detener</> : <><FiPlay size={11} className="inline mr-1" />Activar</>}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Usa OBS Studio en lugar del navegador para overlays, mejor calidad y multistream.
        </p>

        {rtmp.enabled && rtmp.stream_key && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2 mt-3 overflow-hidden"
          >
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 text-xs text-yellow-300 flex items-start gap-2">
              <FiAlertCircle size={12} className="shrink-0 mt-0.5" />
              <p>NO compartas el stream key. Si lo expones, regenera en "Detener" + "Activar".</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Server URL</p>
              <div className="flex gap-1.5">
                <code className="flex-1 bg-white/5 border border-white/10 px-2.5 py-2 text-xs font-mono text-gray-300 rounded-lg break-all">
                  {rtmp.ingress_url}
                </code>
                <button
                  onClick={() => copy(rtmp.ingress_url, 'url')}
                  className="px-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-lg text-brand-400 transition-colors"
                  title="Copiar"
                >
                  {copying === 'url' ? <FiCheck size={12} /> : <FiCopy size={12} />}
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Stream key</p>
              <div className="flex gap-1.5">
                <code className="flex-1 bg-white/5 border border-white/10 px-2.5 py-2 text-xs font-mono text-gray-300 rounded-lg break-all">
                  {showKey ? rtmp.stream_key : '••••••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowKey(s => !s)}
                  className="px-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-lg text-gray-400 hover:text-white transition-colors"
                  title={showKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showKey ? <FiX size={12} /> : <FiVideo size={12} />}
                </button>
                <button
                  onClick={() => copy(rtmp.stream_key, 'key')}
                  className="px-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-lg text-brand-400 transition-colors"
                  title="Copiar"
                >
                  {copying === 'key' ? <FiCheck size={12} /> : <FiCopy size={12} />}
                </button>
              </div>
            </div>

            <details className="text-xs text-gray-400 mt-2 cursor-pointer">
              <summary className="text-brand-400 hover:text-brand-300 font-semibold">¿Cómo configurar OBS?</summary>
              <ol className="list-decimal pl-5 mt-2 space-y-1 text-[11px] leading-relaxed">
                <li>Abre OBS Studio → Settings → Stream</li>
                <li>Service: <code className="bg-white/5 px-1 rounded">Custom...</code></li>
                <li>Server: pega la URL de arriba</li>
                <li>Stream Key: pega el key (botón del ojo para ver)</li>
                <li>Output → bitrate 4500-6000 kbps, keyframe interval 2s</li>
                <li>Apply + Start Streaming</li>
              </ol>
            </details>
          </motion.div>
        )}
      </div>
    </div>
  );
}
