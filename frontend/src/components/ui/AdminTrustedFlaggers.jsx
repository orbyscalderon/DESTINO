import { useEffect, useState } from 'react';
import { FiShield, FiPlus, FiCopy, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

export default function AdminTrustedFlaggers() {
  const [flaggers, setFlaggers] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({
    organization_name: '', contact_name: '', contact_email: '',
    country_code: '', designation_authority: '', notes: '',
  });
  const [createdKey, setCreatedKey] = useState(null);
  const [tab, setTab] = useState('flaggers');

  const load = async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        api.get('/api/trusted-flaggers/admin/flaggers'),
        api.get('/api/trusted-flaggers/admin/reports?status=pending'),
      ]);
      setFlaggers(f.data?.flaggers || []);
      setReports(r.data?.reports || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const r = await api.post('/api/trusted-flaggers/admin/flaggers', newForm);
      setCreatedKey(r.data.api_key);
      setNewForm({
        organization_name: '', contact_name: '', contact_email: '',
        country_code: '', designation_authority: '', notes: '',
      });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error');
    }
  };

  const toggle = async (id, active) => {
    await api.patch(`/api/trusted-flaggers/admin/flaggers/${id}`, { active: !active });
    load();
  };

  const processReport = async (id, action) => {
    await api.patch(`/api/trusted-flaggers/admin/reports/${id}`, { action });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FiShield className="text-brand-400" size={20} />
        <h2 className="text-xl font-black text-white">Trusted Flaggers (DSA Art. 22)</h2>
      </div>

      <div className="flex gap-2 border-b border-white/5 -mb-px">
        {[['flaggers', `Flaggers (${flaggers.length})`], ['reports', `Reports pendientes (${reports.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === k ? 'border-brand-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'flaggers' && (
        <>
          <button onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-300 hover:bg-brand-500/20 transition">
            <FiPlus size={14} /> Registrar nuevo flagger
          </button>

          {showCreate && (
            <div className="glass-strong rounded-xl p-4 border border-white/5 space-y-3">
              {createdKey ? (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm font-bold text-white mb-2">⚠️ API key generada — guárdala AHORA, no la volveremos a mostrar</p>
                  <div className="flex items-center gap-2 p-2 bg-dark-900 rounded">
                    <code className="text-xs text-brand-400 font-mono break-all flex-1">{createdKey}</code>
                    <button onClick={() => { navigator.clipboard.writeText(createdKey); toast.success('Copiada'); }}
                      className="p-1.5 rounded hover:bg-white/10"><FiCopy size={14} /></button>
                  </div>
                  <button onClick={() => { setCreatedKey(null); setShowCreate(false); }}
                    className="mt-3 text-xs text-gray-400 hover:text-white">Cerrar</button>
                </div>
              ) : (
                <>
                  {['organization_name', 'contact_name', 'contact_email', 'country_code', 'designation_authority', 'notes'].map(k => (
                    <input key={k} placeholder={k}
                      value={newForm[k]} onChange={(e) => setNewForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none" />
                  ))}
                  <button onClick={create}
                    className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold text-sm">
                    Crear y generar API key
                  </button>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-gray-500 text-sm">Cargando…</div>
          ) : (
            <div className="space-y-2">
              {flaggers.map(f => (
                <div key={f.id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-white">{f.organization_name}</p>
                    <p className="text-xs text-gray-500">{f.contact_email} · {f.country_code}</p>
                    {f.designation_authority && <p className="text-xs text-gray-600 mt-1">Designado por: {f.designation_authority}</p>}
                    <p className="text-xs text-gray-600 mt-1 font-mono">desde {new Date(f.designated_at).toLocaleDateString('es')}</p>
                  </div>
                  <button onClick={() => toggle(f.id, f.active)}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${f.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-500/10 text-gray-500 border border-gray-500/30'}`}>
                    {f.active ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              ))}
              {flaggers.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No hay trusted flaggers registrados</p>}
            </div>
          )}
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="glass-strong rounded-xl p-4 border border-white/5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-bold text-white">{r.flagger?.organization_name}</p>
                  <p className="text-xs text-gray-500">{r.content_type} · {new Date(r.submitted_at).toLocaleString('es')}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {r.priority || 'high'}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">{r.reason}</p>
              {r.content_url && <a href={r.content_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:underline block mb-3">Ver contenido</a>}
              <div className="flex gap-2">
                <button onClick={() => processReport(r.id, 'action')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20">
                  <FiCheck size={12} /> Actuar
                </button>
                <button onClick={() => processReport(r.id, 'dismiss')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 hover:bg-gray-500/20">
                  <FiX size={12} /> Descartar
                </button>
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No hay reportes pendientes</p>}
        </div>
      )}
    </div>
  );
}
