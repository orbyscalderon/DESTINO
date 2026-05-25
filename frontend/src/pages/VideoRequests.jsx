import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft, FiZap, FiSend, FiInbox, FiCheck, FiX,
  FiUploadCloud, FiPlay, FiClock, FiAlertCircle,
} from 'react-icons/fi';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  accepted:  { label: 'Aceptada',   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'   },
  completed: { label: 'Entregada',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  rejected:  { label: 'Rechazada',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
  cancelled: { label: 'Cancelada',  color: 'text-gray-500',   bg: 'bg-dark-700/50 border-white/5'       },
  expired:   { label: 'Expirada',   color: 'text-gray-500',   bg: 'bg-dark-700/50 border-white/5'       },
};

function timeLeft(expiresAt) {
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return 'Expirada';
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d restantes`;
  const hours = Math.floor(diff / 3600000);
  return `${hours}h restantes`;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function ReceivedCard({ req, onAction, onDeliver }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 500 * 1024 * 1024) {
      toast.error('El video no puede superar 500 MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('video', file);
      await api.put(`/api/video-requests/${req.id}/deliver`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Video entregado. Recibirás el 70% del pago.');
      onDeliver(req.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir el video');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="card p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src={req.requester?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requester?.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            alt=""
          />
          <div>
            <p className="text-white font-medium text-sm">{req.requester?.full_name}</p>
            <p className="text-gray-500 text-xs">{timeAgo(req.created_at)} · <span className="text-yellow-400 font-semibold"><FiZap className="inline" size={10} /> {req.price} coins</span></p>
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {req.message && (
        <p className="text-gray-300 text-sm bg-dark-700/60 rounded-xl px-3 py-2 leading-relaxed">
          "{req.message}"
        </p>
      )}

      {['pending', 'accepted'].includes(req.status) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <FiClock size={11} />
          <span>{timeLeft(req.expires_at)}</span>
        </div>
      )}

      {req.status === 'completed' && req.video_url && (
        <video src={req.video_url} controls className="w-full rounded-xl max-h-48 bg-dark-700" />
      )}

      {req.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={() => onAction(req.id, 'accept')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-colors"
          >
            <FiCheck size={14} /> Aceptar
          </button>
          <button onClick={() => onAction(req.id, 'reject')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
          >
            <FiX size={14} /> Rechazar
          </button>
        </div>
      )}

      {req.status === 'accepted' && (
        <>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-400 text-sm font-semibold hover:bg-brand-500/30 transition-colors disabled:opacity-50"
          >
            {uploading
              ? <><div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /> Subiendo…</>
              : <><FiUploadCloud size={15} /> Entregar video</>
            }
          </button>
        </>
      )}
    </motion.div>
  );
}

function SentCard({ req, onCancel }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="card p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src={req.creator?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.creator?.full_name || 'C')}&size=80&background=1a1a2e&color=f43f5e`}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            alt=""
          />
          <div>
            <p className="text-white font-medium text-sm">{req.creator?.full_name}</p>
            <p className="text-gray-500 text-xs">{timeAgo(req.created_at)} · <span className="text-yellow-400 font-semibold"><FiZap className="inline" size={10} /> {req.price} coins</span></p>
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {req.message && (
        <p className="text-gray-300 text-sm bg-dark-700/60 rounded-xl px-3 py-2 leading-relaxed">
          "{req.message}"
        </p>
      )}

      {req.status === 'completed' && req.video_url && (
        <div className="space-y-2">
          <p className="text-green-400 text-xs font-semibold flex items-center gap-1"><FiPlay size={10} /> Video recibido</p>
          <video src={req.video_url} controls className="w-full rounded-xl max-h-48 bg-dark-700" />
        </div>
      )}

      {req.status === 'accepted' && (
        <p className="text-blue-400 text-xs flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-xl">
          <FiAlertCircle size={12} /> El creador aceptó tu solicitud. Pronto recibirás el video.
        </p>
      )}

      {req.status === 'pending' && (
        <button onClick={() => onCancel(req.id)}
          className="w-full py-2 rounded-xl bg-dark-700 border border-white/5 text-gray-400 text-sm hover:bg-dark-600 hover:text-white transition-colors"
        >
          Cancelar solicitud
        </button>
      )}
    </motion.div>
  );
}

export default function VideoRequests() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [tab, setTab]         = useState('sent');
  const [sent, setSent]       = useState([]);
  const [received, setReceived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(null);

  const isCreator = !!profile?.is_creator;

  useEffect(() => {
    const loads = [
      api.get('/api/video-requests/sent').catch(() => ({ data: { requests: [] } })),
    ];
    if (isCreator) {
      loads.push(api.get('/api/video-requests/received').catch(() => ({ data: { requests: [] } })));
    }
    Promise.all(loads).then(([s, r]) => {
      setSent(s.data.requests || []);
      if (r) setReceived(r.data.requests || []);
    }).finally(() => setLoading(false));
  }, [isCreator]);

  const handleAction = async (id, action) => {
    setActing(id);
    try {
      await api.put(`/api/video-requests/${id}/${action}`);
      const label = action === 'accept' ? 'Solicitud aceptada' : 'Solicitud rechazada';
      toast.success(label);
      setReceived(r => r.map(req =>
        req.id === id
          ? { ...req, status: action === 'accept' ? 'accepted' : 'rejected' }
          : req
      ));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setActing(null);
    }
  };

  const handleDeliver = (id) => {
    setReceived(r => r.map(req => req.id === id ? { ...req, status: 'completed' } : req));
  };

  const handleCancel = async (id) => {
    try {
      await api.post(`/api/video-requests/${id}/cancel`);
      toast.success('Solicitud cancelada. Coins reembolsados.');
      setSent(s => s.map(req => req.id === id ? { ...req, status: 'cancelled' } : req));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    }
  };

  const sentList     = sent;
  const receivedList = received;

  const pendingReceived = receivedList.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-dark-900/90 backdrop-blur-md border-b border-white/5 px-4 pt-8 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white">Encargos de Video</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-800 p-1 rounded-xl">
          <button
            onClick={() => setTab('sent')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'sent' ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <FiSend size={13} /> Enviados
            {sentList.filter(r => r.status === 'completed' && r.video_url).length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
          </button>
          {isCreator && (
            <button
              onClick={() => setTab('received')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === 'received' ? 'bg-dark-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FiInbox size={13} /> Recibidos
              {pendingReceived > 0 && (
                <span className="min-w-[18px] h-4.5 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingReceived}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'sent' ? (
          sentList.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-5xl mb-4">🎬</p>
              <p className="font-medium text-white mb-1">Sin encargos enviados</p>
              <p className="text-sm">Visita el perfil de un creador y solicita un video personalizado</p>
            </div>
          ) : (
            sentList.map(req => (
              <SentCard key={req.id} req={req} onCancel={handleCancel} />
            ))
          )
        ) : (
          receivedList.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-5xl mb-4">📥</p>
              <p className="font-medium text-white mb-1">Sin encargos recibidos</p>
              <p className="text-sm">Cuando alguien te solicite un video aparecerá aquí</p>
            </div>
          ) : (
            receivedList.map(req => (
              <ReceivedCard key={req.id} req={req} onAction={handleAction} onDeliver={handleDeliver} />
            ))
          )
        )}
      </div>
    </div>
  );
}
