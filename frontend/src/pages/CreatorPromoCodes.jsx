import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiTag, FiPlus, FiCopy } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorPromoCodes() {
  const [promos, setPromos] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    code: '', type: 'subscription', discount_pct: '', discount_coins: '',
    max_uses: '', expires_at: '',
  });

  const load = () => api.get('/api/creator-monetization/promo-codes/mine').then(r => setPromos(r.data?.promos || []));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post('/api/creator-monetization/promo-codes', {
        ...form,
        discount_pct: form.discount_pct || null,
        discount_coins: form.discount_coins || null,
        max_uses: form.max_uses || null,
        expires_at: form.expires_at || null,
      });
      toast.success('Promo creado');
      setForm({ code: '', type: 'subscription', discount_pct: '', discount_coins: '', max_uses: '', expires_at: '' });
      setShow(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.error || 'Error'); }
  };

  const toggle = async (id, active) => {
    await api.patch(`/api/creator-monetization/promo-codes/${id}`, { active: !active });
    load();
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black gradient-text flex items-center gap-2"><FiTag /> Promo Codes</h1>
            <p className="text-gray-500 text-sm mt-1">Descuentos para tus subscripciones y collections</p>
          </div>
          <button onClick={() => setShow(s => !s)} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-bold flex items-center gap-2">
            <FiPlus size={14} /> Nuevo
          </button>
        </div>

        {show && (
          <div className="glass-strong rounded-2xl p-5 border border-white/5 mb-6 space-y-3">
            <input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="CÓDIGO (ej. BLACKFRIDAY50)"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-mono" />
            <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm">
              <option value="subscription">Subscripción</option>
              <option value="collection">Photo Collection</option>
              <option value="tip">Tip</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min="1" max="100" value={form.discount_pct}
                onChange={(e) => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                placeholder="% descuento"
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
              <input type="number" min="0" value={form.discount_coins}
                onChange={(e) => setForm(f => ({ ...f, discount_coins: e.target.value }))}
                placeholder="o coins fijos"
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            </div>
            <input type="number" min="1" value={form.max_uses}
              onChange={(e) => setForm(f => ({ ...f, max_uses: e.target.value }))}
              placeholder="Máx. usos (opcional)"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <input type="datetime-local" value={form.expires_at}
              onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <button onClick={create} className="w-full px-4 py-2 rounded-lg bg-brand-500 text-white font-bold text-sm">
              Crear código
            </button>
          </div>
        )}

        <div className="space-y-2">
          {promos.map(p => (
            <div key={p.id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-brand-400 font-bold font-mono">{p.code}</code>
                  <button onClick={() => { navigator.clipboard.writeText(p.code); toast.success('Copiado'); }}
                    className="text-gray-500 hover:text-white"><FiCopy size={12} /></button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {p.discount_pct ? `${p.discount_pct}% off` : `${p.discount_coins} coins off`} · {p.type} · {p.uses_count}/{p.max_uses || '∞'} usos
                </p>
              </div>
              <button onClick={() => toggle(p.id, p.active)}
                className={`px-3 py-1 rounded-full text-xs font-bold ${p.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-gray-500/10 text-gray-500 border border-gray-500/30'}`}>
                {p.active ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
          {promos.length === 0 && <p className="text-center py-12 text-gray-500">Sin códigos creados</p>}
        </div>
      </div>
    </div>
  );
}
