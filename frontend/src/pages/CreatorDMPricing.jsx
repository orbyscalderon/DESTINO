import { useEffect, useState } from 'react';
import { FiMessageSquare, FiDollarSign, FiTrendingUp, FiUsers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import Toggle from '../components/ui/Toggle.jsx';

export default function CreatorDMPricing() {
  const [form, setForm] = useState({
    paywall_enabled: false, paywall_price_coins: 0,
    sexting_enabled: false, sexting_price_coins: 0,
    exempt_active_subs: true, exempt_tier_min: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/creator-monetization/dm-pricing').then(r => {
      const p = r.data?.pricing;
      if (p) setForm({
        paywall_enabled: p.paywall_enabled,
        paywall_price_coins: p.paywall_price_coins || 0,
        sexting_enabled: p.sexting_enabled,
        sexting_price_coins: p.sexting_price_coins || 0,
        exempt_active_subs: p.exempt_active_subs !== false,
        exempt_tier_min: p.exempt_tier_min || '',
      });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/creator-monetization/dm-pricing', {
        ...form,
        exempt_tier_min: form.exempt_tier_min || null,
      });
      toast.success('DM pricing guardado');
    } catch {
      toast.error('Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <PageShell
      icon={FiMessageSquare}
      title="DM Pricing"
      subtitle="Cobrá a tus fans por enviarte DMs. Top creators de OnlyFans hacen el 60% de su revenue acá."
      backTo="/creator/monetization"
      maxWidth="xl"
    >
      {/* Stat ribbon arriba para anclar la sección */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
        className="card-form mb-5 flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
          <FiTrendingUp className="text-brand-400" size={22} />
        </div>
        <div>
          <p className="text-white font-bold leading-tight">Maximizá ingresos por chat</p>
          <p className="text-xs text-gray-400 mt-0.5">Combiná paywall + sexting + exenciones por tier</p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {/* Paywall */}
        <PricingCard
          icon={FiDollarSign}
          title="Paywall"
          desc="Fan paga X coins para enviarte UN mensaje (one-time por sesión)"
          on={form.paywall_enabled}
          onToggle={() => setForm(s => ({ ...s, paywall_enabled: !s.paywall_enabled }))}
        >
          {form.paywall_enabled && (
            <input
              type="number" min="0" value={form.paywall_price_coins}
              onChange={(e) => setForm(s => ({ ...s, paywall_price_coins: parseInt(e.target.value) || 0 }))}
              placeholder="Precio en coins"
              className="input-sm mt-3"
            />
          )}
        </PricingCard>

        {/* Sexting */}
        <PricingCard
          icon={FiMessageSquare}
          title="Sexting (pay-per-message)"
          desc="CADA mensaje del fan te cuesta X coins. Mientras conversan, fan paga por cada msg."
          on={form.sexting_enabled}
          onToggle={() => setForm(s => ({ ...s, sexting_enabled: !s.sexting_enabled }))}
        >
          {form.sexting_enabled && (
            <input
              type="number" min="0" value={form.sexting_price_coins}
              onChange={(e) => setForm(s => ({ ...s, sexting_price_coins: parseInt(e.target.value) || 0 }))}
              placeholder="Precio por mensaje"
              className="input-sm mt-3"
            />
          )}
        </PricingCard>

        {/* Exenciones */}
        <div className="card-form space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <FiUsers className="text-emerald-400" size={16} />
            </div>
            <p className="font-bold text-white">Exenciones</p>
          </div>

          <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.exempt_active_subs}
              onChange={(e) => setForm(s => ({ ...s, exempt_active_subs: e.target.checked }))}
              className="w-4 h-4 accent-brand-500"
            />
            <span>Subs activos no pagan</span>
          </label>

          {form.exempt_active_subs && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              <select
                value={form.exempt_tier_min}
                onChange={(e) => setForm(s => ({ ...s, exempt_tier_min: e.target.value }))}
                className="select-sm"
              >
                <option value="" className="bg-dark-800">Todos los subs exentos</option>
                <option value="1" className="bg-dark-800">Solo Tier 1+</option>
                <option value="2" className="bg-dark-800">Solo Tier 2+</option>
                <option value="3" className="bg-dark-800">Solo Tier 3</option>
              </select>
            </motion.div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="btn-primary w-full mt-2"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              Guardando…
            </>
          ) : 'Guardar configuración'}
        </button>
      </div>
    </PageShell>
  );
}

function PricingCard({ icon: Icon, title, desc, on, onToggle, children }) {
  return (
    <div className={`card-form transition-all duration-300 ${on ? 'border-brand-500/30 shadow-glow-sm' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-lg shrink-0 transition-colors duration-300 ${on ? 'bg-brand-500/15 border border-brand-500/30 text-brand-300' : 'bg-white/5 border border-white/10 text-gray-500'}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white">{title}</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{desc}</p>
          </div>
        </div>
        <Toggle on={on} onChange={onToggle} ariaLabel={`Activar ${title}`} />
      </div>
      {children}
    </div>
  );
}
