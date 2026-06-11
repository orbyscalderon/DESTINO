import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiCpu, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import Toggle from '../components/ui/Toggle.jsx';

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
      toast.success('Persona guardada ✨');
    } catch { toast.error('Error'); } finally { setSaving(false); }
  };

  return (
    <PageShell
      icon={FiCpu}
      title="AI Persona"
      subtitle="Asistente IA que responde como vos cuando estás offline. Mantiene a tus fans engaged 24/7."
      backTo="/creator/monetization"
      maxWidth="xl"
    >
      {/* Disclosure obligatoria — diseño tipo callout amber */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.19, 1, 0.22, 1] }}
        className="card-form mb-5 border-amber-500/30 bg-amber-500/[0.04] flex gap-3"
      >
        <FiAlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
        <div>
          <p className="text-amber-100 font-bold text-sm mb-1">EU AI Act — disclosure obligatoria</p>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Debés incluir un mensaje que avise al fan que está hablando con un asistente IA.
            El texto es editable abajo, pero no se puede ocultar.
          </p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {/* Toggle principal */}
        <div className={`card-form transition-all duration-300 ${form.enabled ? 'border-brand-500/30 shadow-glow-sm' : ''}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-white">Activar AI Persona</p>
              <p className="text-xs text-gray-400 mt-1">El asistente responde tras X minutos sin que estés online.</p>
            </div>
            <Toggle on={form.enabled} onChange={() => setForm(s => ({ ...s, enabled: !s.enabled }))} ariaLabel="Activar persona" />
          </div>
        </div>

        <Field label="Nombre del persona" sublabel="Opcional — cómo se identifica al fan"
          value={form.persona_name}
          onChange={(v) => setForm(s => ({ ...s, persona_name: v }))}
          placeholder="ej. AnaBot" />

        <Field label="Tono"
          value={form.tone}
          onChange={(v) => setForm(s => ({ ...s, tone: v }))}
          placeholder="ej. juguetón, cariñoso, directo" />

        <TextArea label="Personalidad" sublabel="Cómo debe responder — sé específico"
          value={form.personality_prompt}
          onChange={(v) => setForm(s => ({ ...s, personality_prompt: v }))} rows={5}
          placeholder="Soy Ana, creator de Punta Cana. Respondo casual, uso 💕 mucho. Mi contenido es cariñoso…" />

        <Field label="Tópicos prohibidos" sublabel="Separados por coma"
          value={form.banned_topics}
          onChange={(v) => setForm(s => ({ ...s, banned_topics: v }))}
          placeholder="política, religión, drogas" />

        <div className="grid grid-cols-2 gap-3">
          <NumField label="Trigger (min)" sublabel="Sin responder antes de activar IA"
            value={form.trigger_after_min}
            onChange={(v) => setForm(s => ({ ...s, trigger_after_min: v }))} />
          <NumField label="Máx respuestas/día/fan"
            value={form.max_replies_per_day_per_fan}
            onChange={(v) => setForm(s => ({ ...s, max_replies_per_day_per_fan: v }))} />
        </div>

        <TextArea label="Disclosure obligatoria (EU AI Act)" sublabel="Se prepende a cada respuesta IA"
          value={form.disclosure_text}
          onChange={(v) => setForm(s => ({ ...s, disclosure_text: v }))} rows={2} />

        <button onClick={save} disabled={saving} className="btn-primary w-full mt-2">
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              Guardando…
            </>
          ) : 'Guardar persona'}
        </button>
      </div>
    </PageShell>
  );
}

function Field({ label, sublabel, value, onChange, placeholder }) {
  return (
    <div className="card-form">
      <label className="block">
        <span className="block text-xs font-bold text-white">{label}</span>
        {sublabel && <span className="block text-[10px] text-gray-500 mb-2">{sublabel}</span>}
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-sm mt-1" />
      </label>
    </div>
  );
}
function NumField({ label, sublabel, value, onChange }) {
  return (
    <div className="card-form">
      <label className="block">
        <span className="block text-xs font-bold text-white">{label}</span>
        {sublabel && <span className="block text-[10px] text-gray-500 mb-2">{sublabel}</span>}
        <input type="number" min="1" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="input-sm mt-1 tabular-nums" />
      </label>
    </div>
  );
}
function TextArea({ label, sublabel, value, onChange, rows, placeholder }) {
  return (
    <div className="card-form">
      <label className="block">
        <span className="block text-xs font-bold text-white">{label}</span>
        {sublabel && <span className="block text-[10px] text-gray-500 mb-2">{sublabel}</span>}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="textarea-sm mt-1" />
      </label>
    </div>
  );
}
