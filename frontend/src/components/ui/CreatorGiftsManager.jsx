import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiTrash2, FiEdit2, FiZap, FiX, FiCheck, FiGift } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const DEFAULT_FORM = {
  label: '',
  emoji: '🎁',
  image_url: '',
  coins: 50,
  active: true,
};

export default function CreatorGiftsManager() {
  const [gifts, setGifts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState(DEFAULT_FORM);
  const [saving, setSaving]  = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/shows/my/gifts');
      setGifts(data.gifts || []);
    } catch {}
    setLoading(false);
  };

  const startNew = () => { setForm(DEFAULT_FORM); setEditing('new'); };
  const startEdit = (g) => {
    setForm({
      label: g.label,
      emoji: g.emoji || '',
      image_url: g.image_url || '',
      coins: g.coins,
      active: g.active,
    });
    setEditing(g.id);
  };

  const save = async () => {
    if (!form.label.trim()) return toast.error('Título obligatorio');
    if (!form.emoji && !form.image_url) return toast.error('Pon un emoji o una imagen');
    if (form.coins < 1) return toast.error('Precio mínimo 1 coin');
    setSaving(true);
    try {
      if (editing === 'new') {
        const { data } = await api.post('/api/shows/my/gifts', form);
        setGifts(g => [...g, data.gift]);
        toast.success('Regalo creado');
      } else {
        const { data } = await api.put(`/api/shows/my/gifts/${editing}`, form);
        setGifts(g => g.map(x => x.id === editing ? data.gift : x));
        toast.success('Regalo actualizado');
      }
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este regalo?')) return;
    try {
      await api.delete(`/api/shows/my/gifts/${id}`);
      setGifts(g => g.filter(x => x.id !== id));
      toast.success('Eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const toggleActive = async (g) => {
    try {
      const { data } = await api.put(`/api/shows/my/gifts/${g.id}`, { active: !g.active });
      setGifts(arr => arr.map(x => x.id === g.id ? data.gift : x));
    } catch {}
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-500/10 to-purple-500/5 border border-brand-500/20 p-4">
        <p className="text-xs text-gray-300 leading-relaxed">
          Crea tus propios regalos personalizados para que tus fans los envíen en tus shows.
          Cada regalo tiene un emoji o imagen, un nombre y un precio en coins.
          Recibes el <span className="text-yellow-400 font-bold">70%</span> de cada regalo.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Mis regalos</h3>
        <button onClick={startNew} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <FiPlus size={12} /> Nuevo regalo
        </button>
      </div>

      {gifts.length === 0 ? (
        <div className="rounded-2xl bg-dark-800 border border-dashed border-white/10 p-8 text-center">
          <FiGift className="text-gray-700 mx-auto mb-2" size={32} />
          <p className="text-gray-500 text-sm">Aún no tienes regalos</p>
          <p className="text-gray-600 text-xs mt-1">Crea regalos únicos para tus shows</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {gifts.map(g => (
            <div key={g.id} className={`rounded-2xl border p-3 ${g.active ? 'bg-dark-800 border-white/5' : 'bg-dark-800/40 border-white/5 opacity-60'}`}>
              <div className="flex items-center justify-center h-12 mb-2">
                {g.image_url
                  ? <img src={g.image_url} alt={g.label} className="h-12 object-contain" />
                  : <span className="text-3xl">{g.emoji}</span>}
              </div>
              <p className="text-white text-xs font-bold truncate text-center">{g.label}</p>
              <p className="text-yellow-400 text-xs text-center font-bold">⚡{g.coins.toLocaleString()}</p>
              {!g.active && <p className="text-[9px] text-gray-500 text-center mt-1">Pausado</p>}
              <div className="flex items-center justify-center gap-1 mt-2">
                <button onClick={() => toggleActive(g)} title={g.active ? 'Pausar' : 'Activar'} className="w-6 h-6 rounded-lg bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-gray-400">
                  {g.active ? <FiCheck size={11} /> : <FiX size={11} />}
                </button>
                <button onClick={() => startEdit(g)} className="w-6 h-6 rounded-lg bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-gray-400">
                  <FiEdit2 size={10} />
                </button>
                <button onClick={() => remove(g.id)} className="w-6 h-6 rounded-lg bg-dark-700 hover:bg-red-500/20 flex items-center justify-center text-gray-400 hover:text-red-400">
                  <FiTrash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          >
            <motion.div
              initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              className="w-full max-w-sm bg-dark-800 rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">{editing === 'new' ? 'Nuevo regalo' : 'Editar regalo'}</h3>
                <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white"><FiX size={18} /></button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Preview</label>
                  <div className="bg-dark-700 rounded-xl p-3 flex flex-col items-center gap-1">
                    {form.image_url
                      ? <img src={form.image_url} alt="" className="h-14 object-contain" />
                      : <span className="text-4xl">{form.emoji || '🎁'}</span>}
                    <p className="text-white text-xs font-bold truncate w-full text-center mt-1">{form.label || 'Sin nombre'}</p>
                    <p className="text-yellow-400 text-xs">⚡{Number(form.coins || 0).toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Nombre *</label>
                  <input
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Ej: Beso, Saludo, Baile..."
                    maxLength={50}
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Emoji (deja vacío si usarás imagen)</label>
                  <input
                    value={form.emoji}
                    onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                    placeholder="Ej: 🌸 💫 🍒"
                    maxLength={10}
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-xl text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">URL de imagen (opcional)</label>
                  <input
                    value={form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="https://... (PNG transparente recomendado)"
                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Precio (coins)</label>
                  <div className="relative">
                    <FiZap size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-400" />
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={form.coins}
                      onChange={e => setForm(f => ({ ...f, coins: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-dark-700 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">Recibes ⚡{Math.round((form.coins || 0) * 0.7).toLocaleString()} (70%)</p>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 accent-brand-500"
                  />
                  <span className="text-sm text-white">Disponible para envío</span>
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
