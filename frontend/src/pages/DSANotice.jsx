import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const CATEGORIES = [
  { value: 'csam',                  label: '🚨 Material de abuso infantil (CSAM)', urgent: true },
  { value: 'terrorism',             label: '🚨 Contenido terrorista', urgent: true },
  { value: 'minor_protection',      label: '🚨 Riesgo para menores', urgent: true },
  { value: 'hate_speech',           label: 'Discurso de odio' },
  { value: 'harassment',            label: 'Acoso o intimidación' },
  { value: 'non_consensual',        label: 'Contenido no consentido (NCII)' },
  { value: 'copyright',             label: 'Infracción de copyright (DMCA)' },
  { value: 'trademark',             label: 'Infracción de marca registrada' },
  { value: 'privacy_violation',     label: 'Violación de privacidad' },
  { value: 'consumer_protection',   label: 'Protección al consumidor' },
  { value: 'illegal_content',       label: 'Contenido ilegal (otro)' },
  { value: 'other',                 label: 'Otro motivo' },
];

const CONTENT_TYPES = [
  { value: 'photo',   label: 'Foto' },
  { value: 'video',   label: 'Video' },
  { value: 'reel',    label: 'Reel' },
  { value: 'post',    label: 'Publicación' },
  { value: 'show',    label: 'Show en vivo' },
  { value: 'profile', label: 'Perfil de usuario' },
  { value: 'message', label: 'Mensaje' },
  { value: 'other',   label: 'Otro' },
];

export default function DSANotice() {
  const [form, setForm] = useState({
    notifier_name: '', notifier_email: '', notifier_country: '',
    content_type: 'video', content_url: '',
    reason_category: '', reason_text: '', alleged_illegality_basis: '',
    good_faith_statement: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const f = (k) => (e) => setForm(s => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.good_faith_statement) {
      toast.error('Debes confirmar la declaración de buena fe');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post('/api/dsa-notice', form);
      setResult(r.data);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error enviando');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 flex items-center justify-center">
        <div className="max-w-md glass-strong rounded-2xl p-8 border border-emerald-500/30 text-center">
          <FiCheckCircle className="text-emerald-400 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-black text-white mb-3">Notificación recibida</h2>
          <p className="text-gray-300 mb-4">{result.message}</p>
          <p className="text-xs text-gray-500 font-mono mb-6">
            Referencia: <span className="text-brand-400">{result.reference_id}</span>
          </p>
          <Link to="/" className="inline-block px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-2xl mx-auto relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <FiAlertTriangle className="text-amber-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Notice and Action</h1>
        </div>
        <p className="text-gray-500 text-sm mb-2">
          DSA Art. 16 — Mecanismo para reportar contenido presuntamente ilegal
        </p>
        <p className="text-xs text-gray-600 mb-8">
          Para denuncias de copyright (DMCA), usa <Link to="/dmca" className="text-brand-400 hover:underline">/dmca</Link>.
          Para reportes de usuarios desde la app, usa el menú de reporte de cada contenido.
        </p>

        <form onSubmit={submit} className="space-y-5">

          <section className="glass-strong rounded-2xl p-6 border border-white/5 space-y-4">
            <h2 className="text-lg font-bold text-white">Tu información</h2>
            <Field label="Nombre completo *" value={form.notifier_name} onChange={f('notifier_name')} required />
            <Field label="Email *" type="email" value={form.notifier_email} onChange={f('notifier_email')} required />
            <Field label="País (ISO-2, p.ej. MX, ES)" value={form.notifier_country} onChange={f('notifier_country')} maxLength={2} />
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5 space-y-4">
            <h2 className="text-lg font-bold text-white">Contenido reportado</h2>
            <Select label="Tipo de contenido *" value={form.content_type} onChange={f('content_type')} options={CONTENT_TYPES} required />
            <Field label="URL del contenido (si aplica)" value={form.content_url} onChange={f('content_url')} placeholder="https://destino.app/..." />
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5 space-y-4">
            <h2 className="text-lg font-bold text-white">Motivo</h2>
            <Select label="Categoría *" value={form.reason_category} onChange={f('reason_category')} options={[{ value: '', label: 'Selecciona…' }, ...CATEGORIES]} required />
            <TextArea label="Explica por qué es ilegal o infringe los términos (mín. 20 caracteres) *" value={form.reason_text} onChange={f('reason_text')} minLength={20} rows={5} required />
            <TextArea label="Base legal alegada (artículo de ley, jurisdicción, opcional)" value={form.alleged_illegality_basis} onChange={f('alleged_illegality_basis')} rows={3} />
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.good_faith_statement}
                onChange={(e) => setForm(s => ({ ...s, good_faith_statement: e.target.checked }))}
                className="mt-1 w-5 h-5 accent-brand-500"
              />
              <span className="text-sm text-gray-300">
                <strong className="text-white">Declaración de buena fe (DSA Art. 16(2)(d))</strong>: Declaro de buena fe que la
                información y alegaciones contenidas en esta notificación son completas y exactas, y que el contenido
                reportado constituye contenido ilegal o infringe los términos de servicio.
              </span>
            </label>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando…' : 'Enviar notificación'}
          </button>

          <p className="text-xs text-gray-600 text-center leading-relaxed">
            Tus datos serán procesados conforme a nuestra <Link to="/privacy" className="text-brand-400 hover:underline">Política de Privacidad</Link>.
            OC Moon Group LLC dará acuse de recibo inmediato y procesará la notificación en plazo de 7 días hábiles
            (24h para categorías marcadas como urgentes).
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <input
        {...props}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition"
      />
    </label>
  );
}
function TextArea({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <textarea
        {...props}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition resize-y"
      />
    </label>
  );
}
function Select({ label, value, onChange, options, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      <select
        value={value} onChange={onChange} {...rest}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition"
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-dark-900">{o.label}</option>)}
      </select>
    </label>
  );
}
