import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiShield, FiCheck, FiX, FiAlertTriangle, FiFilter,
  FiClock, FiUserX, FiRefreshCw,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import PageShell from '../components/layout/PageShell.jsx';
import { useAuthStore } from '../store/authStore.js';

// Admin Fuck Now Moderation Queue
// - GET /api/fucknow/admin/moderation-queue?outcome=...&limit=...
// - POST /api/fucknow/admin/force-unpublish con { user_id, reason }
//
// Gating: solo orbys85@gmail.com (matchea backend admin check)

export default function AdminFuckNowQueue() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.email === 'orbys85@gmail.com';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [filter, isAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/fucknow/admin/moderation-queue?outcome=${filter}&limit=200`);
      setLogs(data.logs || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando queue');
    } finally {
      setLoading(false);
    }
  };

  const forceUnpublish = async (userId, reason) => {
    if (!confirm(`¿Quitar publicación del user ${userId.slice(0, 8)}?`)) return;
    setBusy(userId);
    try {
      await api.post('/api/fucknow/admin/force-unpublish', { user_id: userId, reason });
      toast.success('Publisher quitado del directorio');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin) {
    return (
      <PageShell icon={FiShield} title="Acceso restringido" backTo="/admin">
        <div className="card p-8 text-center">
          <FiUserX className="text-red-400 mx-auto mb-3" size={36} />
          <p className="text-white font-bold mb-2">Solo super admin</p>
          <p className="text-gray-400 text-sm">Esta sección es solo para el admin principal.</p>
        </div>
      </PageShell>
    );
  }

  const counts = {
    all:       logs.length,
    accepted:  logs.filter(l => l.outcome === 'accepted').length,
    rejected:  logs.filter(l => l.outcome === 'rejected').length,
    borderline: logs.filter(l => l.is_borderline).length,
  };

  return (
    <PageShell
      icon={FiShield}
      title="Fuck Now · Moderation Queue"
      subtitle="Últimos intentos de publish + soft flags borderline"
      backTo="/admin"
      maxWidth="5xl"
      actions={
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 bg-dark-700 hover:bg-dark-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
        >
          <FiRefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      }
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <FiFilter size={13} className="text-gray-500" />
        {[
          { id: 'all',       label: 'Todos',      color: 'gray'    },
          { id: 'accepted',  label: 'Aceptados',  color: 'emerald' },
          { id: 'rejected',  label: 'Rechazados', color: 'red'     },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
              filter === f.id
                ? f.color === 'emerald' ? 'bg-emerald-500 text-white'
                  : f.color === 'red' ? 'bg-red-500 text-white'
                  : 'bg-brand-500 text-white'
                : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
        {counts.borderline > 0 && (
          <span className="ml-auto text-xs text-amber-400 font-bold flex items-center gap-1">
            <FiAlertTriangle size={12} /> {counts.borderline} borderline a revisar
          </span>
        )}
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-dark-800 rounded-xl animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FiShield size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin actividad en moderation log.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => <LogRow key={log.id} log={log} busy={busy} onForceUnpublish={forceUnpublish} />)}
        </div>
      )}
    </PageShell>
  );
}

function LogRow({ log, busy, onForceUnpublish }) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(log.created_at).toLocaleString('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const isRejected = log.outcome === 'rejected';
  const isPublisher = log.user?.fucknow_publisher
    && log.user.fucknow_expires_at
    && new Date(log.user.fucknow_expires_at).getTime() > Date.now();

  const badge = isRejected
    ? { color: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'Rejected', icon: FiX }
    : log.is_borderline
    ? { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Borderline', icon: FiAlertTriangle }
    : { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Accepted', icon: FiCheck };

  const BadgeIcon = badge.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-dark-800/60 ${badge.color.split(' ').slice(-1)[0]}`}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 flex items-start gap-3 text-left hover:bg-white/5 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2 shrink-0">
          {log.user?.avatar_url ? (
            <img src={log.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-xs text-gray-500">
              {(log.user?.full_name || '?')[0]}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-white font-bold text-sm">{log.user?.full_name || 'user'}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${badge.color} flex items-center gap-1 uppercase`}>
              <BadgeIcon size={9} /> {badge.label}
            </span>
            <span className="text-[9px] text-gray-500 uppercase font-bold">{log.field}</span>
            {log.rule_matched && (
              <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                {log.rule_matched}
              </span>
            )}
            {isPublisher && (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-gray-300 text-xs truncate">{log.raw_value}</p>
          <div className="flex items-center gap-2 mt-1">
            <FiClock size={9} className="text-gray-600" />
            <span className="text-[10px] text-gray-500">{created}</span>
            {log.soft_flags?.length > 0 && (
              <span className="text-[10px] text-amber-400 font-bold">
                Soft: {log.soft_flags.join(', ')}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 p-3 bg-dark-900/50 space-y-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Texto completo</p>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-dark-900 p-2 rounded-lg max-h-40 overflow-auto">
{log.raw_value}
            </pre>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${log.user_id}`}
              className="text-xs bg-dark-700 hover:bg-dark-600 text-white font-bold px-3 py-1.5 rounded-lg"
            >
              Ver perfil
            </Link>
            {isPublisher && (
              <button
                onClick={() => {
                  const reason = prompt('Razón para quitar (visible en email al user):', 'Contenido borderline detectado en revisión manual');
                  if (reason !== null) onForceUnpublish(log.user_id, reason);
                }}
                disabled={busy === log.user_id}
                className="text-xs bg-red-500 hover:bg-red-400 text-white font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
              >
                <FiUserX size={12} /> Force unpublish
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
