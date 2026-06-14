import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFilm, FiPlus, FiEye, FiEyeOff, FiX, FiInfo, FiTrendingUp } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import PageShell from '../components/layout/PageShell.jsx';

export default function CreatorVideoSeries() {
  const { user } = useAuthStore();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', cover_url: '',
    is_paid: false, price_coins: 100, is_adult: true,
  });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await api.get(`/api/adult-video/series/by/${user.id}`);
      setList(r.data?.series || []);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const create = async () => {
    if (!form.title.trim()) return toast.error('Título requerido');
    if (form.is_paid && form.price_coins < 1) return toast.error('Precio inválido para serie paga');
    setCreating(true);
    try {
      await api.post('/api/adult-video/series', form);
      toast.success('Serie creada');
      setForm({ title: '', description: '', cover_url: '', is_paid: false, price_coins: 100, is_adult: true });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear');
    } finally { setCreating(false); }
  };

  const togglePublished = async (s) => {
    try {
      await api.patch(`/api/adult-video/series/${s.id}`, { is_published: !s.is_published });
      load();
    } catch { toast.error('Error'); }
  };

  const totalRevenue = list.reduce((sum, s) =>
    sum + (s.is_paid ? (s.purchases_count || 0) * (s.price_coins || 0) : 0), 0);

  return (
    <PageShell
      icon={FiFilm}
      title="Series de Video"
      subtitle="Agrupá N videos como una serie vendible. El comprador paga una vez y mira toda la serie."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="4xl"
      actions={
        !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm px-4 py-2 rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
          >
            <FiPlus size={14} /> Nueva serie
          </button>
        )
      }
    >
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat label="Series" value={list.length} />
          <Stat label="Publicadas" value={list.filter(s => s.is_published).length} accent="emerald" />
          <Stat label="Ingresos totales" value={`${totalRevenue.toLocaleString()} coins`} accent="brand" icon={FiTrendingUp} />
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6 space-y-4 border-brand-500/30">
          <div className="flex items-center justify-between">
            <p className="text-white font-bold">Nueva serie</p>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white p-1 -m-1">
              <FiX size={16} />
            </button>
          </div>

          <Field label="Título" required>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value.slice(0, 80) }))}
              placeholder="Ej: Capítulos privados — primera temporada"
              className="input-field w-full text-sm"
            />
            <p className="text-[10px] text-gray-600 mt-1 text-right">{form.title.length}/80</p>
          </Field>

          <Field label="Descripción">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value.slice(0, 500) }))}
              rows={3}
              placeholder="Qué van a ver tus fans en esta serie"
              className="input-field w-full text-sm resize-y"
            />
          </Field>

          <Field label="URL del cover" helper="URL del thumbnail que mostrás a los compradores antes de pagar.">
            <input
              value={form.cover_url}
              onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))}
              placeholder="https://… (URL del thumbnail)"
              className="input-field w-full text-sm font-mono"
            />
            {form.cover_url && (
              <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-dark-800 border border-white/10">
                <img src={form.cover_url} alt="Preview" className="w-full h-full object-cover"
                  onError={e => e.target.style.display = 'none'} />
              </div>
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_paid}
              onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))}
              className="accent-brand-500 w-4 h-4"
            />
            <span>Serie paga (PPV)</span>
          </label>

          {form.is_paid && (
            <Field label="Precio en coins">
              <input
                type="number" min="1" step="10"
                value={form.price_coins}
                onChange={e => setForm(f => ({ ...f, price_coins: Math.max(1, parseInt(e.target.value) || 0) }))}
                className="input-field text-sm w-32"
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_adult}
              onChange={e => setForm(f => ({ ...f, is_adult: e.target.checked }))}
              className="accent-brand-500 w-4 h-4"
            />
            <span>Contenido adulto (18+) — requiere age gate</span>
          </label>

          <button
            onClick={create}
            disabled={creating || !form.title.trim()}
            className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
          >
            {creating ? 'Creando…' : 'Crear serie'}
          </button>
          <p className="text-[10px] text-gray-500 flex items-start gap-1">
            <FiInfo size={11} className="shrink-0 mt-0.5" />
            Después de crear, agregás los videos individuales desde la vista de la serie.
          </p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[5/4] bg-dark-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-3 opacity-40">🎬</div>
          <p className="text-white font-bold mb-1">Sin series todavía</p>
          <p className="text-gray-500 text-sm mb-5">
            Convertí tus videos sueltos en una temporada vendible. Mejor storytelling, mejor revenue.
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm px-5 py-2 rounded-xl"
            >
              + Crear mi primera serie
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {list.map(s => (
            <div key={s.id} className="card overflow-hidden hover:border-brand-500/30 transition-colors">
              <div className="relative aspect-video bg-dark-800">
                {s.cover_url ? (
                  <img src={s.cover_url} alt={s.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>
                )}
                {s.is_adult && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">18+</span>
                )}
                {s.is_published && (
                  <span className="absolute top-2 left-2 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Publicada</span>
                )}
              </div>
              <div className="p-4">
                <p className="font-bold text-white truncate">{s.title}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
                  <span>{s.videos_count || 0} videos</span>
                  <span>·</span>
                  <span className="text-yellow-400 font-bold">
                    {s.is_paid ? `${s.price_coins} coins` : 'Gratis'}
                  </span>
                  <span>·</span>
                  <span className="text-brand-400 font-bold">{s.purchases_count || 0} ventas</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => togglePublished(s)}
                    className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                      s.is_published
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    {s.is_published ? <><FiEyeOff size={12} /> Despublicar</> : <><FiEye size={12} /> Publicar</>}
                  </button>
                  <Link
                    to={`/series/${s.id}`}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white font-bold"
                  >
                    Ver
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function Field({ label, helper, required, children }) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1.5 block">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {helper && <p className="text-[10px] text-gray-500 mt-1">{helper}</p>}
    </div>
  );
}

function Stat({ label, value, accent, icon: Icon }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    brand:   'text-brand-400 bg-brand-500/10 border-brand-500/20',
    default: 'text-white bg-dark-800 border-white/5',
  };
  return (
    <div className={`card p-3 ${colors[accent] || colors.default}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {Icon && <Icon size={11} />}
        <p className="text-[10px] uppercase font-bold tracking-wide opacity-70">{label}</p>
      </div>
      <p className="font-black text-base">{value}</p>
    </div>
  );
}
