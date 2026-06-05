import { useState, useEffect } from 'react';
import { FiFilter, FiDownload, FiChevronDown } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Tab Audit Log — lista append-only de acciones administrativas.
// Filtros por action y admin. Cada fila se puede expandir para ver metadata.

const ACTION_FILTERS = [
  { key: '',                  label: 'Todas' },
  { key: 'user.*',            label: 'Usuarios' },
  { key: 'withdrawal.*',      label: 'Retiros' },
  { key: 'verification.*',    label: 'Verificaciones' },
  { key: 'report.*',          label: 'Reportes' },
  { key: 'show.*',            label: 'Shows' },
  { key: 'notification.*',    label: 'Notificaciones' },
  { key: 'export.*',          label: 'Exportes' },
];

const ACTION_COLORS = {
  'user.delete':         'text-red-400',
  'user.ban_from_report':'text-red-400',
  'withdrawal.rejected': 'text-red-400',
  'withdrawal.approved': 'text-green-400',
  'verification.approved': 'text-green-400',
  'verification.rejected': 'text-red-400',
  'user.set_verified':   'text-blue-400',
  'user.set_creator':    'text-purple-400',
};

export default function AdminAuditLog() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = async (action = filter) => {
    setLoading(true);
    try {
      const params = action ? `?action=${encodeURIComponent(action)}` : '';
      const { data } = await api.get(`/api/admin/audit-log${params}`);
      setLog(data.log || []);
    } catch {
      toast.error('Error cargando audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/api/admin/export/audit_log', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error exportando');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FiFilter size={16} /> Audit Log
        </h2>
        <button
          onClick={exportCsv}
          disabled={downloading}
          className="text-xs bg-dark-800 hover:bg-dark-700 text-gray-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
        >
          <FiDownload size={12} /> {downloading ? 'Exportando…' : 'Export CSV'}
        </button>
      </div>

      {/* Filtros de action */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
        {ACTION_FILTERS.map(f => (
          <button
            key={f.key || 'all'}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors shrink-0 ${
              filter === f.key
                ? 'bg-brand-500 text-white'
                : 'bg-dark-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-14 animate-pulse" />)}
        </div>
      ) : log.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 text-sm">
          Sin actividad para este filtro
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {log.map(entry => {
            const isExpanded = expanded === entry.id;
            const color = ACTION_COLORS[entry.action] || 'text-gray-300';
            const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0;
            return (
              <div key={entry.id} className="p-3">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => hasMeta && setExpanded(isExpanded ? null : entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className={`text-xs font-mono ${color}`}>{entry.action}</code>
                      {entry.target_type && (
                        <span className="text-[10px] text-gray-600">
                          → {entry.target_type}
                          {entry.target_id && `:${entry.target_id.slice(0, 8)}`}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {entry.admin_email} · {new Date(entry.created_at).toLocaleString('es', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {entry.ip && ` · ${entry.ip}`}
                    </p>
                  </div>
                  {hasMeta && (
                    <FiChevronDown
                      size={14}
                      className={`text-gray-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </div>
                {isExpanded && hasMeta && (
                  <pre className="mt-2 bg-dark-900 border border-white/5 rounded p-2 text-[10px] text-gray-400 overflow-x-auto">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
