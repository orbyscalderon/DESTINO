import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCpu, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorAIPersona() {
  const [form, setForm] = useState({
    enabled: false, persona_name: '', tone: '', personality_prompt: '',
    banned_topics: '', trigger_after_min: 30, max_replies_per_day_per_fan: 10,
    disclosure_text: '🤖 Esta respuesta fue generada por mi asistente IA mientras estoy offline. Te responderé personalmente pronto.',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/creator-monetization/persona').then(r => {
      const p = r.data?.persona;
      if (p) setForm({
        enabled: p.enabled, persona_name: p.persona_name || '',
        tone: p.tone || '', personality_prompt: p.personality_prompt || '',
        banned_topics: (p.banned_topics || []).join(', '),
        trigger_after_min: p.trigger_after_min || 30,
        max_replies_per_day_per_fan: p.max_replies_per_day_per_fan || 10,
        disclosure_text: p.disclosure_text || '',
      });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/creator-monetization/persona', {
        ...form,
        banned_topics: form.banned_topics.split(',').map(t => t.trim()).filter(Boolean),
      });
      toast.success('Persona guardada');
    } catch { toast.error('Error'); } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiCpu /> AI Persona</h1>
        <p className="text-gray-500 text-sm mb-4">
          Asistente IA que responde como vos cuando estás offline. Mantiene a tus fans engaged 24/7.
        </p>

        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
          <FiAlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
          <p className="text-xs text-amber-200">
            <strong>EU AI Act:</strong> debes incluir disclosure al fan que está hablando con un AI. Editable abajo pero
            no se puede desactivar la disclosure misma.
          </p>
        </div>

        <div className="space-y-4">
          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="flex items-center justify-between mb-1">
              <span className="font-bold text-white">Activar AI Persona</span>
              <Toggle on={form.enabled} onChange={() => setForm(s => ({ ...s, enabled: !s.enabled }))} />
            </label>
          </div>

          <Field label="Nombre del persona (opcional)" value={form.persona_name}
            onChange={(v) => setForm(s => ({ ...s, persona_name: v }))} placeholder="ej. AnaBot" />

          <Field label="Tono" value={form.tone}
            onChange={(v) => setForm(s => ({ ...s, tone: v }))} placeholder="ej. juguetón, cariñoso, directo" />

          <TextArea label="Personality prompt (cómo debe responder)" value={form.personality_prompt}
            onChange={(v) => setForm(s => ({ ...s, personality_prompt: v }))} rows={5}
            placeholder="Soy Ana, creator de Punta Cana. Respondo casual, uso 💕 mucho. Mi contenido es cariñoso..." />

          <Field label="Tópicos prohibidos (coma separados)" value={form.banned_topics}
            onChange={(v) => setForm(s => ({ ...s, banned_topics: v }))} placeholder="política, religión, drogas" />

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Trigger después de (min sin responder)" value={form.trigger_after_min}
              onChange={(v) => setForm(s => ({ ...s, trigger_after_min: v }))} />
            <NumField label="Máx respuestas/día/fan" value={form.max_replies_per_day_per_fan}
              onChange={(v) => setForm(s => ({ ...s, max_replies_per_day_per_fan: v }))} />
          </div>

          <TextArea label="Disclosure obligatoria (EU AI Act)" value={form.disclosure_text}
            onChange={(v) => setForm(s => ({ ...s, disclosure_text: v }))} rows={2} />

          <button onClick={save} disabled={saving}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="glass-strong rounded-2xl p-5 border border-white/5">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
    </div>
  );
}
function NumField({ label, value, onChange }) {
  return (
    <div className="glass-strong rounded-2xl p-5 border border-white/5">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type="number" min="1" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
    </div>
  );
}
function TextArea({ label, value, onChange, rows, placeholder }) {
  return (
    <div className="glass-strong rounded-2xl p-5 border border-white/5">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm resize-y" />
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={onChange} role="switch" aria-checked={on}
      className={`relative w-12 h-7 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-white/10'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
