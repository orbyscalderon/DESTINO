import { useEffect, useState } from 'react';
import { FiSend, FiInfo, FiUsers, FiImage, FiAlertTriangle, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';

const TARGETS = [
  { value: 'all_subs',    label: 'Todos los subs',        desc: 'Cualquiera con suscripción activa' },
  { value: 'tier_1_plus', label: 'Tier 1 y superior',     desc: 'Bronze, Silver, Gold' },
  { value: 'tier_2_plus', label: 'Tier 2 y superior',     desc: 'Silver, Gold' },
  { value: 'tier_3',      label: 'Solo Tier 3 (Gold)',    desc: 'Top fans únicamente' },
];

export default function CreatorMassDM() {
  const confirm = useConfirm();
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
      toast.error('Escribí un mensaje o adjuntá un PPV');
      return;
    }
    if (form.ppv_media_url && (!form.ppv_price || parseInt(form.ppv_price) < 1)) {
      toast.error('Si adjuntás PPV, definí un precio');
      return;
    }

    const ok = await confirm({
      title: `¿Enviar a ${audienceCount} ${audienceCount === 1 ? 'sub' : 'subs'}?`,
      message: 'Esta acción NO se puede deshacer. Cada destinatario recibirá el mensaje en su DM.',
      confirmLabel: `Enviar a ${audienceCount}`,
      destructive: false,
    });
    if (!ok) return;

    setSending(true);
    try {
      const r = await api.post('/api/creator-auto/mass-dm', {
        target_filter: form.target_filter,
        message_text: form.message_text || null,
        ppv_media_url: form.ppv_media_url || null,
        ppv_price: form.ppv_price ? parseInt(form.ppv_price) : null,
      });
      // Backend devuelve 202 con status:'queued' — el envío real corre async.
      // El historial se actualiza con sent_count cuando termine el fan-out.
      toast.success(`✓ Encolado: ${r.data.recipients_count} destinatarios. Verás el progreso en el historial.`);
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
    <PageShell
      icon={FiSend}
      title="Mass DM"
      subtitle="Mensaje a todos tus subs (o por tier). Útil para drops, promos, anuncios. Con PPV opcional."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="2xl"
    >
      {/* Rate limit info */}
      <div className="card p-4 mb-5 bg-amber-500/5 border-amber-500/20 flex gap-3">
        <FiAlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-gray-300 leading-relaxed">
          <p className="text-amber-300 font-bold mb-1">Límite: 5 broadcasts por hora</p>
          <p>Usalo con criterio — los subs notan el spam. Recomendamos máximo 1-2 broadcasts por semana.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Target picker — pills custom en vez de <select> nativo */}
        <div className="card p-4">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-2 flex items-center gap-1.5">
            <FiUsers size={11} /> Audiencia
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TARGETS.map(t => {
              const active = form.target_filter === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setForm(s => ({ ...s, target_filter: t.value }))}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-brand-500/15 border-brand-500/40 ring-1 ring-brand-500/40'
                      : 'bg-dark-800 border-white/5 hover:border-white/10'
                  }`}
                >
                  <p className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{t.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{t.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Destinatarios:</span>
            <span className="text-brand-400 font-black font-mono text-base">{audienceCount}</span>
            {audienceCount === 0 && (
              <span className="text-[10px] text-gray-600 italic">— sin subs en este target</span>
            )}
          </div>
        </div>

        {/* Mensaje */}
        <div className="card p-4">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1.5 flex items-center justify-between">
            <span>Mensaje</span>
            <span className={form.message_text.length > 1900 ? 'text-amber-400' : 'text-gray-600'}>
              {form.message_text.length}/2000
            </span>
          </label>
          <textarea
            value={form.message_text}
            onChange={(e) => setForm(s => ({ ...s, message_text: e.target.value.slice(0, 2000) }))}
            rows={5}
            placeholder="¡Hola fans! Tengo algo especial para ustedes esta semana…"
            className="input-field w-full text-sm resize-y"
          />
        </div>

        {/* PPV opcional */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FiImage size={14} className="text-accent-400" />
            <p className="text-white font-bold text-sm">PPV opcional</p>
          </div>
          <p className="text-xs text-gray-500">
            Adjuntá un media pago al broadcast. Cada sub paga la cantidad indicada para verlo.
          </p>

          <div>
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1 block">
              URL del media
            </label>
            <input
              type="url" value={form.ppv_media_url}
              onChange={(e) => setForm(s => ({ ...s, ppv_media_url: e.target.value }))}
              placeholder="https://… (URL desde tu vault)"
              className="input-field w-full text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1 block">
              Precio en coins
            </label>
            <input
              type="number" value={form.ppv_price} min="0" step="10"
              onChange={(e) => setForm(s => ({ ...s, ppv_price: e.target.value }))}
              placeholder="100"
              className="input-field text-sm w-32"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={send}
          disabled={sending || audienceCount === 0 || (!form.message_text && !form.ppv_media_url)}
          className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm py-3 rounded-xl shadow-glow-sm hover:shadow-glow flex items-center justify-center gap-2 transition-all"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              <FiSend size={14} /> Enviar a {audienceCount} {audienceCount === 1 ? 'sub' : 'subs'}
            </>
          )}
        </button>

        {/* Historial */}
        {history.length > 0 && (
          <div className="card p-4">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <FiClock size={14} className="text-gray-400" />
              Historial reciente
            </h3>
            <div className="space-y-1.5">
              {history.slice(0, 10).map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-xs">
                  <span className="text-gray-400">
                    {new Date(b.created_at).toLocaleString('es', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-brand-400 font-bold">{b.sent_count}/{b.recipients_count}</span>
                    <span className="text-[10px] bg-dark-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                      {b.target_filter}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
