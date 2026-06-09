import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiMessageSquare } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

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
      toast.error('Error');
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <FiMessageSquare className="text-brand-400" size={24} />
          <h1 className="text-3xl font-black gradient-text">DM Pricing</h1>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Cobrá a tus fans por enviarte DMs. Top creators OnlyFans hacen el 60% de revenue acá.
        </p>

        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-bold text-white">Paywall</p>
                <p className="text-xs text-gray-400 mt-1">Fan paga X coins para enviarte UN mensaje (one-time por sesión)</p>
              </div>
              <Toggle on={form.paywall_enabled} onChange={() => setForm(s => ({ ...s, paywall_enabled: !s.paywall_enabled }))} />
            </label>
            {form.paywall_enabled && (
              <input type="number" min="0" value={form.paywall_price_coins}
                onChange={(e) => setForm(s => ({ ...s, paywall_price_coins: parseInt(e.target.value) || 0 }))}
                placeholder="Precio en coins" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            )}
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-bold text-white">Sexting (pay-per-message)</p>
                <p className="text-xs text-gray-400 mt-1">CADA mensaje del fan te cuesta X coins. Mientras conversen, fan paga por cada msg.</p>
              </div>
              <Toggle on={form.sexting_enabled} onChange={() => setForm(s => ({ ...s, sexting_enabled: !s.sexting_enabled }))} />
            </label>
            {form.sexting_enabled && (
              <input type="number" min="0" value={form.sexting_price_coins}
                onChange={(e) => setForm(s => ({ ...s, sexting_price_coins: parseInt(e.target.value) || 0 }))}
                placeholder="Precio por mensaje" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            )}
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-white/5 space-y-3">
            <p className="font-bold text-white">Exenciones</p>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.exempt_active_subs}
                onChange={(e) => setForm(s => ({ ...s, exempt_active_subs: e.target.checked }))}
                className="accent-brand-500" />
              Subs activos no pagan
            </label>
            {form.exempt_active_subs && (
              <select value={form.exempt_tier_min}
                onChange={(e) => setForm(s => ({ ...s, exempt_tier_min: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm">
                <option value="">Todos los subs exentos</option>
                <option value="1">Solo Tier 1+</option>
                <option value="2">Solo Tier 2+</option>
                <option value="3">Solo Tier 3</option>
              </select>
            )}
          </div>

          <button onClick={save} disabled={saving}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={onChange} role="switch" aria-checked={on}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? 'bg-brand-500' : 'bg-white/10'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
