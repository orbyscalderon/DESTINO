import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiPlus, FiTrash2, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import Toggle from '../components/ui/Toggle.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function CreatorAutoReply() {
  const [auto, setAuto] = useState({
    enabled: false, away_message: '', trigger_mode: 'offline',
    business_hours_start: '', business_hours_end: '',
  });
  const [quicks, setQuicks] = useState([]);
  const [newQuick, setNewQuick] = useState({ shortcut: '', message: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/creator-monetization/auto-reply').then(r => {
      if (r.data?.autoReply) setAuto({
        enabled: r.data.autoReply.enabled,
        away_message: r.data.autoReply.away_message || '',
        trigger_mode: r.data.autoReply.trigger_mode || 'offline',
        business_hours_start: r.data.autoReply.business_hours_start || '',
        business_hours_end: r.data.autoReply.business_hours_end || '',
      });
    }).catch(() => {});
    api.get('/api/creator-monetization/quick-replies').then(r => setQuicks(r.data?.replies || [])).catch(() => {});
  }, []);

  const saveAuto = async () => {
    setSaving(true);
    try {
      await api.put('/api/creator-monetization/auto-reply', auto);
      toast.success('Guardado');
    } catch { toast.error('Error'); }
    finally { setSaving(false); }
  };

  const addQuick = async () => {
    if (!newQuick.shortcut.trim() || !newQuick.message.trim()) return;
    try {
      const r = await api.post('/api/creator-monetization/quick-replies', newQuick);
      setQuicks(q => [...q, r.data.reply]);
      setNewQuick({ shortcut: '', message: '' });
    } catch { toast.error('Error'); }
  };

  const delQuick = async (id) => {
    await api.delete(`/api/creator-monetization/quick-replies/${id}`);
    setQuicks(q => q.filter(x => x.id !== id));
  };

  return (
    <PageShell
      icon={FiClock}
      title="Auto-Reply"
      subtitle="Mensaje automático cuando estás offline + shortcuts para responder más rápido."
      backTo="/creator/monetization"
      maxWidth="xl"
    >
      {/* Mensaje automático */}
      <section className={`card-form mb-5 space-y-4 transition-all duration-300 ${auto.enabled ? 'border-brand-500/30 shadow-glow-sm' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-white">Mensaje "estoy fuera"</h2>
            <p className="text-xs text-gray-400 mt-1">Se manda al primer DM del fan, una vez por hilo cada 12h.</p>
          </div>
          <Toggle on={auto.enabled} onChange={() => setAuto(s => ({ ...s, enabled: !s.enabled }))} />
        </div>

        <textarea
          value={auto.away_message}
          onChange={(e) => setAuto(s => ({ ...s, away_message: e.target.value }))}
          rows={4}
          placeholder="¡Hola! Estoy fuera ahora mismo. Te respondo mañana 💕"
          className="textarea-sm"
        />

        <select
          value={auto.trigger_mode}
          onChange={(e) => setAuto(s => ({ ...s, trigger_mode: e.target.value }))}
          className="select-sm"
        >
          <option value="offline"     className="bg-dark-800">Solo cuando estoy offline</option>
          <option value="always"      className="bg-dark-800">Siempre — al primer mensaje del fan</option>
          <option value="after_hours" className="bg-dark-800">Fuera de horario laboral</option>
        </select>

        <AnimatePresence>
          {auto.trigger_mode === 'after_hours' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 gap-3 overflow-hidden"
            >
              <input type="time" value={auto.business_hours_start}
                onChange={(e) => setAuto(s => ({ ...s, business_hours_start: e.target.value }))}
                className="input-sm" />
              <input type="time" value={auto.business_hours_end}
                onChange={(e) => setAuto(s => ({ ...s, business_hours_end: e.target.value }))}
                className="input-sm" />
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={saveAuto} disabled={saving} className="btn-primary w-full">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </section>

      {/* Quick Replies */}
      <section className="card-form">
        <div className="flex items-center gap-2 mb-3">
          <FiZap className="text-brand-400" size={16} />
          <h2 className="font-bold text-white">Quick Replies</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          En el chat escribís <code className="text-brand-400 text-[11px] px-1.5 py-0.5 rounded bg-dark-700/80">/shortcut</code> y se reemplaza por el mensaje completo.
        </p>

        <div className="grid grid-cols-12 gap-2 mb-4">
          <input
            value={newQuick.shortcut}
            onChange={(e) => setNewQuick(q => ({ ...q, shortcut: e.target.value }))}
            placeholder="/saludo"
            className="input-sm col-span-3 font-mono"
          />
          <input
            value={newQuick.message}
            onChange={(e) => setNewQuick(q => ({ ...q, message: e.target.value }))}
            placeholder="Hola amor 💕 ¿cómo estás?"
            className="input-sm col-span-7"
          />
          <button
            onClick={addQuick}
            className="col-span-2 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm flex items-center justify-center transition-colors duration-200 ease-out-expo"
          >
            <FiPlus size={14} />
          </button>
        </div>

        {quicks.length === 0 ? (
          <EmptyState
            emoji="⚡"
            title="Sin shortcuts aún"
            desc="Creá uno arriba para acelerar tus respuestas más comunes."
          />
        ) : (
          <motion.div layout className="space-y-1.5">
            <AnimatePresence>
              {quicks.map(q => (
                <motion.div
                  key={q.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors group"
                >
                  <code className="text-brand-400 font-mono text-xs shrink-0">{q.shortcut}</code>
                  <span className="text-gray-500 text-xs">→</span>
                  <span className="text-gray-300 text-sm flex-1 truncate">{q.message}</span>
                  <button
                    onClick={() => delQuick(q.id)}
                    className="text-gray-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Eliminar"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>
    </PageShell>
  );
}
