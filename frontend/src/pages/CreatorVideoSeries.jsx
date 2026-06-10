import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiEye, FiEyeOff, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';

export default function CreatorVideoSeries() {
  const { user } = useAuthStore();
  const [list, setList] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', cover_url: '', is_paid: false, price_coins: 100, is_adult: true });

  const load = async () => {
    if (!user) return;
    try {
      const r = await api.get(`/api/adult-video/series/by/${user.id}`);
      setList(r.data?.series || []);
    } catch {}
  };
  useEffect(() => { load(); }, [user?.id]);

  const create = async () => {
    if (!form.title.trim()) return toast.error('Título requerido');
    try {
      await api.post('/api/adult-video/series', form);
      toast.success('Serie creada');
      setForm({ title: '', description: '', cover_url: '', is_paid: false, price_coins: 100, is_adult: true });
      setShow(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const publish = async (id, current) => {
    await api.patch(`/api/adult-video/series/${id}`, { is_published: !current });
    load();
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black gradient-text">Series de Video</h1>
            <p className="text-gray-500 text-sm mt-1">Agrupa N videos como una serie vendible</p>
          </div>
          <button onClick={() => setShow(s => !s)} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-bold flex items-center gap-2">
            <FiPlus size={14} /> Nueva
          </button>
        </div>

        {show && (
          <div className="glass-strong rounded-2xl p-5 border border-white/5 mb-6 space-y-3">
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título de la serie"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción" rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm resize-y" />
            <input value={form.cover_url} onChange={(e) => setForm(f => ({ ...f, cover_url: e.target.value }))}
              placeholder="URL del cover"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.is_paid}
                onChange={(e) => setForm(f => ({ ...f, is_paid: e.target.checked }))} className="accent-brand-500" />
              Serie paga
            </label>
            {form.is_paid && (
              <input type="number" min="1" value={form.price_coins}
                onChange={(e) => setForm(f => ({ ...f, price_coins: parseInt(e.target.value) || 0 }))}
                placeholder="Precio coins"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.is_adult}
                onChange={(e) => setForm(f => ({ ...f, is_adult: e.target.checked }))} className="accent-brand-500" />
              Contenido adult
            </label>
            <button onClick={create} className="w-full px-4 py-2 rounded-lg bg-brand-500 text-white font-bold text-sm">
              Crear
            </button>
            <p className="text-xs text-gray-500">Después agregás videos con POST /series/:id/items</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {list.map(s => (
            <div key={s.id} className="glass-strong rounded-2xl border border-white/5 overflow-hidden">
              {s.cover_url && <div className="aspect-video bg-dark-800"><img src={s.cover_url} alt="" className="w-full h-full object-cover" /></div>}
              <div className="p-4">
                <p className="font-bold text-white">{s.title}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {s.videos_count} videos · {s.is_paid ? `${s.price_coins} coins` : 'gratis'} · {s.purchases_count} ventas
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => publish(s.id, s.is_published)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg ${s.is_published ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'} flex items-center justify-center gap-1`}>
                    {s.is_published ? <><FiEyeOff size={12} /> Despublicar</> : <><FiEye size={12} /> Publicar</>}
                  </button>
                  <Link to={`/series/${s.id}`} className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white">
                    Ver
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="text-center py-12 text-gray-500 col-span-2">Sin series aún</p>}
        </div>
      </div>
    </div>
  );
}
