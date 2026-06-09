import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiPlus, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorAutoReply() {
  const [auto, setAuto] = useState({
    enabled: false, away_message: '',
    trigger_mode: 'offline',
    business_hours_start: '', business_hours_end: '',
  });
  const [quicks, setQuicks] = useState([]);
  const [newQuick, setNewQuick] = useState({ shortcut: '', message: '' });

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
    try {
      await api.put('/api/creator-monetization/auto-reply', auto);
      toast.success('Guardado');
    } catch { toast.error('Error'); }
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
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiClock /> Auto-Reply</h1>
        <p className="text-gray-500 text-sm mb-8">Respuestas automáticas cuando estás offline + shortcuts rápidos</p>

        <section className="glass-strong rounded-2xl p-5 border border-white/5 mb-6 space-y-4">
          <h2 className="font-bold text-white">Mensaje "estoy fuera"</h2>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={auto.enabled}
              onChange={(e) => setAuto(s => ({ ...s, enabled: e.target.checked }))} className="accent-brand-500" />
            Activado
          </label>
          <textarea value={auto.away_message}
            onChange={(e) => setAuto(s => ({ ...s, away_message: e.target.value }))} rows={4}
            placeholder="¡Hola! Estoy fuera ahora mismo. Te respondo mañana 💕"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm resize-y" />
          <select value={auto.trigger_mode} onChange={(e) => setAuto(s => ({ ...s, trigger_mode: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm">
            <option value="offline">Solo cuando estoy offline</option>
            <option value="always">Siempre activar al primer mensaje</option>
            <option value="after_hours">Fuera de horario laboral</option>
          </select>
          {auto.trigger_mode === 'after_hours' && (
            <div className="grid grid-cols-2 gap-3">
              <input type="time" value={auto.business_hours_start}
                onChange={(e) => setAuto(s => ({ ...s, business_hours_start: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
              <input type="time" value={auto.business_hours_end}
                onChange={(e) => setAuto(s => ({ ...s, business_hours_end: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            </div>
          )}
          <button onClick={saveAuto} className="w-full px-4 py-2 rounded-lg bg-brand-500 text-white font-bold text-sm">
            Guardar
          </button>
        </section>

        <section className="glass-strong rounded-2xl p-5 border border-white/5">
          <h2 className="font-bold text-white mb-3">Quick Replies (shortcuts)</h2>
          <p className="text-xs text-gray-500 mb-4">En el chat escribes /shortcut → se reemplaza por el mensaje completo</p>

          <div className="grid grid-cols-12 gap-2 mb-4">
            <input value={newQuick.shortcut}
              onChange={(e) => setNewQuick(q => ({ ...q, shortcut: e.target.value }))}
              placeholder="/saludo" className="col-span-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-mono" />
            <input value={newQuick.message}
              onChange={(e) => setNewQuick(q => ({ ...q, message: e.target.value }))}
              placeholder="Hola amor 💕 ¿cómo estás?" className="col-span-7 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <button onClick={addQuick} className="col-span-2 px-3 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center justify-center">
              <FiPlus size={14} />
            </button>
          </div>

          <div className="space-y-2">
            {quicks.map(q => (
              <div key={q.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                <code className="text-brand-400 font-mono text-xs">{q.shortcut}</code>
                <span className="text-gray-400 text-xs">→</span>
                <span className="text-gray-300 text-sm flex-1 truncate">{q.message}</span>
                <button onClick={() => delQuick(q.id)} className="text-gray-500 hover:text-rose-400 p-1">
                  <FiTrash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
