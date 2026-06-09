import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const TARGETS = [
  { value: 'all_subs',    label: 'Todos los subs' },
  { value: 'tier_1_plus', label: 'Tier 1 y superior' },
  { value: 'tier_2_plus', label: 'Tier 2 y superior' },
  { value: 'tier_3',      label: 'Solo Tier 3' },
];

export default function CreatorMassDM() {
  const [form, setForm] = useState({
    target_filter: 'all_subs',
    message_text: '',
    ppv_media_url: '',
    ppv_price: '',
  });
  const [audienceCount, setAudienceCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get('/api/creator-auto/mass-dm')
      .then(r => setHistory(r.data?.broadcasts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get(`/api/creator-auto/mass-dm/audience-count?target=${form.target_filter}`)
      .then(r => setAudienceCount(r.data?.count || 0))
      .catch(() => setAudienceCount(0));
  }, [form.target_filter]);

  const send = async () => {
    if (!form.message_text && !form.ppv_media_url) {
      toast.error('Escribe un mensaje o adjunta un PPV');
      return;
    }
    if (!confirm(`¿Enviar a ${audienceCount} suscriptor${audienceCount === 1 ? '' : 'es'}? Esta acción no se puede deshacer.`)) return;

    setSending(true);
    try {
      const r = await api.post('/api/creator-auto/mass-dm', {
        target_filter: form.target_filter,
        message_text: form.message_text || null,
        ppv_media_url: form.ppv_media_url || null,
        ppv_price: form.ppv_price ? parseInt(form.ppv_price) : null,
      });
      toast.success(`Enviado a ${r.data.sent_count}/${r.data.recipients_count}`);
      setForm(s => ({ ...s, message_text: '', ppv_media_url: '', ppv_price: '' }));
      const h = await api.get('/api/creator-auto/mass-dm');
      setHistory(h.data?.broadcasts || []);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error enviando');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-xl mx-auto relative z-10">
        <Link to="/creator/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiSend className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Mass DM</h1>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Envía un mensaje (con PPV opcional) a todos tus subs o por tier. Límite: 5 broadcasts por hora.
        </p>

        <div className="space-y-5">

          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="block">
              <span className="block text-sm font-bold text-white mb-2">Audiencia</span>
              <select
                value={form.target_filter}
                onChange={(e) => setForm(s => ({ ...s, target_filter: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition"
              >
                {TARGETS.map(t => <option key={t.value} value={t.value} className="bg-dark-900">{t.label}</option>)}
              </select>
            </label>
            <p className="text-xs text-gray-400 mt-2">
              <span className="text-brand-400 font-mono">{audienceCount}</span> destinatario{audienceCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="block">
              <span className="block text-sm font-bold text-white mb-2">Mensaje</span>
              <textarea
                value={form.message_text}
                onChange={(e) => setForm(s => ({ ...s, message_text: e.target.value }))}
                rows={5}
                maxLength={2000}
                placeholder="¡Hola fans! Tengo algo especial para ti esta semana…"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition resize-y"
              />
              <span className="text-xs text-gray-500 mt-1 block text-right">{form.message_text.length}/2000</span>
            </label>
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-white/5 space-y-4">
            <p className="text-sm font-bold text-white">PPV opcional</p>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1">URL del media</span>
              <input type="text" value={form.ppv_media_url}
                onChange={(e) => setForm(s => ({ ...s, ppv_media_url: e.target.value }))}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition" />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1">Precio en coins</span>
              <input type="number" value={form.ppv_price}
                onChange={(e) => setForm(s => ({ ...s, ppv_price: e.target.value }))}
                min="0" placeholder="100"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition" />
            </label>
          </div>

          <button onClick={send} disabled={sending || audienceCount === 0}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {sending ? 'Enviando…' : `Enviar a ${audienceCount}`}
          </button>

          {history.length > 0 && (
            <div className="glass-strong rounded-2xl p-5 border border-white/5">
              <p className="text-sm font-bold text-white mb-3">Historial reciente</p>
              <ul className="space-y-2">
                {history.slice(0, 10).map(b => (
                  <li key={b.id} className="text-xs flex justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-gray-400">{new Date(b.created_at).toLocaleString('es')}</span>
                    <span className="text-gray-300">{b.sent_count}/{b.recipients_count} · {b.target_filter}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
