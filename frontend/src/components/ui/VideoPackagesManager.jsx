import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiTrash2, FiEdit2, FiZap, FiClock, FiCalendar, FiX, FiCheck, FiVideo } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const DEFAULT_FORM = {
  title: '',
  description: '',
  price: 100,
  delivery_days: 7,
  max_duration_sec: 60,
  cover_url: '',
  active: true,
};

export default function VideoPackagesManager() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(DEFAULT_FORM);
  const [saving, setSaving]     = useState(false);
  const [settings, setSettings] = useState({ custom_video_min_price: 50, accepts_video_requests: true });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/video-requests/my-packages');
      setPackages(data.packages || []);
      const { data: dash } = await api.get('/api/creator/dashboard').catch(() => ({ data: {} }));
      if (dash?.profile) {
        setSettings({
          custom_video_min_price: dash.profile.custom_video_min_price ?? 50,
          accepts_video_requests: dash.profile.accepts_video_requests !== false,
        });
      }
    } catch {}
    setLoading(false);
  };

  const startNew = () => { setForm(DEFAULT_FORM); setEditing('new'); };
  const startEdit = (pkg) => {
    setForm({
      title: pkg.title,
      description: pkg.description || '',
      price: pkg.price,
      delivery_days: pkg.delivery_days,
      max_duration_sec: pkg.max_duration_sec,
      cover_url: pkg.cover_url || '',
      active: pkg.active,
    });
    setEditing(pkg.id);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('El título es obligatorio');
    if (form.price < 10) return toast.error('Precio mínimo: 10 coins');
    setSaving(true);
    try {
      if (editing === 'new') {
        const { data } = await api.post('/api/video-requests/packages', form);
        setPackages(p => [...p, data.package]);
        toast.success('Paquete creado');
      } else {
        const { data } = await api.put(`/api/video-requests/packages/${editing}`, form);
        setPackages(p => p.map(pk => pk.id === editing ? data.package : pk));
        toast.success('Paquete actualizado');
      }
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este paquete?')) return;
    try {
      await api.delete(`/api/video-requests/packages/${id}`);
      setPackages(p => p.filter(pk => pk.id !== id));
      toast.success('Eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const toggleActive = async (pkg) => {
    try {
      const { data } = await api.put(`/api/video-requests/packages/${pkg.id}`, { active: !pkg.active });
      setPackages(p => p.map(pk => pk.id === pkg.id ? data.package : pk));
    } catch {}
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/api/video-requests/settings', settings);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Configuración general */}
      <div className="rounded-2xl bg-dark-800 border border-white/5 p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <FiVideo size={14} className="text-brand-400" /> Configuración de encargos
        </h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-white">Aceptar encargos de video</p>
              <p className="text-xs text-gray-500">Los usuarios podrán solicitarte videos personalizados</p>
            </div>
            <input
              type="checkbox"
              checked={settings.accepts_video_requests}
              onChange={e => setSettings(s => ({ ...s, accepts_video_requests: e.target.checked }))}
              className="w-5 h-5 accent-brand-500"
            />
          </label>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Precio mínimo para video custom (coins)</label>
            <input
              type="number"
              min={10}
              value={settings.custom_video_min_price}
              onChange={e => setSettings(s => ({ ...s, custom_video_min_price: Math.max(10, parseInt(e.target.value) || 10) }))}
              className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
            />
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
            {savingSettings ? '...' : 'Guardar ajustes'}
          </button>
        </div>
      </div>

      {/* Catálogo de paquetes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Catálogo de paquetes</h3>
          <button onClick={startNew} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <FiPlus size={12} /> Nuevo paquete
          </button>
        </div>

        {packages.length === 0 ? (
          <div className="rounded-2xl bg-dark-800 border border-dashed border-white/10 p-8 text-center">
            <FiVideo className="text-gray-700 mx-auto mb-2" size={32} />
            <p className="text-gray-500 text-sm">Aún no tienes paquetes</p>
            <p className="text-gray-600 text-xs mt-1">Crea paquetes con precio fijo para que tus fans elijan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {packages.map(pkg => (
              <div key={pkg.id} className="rounded-2xl bg-dark-800 border border-white/5 p-3 flex items-center gap-3">
                {pkg.cover_url && <img src={pkg.cover_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-bold truncate">{pkg.title}</p>
                    {!pkg.active && <span className="text-[9px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">Pausado</span>}
                  </div>
                  {pkg.description && <p className="text-gray-500 text-xs truncate">{pkg.description}</p>}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600">
                    <span className="text-yellow-400 font-bold">⚡{pkg.price.toLocaleString()}</span>
                    <span><FiClock size={9} className="inline" /> {Math.round(pkg.max_duration_sec / 60 * 10) / 10}m</span>
                    <span><FiCalendar size={9} className="inline" /> {pkg.delivery_days}d</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(pkg)} title={pkg.active ? 'Pausar' : 'Activar'} className="w-7 h-7 rounded-lg bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-gray-400">
                    {pkg.active ? <FiCheck size={12} /> : <FiX size={12} />}
                  </button>
                  <button onClick={() => startEdit(pkg)} className="w-7 h-7 rounded-lg bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-gray-400">
                    <FiEdit2 size={11} />
                  </button>
                  <button onClick={() => remove(pkg.id)} className="w-7 h-7 rounded-lg bg-dark-700 hover:bg-red-500/20 flex items-center justify-center text-gray-400 hover:text-red-400">
                    <FiTrash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          >
            <motion.div
              initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              className="w-full max-w-md bg-dark-800 rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between sticky top-0 bg-dark-800 pb-2">
                <h3 className="text-white font-bold">{editing === 'new' ? 'Nuevo paquete' : 'Editar paquete'}</h3>
                <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white"><FiX size={18} /></button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Título *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ej: Felicitación de cumpleaños"
                    maxLength={100}
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Descripción</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Qué incluye este paquete..."
                    maxLength={500}
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm resize-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Precio</label>
                    <div className="relative">
                      <FiZap size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400" />
                      <input
                        type="number"
                        min={10}
                        max={99999}
                        value={form.price}
                        onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-dark-700 border border-white/10 rounded-xl pl-7 pr-2 py-2 text-white text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Días</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={form.delivery_days}
                      onChange={e => setForm(f => ({ ...f, delivery_days: parseInt(e.target.value) || 1 }))}
                      className="w-full bg-dark-700 border border-white/10 rounded-xl px-2 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Seg</label>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={form.max_duration_sec}
                      onChange={e => setForm(f => ({ ...f, max_duration_sec: parseInt(e.target.value) || 10 }))}
                      className="w-full bg-dark-700 border border-white/10 rounded-xl px-2 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">URL de portada (opcional)</label>
                  <input
                    type="url"
                    value={form.cover_url}
                    onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 accent-brand-500"
                  />
                  <span className="text-sm text-white">Activo (visible para los usuarios)</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl bg-dark-700 text-gray-400 text-sm font-semibold">
                  Cancelar
                </button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
