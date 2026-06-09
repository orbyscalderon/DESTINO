import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiGlobe, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const CONTENT_TYPES = ['post', 'reel', 'video', 'photo', 'collection', 'profile'];

export default function CreatorGeoBlock() {
  const [blocks, setBlocks] = useState([]);
  const [form, setForm] = useState({ content_type: 'post', content_id: '', country_codes: '', reason: '' });

  const load = () => api.get('/api/creator-monetization/content-geo/mine')
    .then(r => setBlocks(r.data?.blocks || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.content_id.trim() || !form.country_codes.trim()) return toast.error('Completa todos los campos');
    try {
      await api.put('/api/creator-monetization/content-geo', {
        ...form,
        country_codes: form.country_codes.split(',').map(c => c.trim().toUpperCase()).filter(Boolean),
      });
      toast.success('Geo-block aplicado');
      setForm({ content_type: 'post', content_id: '', country_codes: '', reason: '' });
      load();
    } catch { toast.error('Error'); }
  };

  const remove = async (b) => {
    await api.delete(`/api/creator-monetization/content-geo/${b.content_type}/${b.content_id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiGlobe /> Geo Block</h1>
        <p className="text-gray-500 text-sm mb-8">Bloquear contenidos específicos en países seleccionados (ISO-2: US, GB, FR…)</p>

        <div className="glass-strong rounded-2xl p-5 border border-white/5 mb-6 space-y-3">
          <select value={form.content_type} onChange={(e) => setForm(f => ({ ...f, content_type: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm">
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.content_id} onChange={(e) => setForm(f => ({ ...f, content_id: e.target.value }))}
            placeholder="UUID del contenido"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-mono" />
          <input value={form.country_codes} onChange={(e) => setForm(f => ({ ...f, country_codes: e.target.value }))}
            placeholder="Países a bloquear (ej: US,GB,FR)"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
          <input value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Razón (opcional)"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
          <button onClick={add} className="w-full px-4 py-2 rounded-lg bg-brand-500 text-white font-bold text-sm">
            Aplicar bloqueo
          </button>
        </div>

        <div className="space-y-2">
          {blocks.map(b => (
            <div key={b.id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  <span className="font-bold">{b.content_type}</span> · <span className="font-mono text-xs text-gray-500">{b.content_id.slice(0, 8)}…</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Bloqueado en: {b.country_codes.map(c => (
                    <span key={c} className="inline-block ml-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px] font-mono">{c}</span>
                  ))}
                </p>
                {b.reason && <p className="text-xs text-gray-600 mt-1 italic">{b.reason}</p>}
              </div>
              <button onClick={() => remove(b)} className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-white/5">
                <FiX size={14} />
              </button>
            </div>
          ))}
          {blocks.length === 0 && <p className="text-center py-12 text-gray-500 text-sm">Sin bloqueos activos</p>}
        </div>
      </div>
    </div>
  );
}
