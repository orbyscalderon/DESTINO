import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTag, FiPlus, FiCopy } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { EmptyCoins } from '../components/ui/illustrations/index.js';

export default function CreatorPromoCodes() {
  const [promos, setPromos] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    code: '', type: 'subscription', discount_pct: '', discount_coins: '',
    max_uses: '', expires_at: '',
  });
  const [creating, setCreating] = useState(false);

  const load = () => api.get('/api/creator-monetization/promo-codes/mine')
    .then(r => setPromos(r.data?.promos || []));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.code.trim()) return toast.error('Código requerido');
    setCreating(true);
    try {
      await api.post('/api/creator-monetization/promo-codes', {
        ...form,
        discount_pct: form.discount_pct || null,
        discount_coins: form.discount_coins || null,
        max_uses: form.max_uses || null,
        expires_at: form.expires_at || null,
      });
      toast.success('Código creado ✨');
      setForm({ code: '', type: 'subscription', discount_pct: '', discount_coins: '', max_uses: '', expires_at: '' });
      setShow(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.error || 'Error'); }
    finally { setCreating(false); }
  };

  const toggle = async (id, active) => {
    await api.patch(`/api/creator-monetization/promo-codes/${id}`, { active: !active });
    load();
  };

  const newBtn = (
    <button onClick={() => setShow(s => !s)} className="btn-primary text-sm py-2 px-4">
      <FiPlus size={14} /> Nuevo código
    </button>
  );

  return (
    <PageShell
      icon={FiTag}
      title="Promo Codes"
      subtitle="Descuentos para tus suscripciones, collections y tips. Solo válidos hasta canje único por usuario."
      backTo="/creator/monetization"
      maxWidth="2xl"
      actions={newBtn}
    >
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
            className="overflow-hidden"
          >
            <div className="card-form space-y-3">
              <input
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="CÓDIGO (ej. BLACKFRIDAY50)"
                className="input-sm font-mono uppercase tracking-wider"
              />
              <select
                value={form.type}
                onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="select-sm"
              >
                <option value="subscription" className="bg-dark-800">Subscripción</option>
                <option value="collection"   className="bg-dark-800">Photo Collection</option>
                <option value="tip"          className="bg-dark-800">Tip</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="1" max="100"
                  value={form.discount_pct}
                  onChange={(e) => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                  placeholder="% descuento"
                  className="input-sm tabular-nums" />
                <input type="number" min="0"
                  value={form.discount_coins}
                  onChange={(e) => setForm(f => ({ ...f, discount_coins: e.target.value }))}
                  placeholder="o coins fijos"
                  className="input-sm tabular-nums" />
              </div>
              <input type="number" min="1"
                value={form.max_uses}
                onChange={(e) => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Máx. usos (opcional)"
                className="input-sm tabular-nums" />
              <input type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="input-sm" />
              <button onClick={create} disabled={creating} className="btn-primary w-full">
                {creating ? 'Creando…' : 'Crear código'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {promos.length === 0 ? (
        <EmptyState
          illustration={<EmptyCoins size={140} />}
          title="Sin códigos creados"
          desc="Creá tu primer promo para hacer ofertas — primer mes 50% off, drops, eventos…"
        />
      ) : (
        <motion.div
          layout
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-2"
        >
          <AnimatePresence>
            {promos.map(p => (
              <motion.div
                key={p.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
                }}
                className="card-interactive p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-brand-400 font-bold font-mono text-base tracking-wide">{p.code}</code>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(p.code); toast.success('Copiado'); }}
                      className="text-gray-500 hover:text-white p-1 -m-1 transition-colors"
                      aria-label="Copiar"
                    >
                      <FiCopy size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="text-gray-300 font-bold">{p.discount_pct ? `${p.discount_pct}% off` : `${p.discount_coins} coins off`}</span>
                    {' · '}{p.type}
                    {' · '}<span className="tabular-nums">{p.uses_count}/{p.max_uses || '∞'}</span> usos
                  </p>
                </div>
                <button
                  onClick={() => toggle(p.id, p.active)}
                  className={p.active ? 'pill-emerald hover:scale-105 transition-transform' : 'chip hover:scale-105 transition-transform'}
                >
                  {p.active ? 'Activo' : 'Inactivo'}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </PageShell>
  );
}
