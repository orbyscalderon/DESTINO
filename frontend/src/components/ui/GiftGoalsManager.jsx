import { useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiGift, FiSave } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

const STANDARD_GIFTS = [
  { type: 'rose',    emoji: '🌹', label: 'Rosa',    coins: 10 },
  { type: 'heart',   emoji: '💖', label: 'Corazón', coins: 50 },
  { type: 'diamond', emoji: '💎', label: 'Diamante', coins: 200 },
  { type: 'crown',   emoji: '👑', label: 'Corona',  coins: 500 },
];

// Manager de gift goals para el host. Le permite definir hasta 10 metas
// tipo "10 corazones → cambio outfit" y verlas en vivo desde el Studio.
// Cuando un viewer manda un gift que matchea, el backend incrementa
// current_count y broadcastea progreso a todo el show.
export default function GiftGoalsManager({ showId, isLive, initialGoals = [] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setGoals(initialGoals); }, [initialGoals]);

  const add = () => {
    if (goals.length >= 10) {
      toast.error('Máximo 10 goals');
      return;
    }
    setGoals(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        gift_type: 'heart',
        target_count: 10,
        current_count: 0,
        completed: false,
        reward_text: '',
      },
    ]);
  };

  const update = (id, patch) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  };

  const remove = (id) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const save = async () => {
    if (!showId) {
      toast.error('Guarda el show primero (Config)');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/shows/${showId}/gift-goals`, { goals });
      toast.success('Goals guardados');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-dark-800 rounded-2xl p-4 border border-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          <FiGift className="text-pink-400" size={14} />
          Goals de regalos
        </h3>
        <span className="text-[10px] text-gray-500">{goals.length}/10</span>
      </div>
      <p className="text-gray-400 text-[10px]">
        Define metas como "10 corazones → cambio outfit". Tus viewers verán el progreso en vivo.
      </p>

      {goals.length === 0 ? (
        <p className="text-gray-600 text-xs text-center py-3">
          Sin goals · agrega el primero abajo
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map(g => {
            const std = STANDARD_GIFTS.find(s => s.type === g.gift_type);
            const pct = Math.min(100, ((g.current_count || 0) / g.target_count) * 100);
            return (
              <div key={g.id} className="bg-dark-700 rounded-xl p-2.5 space-y-1.5 border border-white/5">
                <div className="flex items-center gap-2">
                  <select
                    value={g.gift_type}
                    onChange={e => update(g.id, { gift_type: e.target.value })}
                    className="bg-dark-800 border border-white/10 text-white text-xs rounded px-2 py-1 outline-none"
                  >
                    {STANDARD_GIFTS.map(s => (
                      <option key={s.type} value={s.type}>{s.emoji} {s.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={g.target_count}
                    onChange={e => update(g.id, { target_count: parseInt(e.target.value) || 1 })}
                    className="w-16 bg-dark-800 border border-white/10 text-white text-xs rounded px-2 py-1 outline-none text-center"
                  />
                  <button
                    onClick={() => remove(g.id)}
                    aria-label="Eliminar goal"
                    className="ml-auto text-red-400 hover:text-red-300 p-1"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Recompensa: cambio outfit, dance, etc."
                  value={g.reward_text}
                  onChange={e => update(g.id, { reward_text: e.target.value.substring(0, 200) })}
                  className="w-full bg-dark-800 border border-white/10 text-white text-xs rounded px-2 py-1.5 outline-none placeholder-gray-600"
                />
                {isLive && (
                  <div>
                    <div className="flex items-center justify-between text-[9px] text-gray-500 mb-0.5">
                      <span>{g.current_count || 0} / {g.target_count} {std?.emoji}</span>
                      <span>{g.completed ? '✅ Logrado' : `${pct.toFixed(0)}%`}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${g.completed ? 'bg-green-400' : 'bg-gradient-to-r from-pink-500 to-yellow-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={add}
          disabled={goals.length >= 10}
          className="flex-1 flex items-center justify-center gap-1.5 text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 rounded-xl py-2 text-xs font-bold disabled:opacity-40 transition-colors"
        >
          <FiPlus size={12} /> Agregar goal
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2 text-xs font-bold disabled:opacity-50 transition-colors"
        >
          <FiSave size={12} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
