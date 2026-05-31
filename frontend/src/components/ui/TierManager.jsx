import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPlus, FiTrash2, FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import api from '../../lib/api';

const TIER_PRESETS = {
  1: { name: 'Fan',     emoji: '🥉', color: '#CD7F32', defaultPrice: 4.99 },
  2: { name: 'VIP',     emoji: '🥈', color: '#C0C0C0', defaultPrice: 9.99 },
  3: { name: 'Top Fan', emoji: '🥇', color: '#FFD700', defaultPrice: 19.99 },
};

const PERK_LABELS = {
  discount_pct_ppv:      { label: 'Descuento en PPV', type: 'pct', max: 100 },
  free_messages_per_day: { label: 'Mensajes gratis al día', type: 'int', max: 10 },
  exclusive_content:     { label: 'Acceso a posts exclusivos del tier', type: 'bool' },
  exclusive_shows:       { label: 'Entrada gratis a shows pagados', type: 'bool' },
  priority_dm:           { label: 'Mensajes destacados con badge', type: 'bool' },
  custom_emoji:          { label: 'Emoji especial en chats de show', type: 'bool' },
};

export default function TierManager() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // tier object o { tier_level: N, isNew: true }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/creator/tiers');
      setTiers(data.tiers || []);
    } catch {
      toast.error('Error cargando tiers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = (level) => {
    const preset = TIER_PRESETS[level];
    setEditing({
      isNew: true,
      tier_level: level,
      name: preset.name,
      price: preset.defaultPrice,
      badge_emoji: preset.emoji,
      badge_color: preset.color,
      description: '',
      perks: {
        discount_pct_ppv: 0,
        free_messages_per_day: 0,
        exclusive_content: level >= 1,
        exclusive_shows: level >= 2,
        priority_dm: level >= 2,
        custom_emoji: level >= 3,
      },
      is_active: true,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    const body = {
      tier_level: editing.tier_level,
      name: editing.name?.trim(),
      price: parseFloat(editing.price),
      badge_emoji: editing.badge_emoji,
      badge_color: editing.badge_color,
      description: editing.description,
      perks: editing.perks,
      is_active: editing.is_active,
    };
    try {
      if (editing.isNew) {
        await api.post('/api/creator/tiers', body);
        toast.success('Tier creado');
      } else {
        await api.patch(`/api/creator/tiers/${editing.id}`, body);
        toast.success('Tier actualizado');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este tier? Los suscriptores activos seguirán teniendo acceso hasta que termine su periodo.')) return;
    try {
      await api.delete(`/api/creator/tiers/${id}`);
      toast.success('Tier eliminado');
      load();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading) return <div className="text-gray-500 text-center py-6">Cargando tiers...</div>;

  const existingLevels = new Set(tiers.filter(t => t.is_active).map(t => t.tier_level));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-semibold mb-1">Niveles de suscripción</h3>
        <p className="text-gray-500 text-xs">
          Define hasta 3 tiers con precios y beneficios. Los fans eligen al suscribirse.
          Si no defines tiers, se usa tu precio único de suscripción.
        </p>
      </div>

      {/* Lista de tiers existentes */}
      <div className="space-y-3">
        {tiers.filter(t => t.is_active).sort((a, b) => a.tier_level - b.tier_level).map(tier => (
          <div
            key={tier.id}
            className="rounded-xl p-4 border"
            style={{
              borderColor: `${tier.badge_color}55`,
              backgroundColor: `${tier.badge_color}10`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{tier.badge_emoji}</span>
                  <span className="font-bold text-white">{tier.name}</span>
                  <span className="text-xs text-gray-400">Nivel {tier.tier_level}</span>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color: tier.badge_color }}>
                  ${parseFloat(tier.price).toFixed(2)}<span className="text-xs text-gray-500">/mes</span>
                </p>
                {tier.description && (
                  <p className="text-sm text-gray-400 mt-1">{tier.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(tier.perks || {})
                    .filter(([, v]) => (typeof v === 'boolean' ? v : v > 0))
                    .map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-dark-700 px-2 py-0.5 rounded-full text-gray-300">
                        {PERK_LABELS[k]?.label || k}
                        {typeof v === 'number' && v > 0 && PERK_LABELS[k]?.type === 'pct' ? ` ${v}%` : ''}
                        {typeof v === 'number' && v > 0 && PERK_LABELS[k]?.type === 'int' ? `: ${v}` : ''}
                      </span>
                    ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setEditing(tier)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600">
                  <FiEdit2 className="text-gray-300" size={14} />
                </button>
                <button onClick={() => handleDelete(tier.id)} className="p-2 rounded-lg bg-dark-700 hover:bg-red-500/20">
                  <FiTrash2 className="text-red-400" size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Botones para crear los niveles que faltan */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(level => {
          if (existingLevels.has(level)) return null;
          const preset = TIER_PRESETS[level];
          return (
            <button
              key={level}
              onClick={() => handleCreate(level)}
              className="rounded-xl p-3 border border-dashed border-dark-600 hover:border-brand-500/50 hover:bg-dark-800 transition-colors flex flex-col items-center gap-1"
            >
              <span className="text-2xl">{preset.emoji}</span>
              <span className="text-xs text-gray-400">+ {preset.name}</span>
            </button>
          );
        })}
      </div>

      {/* Editor inline */}
      {editing && (
        <div className="card p-4 bg-dark-800 border border-brand-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold">
              {editing.isNew ? 'Nuevo tier' : 'Editar tier'} · Nivel {editing.tier_level}
            </p>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
              <FiX size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400">
              Nombre
              <input
                type="text"
                value={editing.name || ''}
                onChange={e => setEditing(s => ({ ...s, name: e.target.value }))}
                maxLength={40}
                className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Fan, VIP..."
              />
            </label>
            <label className="text-xs text-gray-400">
              Precio USD/mes
              <input
                type="number"
                step="0.01"
                min="1"
                max="500"
                value={editing.price}
                onChange={e => setEditing(s => ({ ...s, price: e.target.value }))}
                className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </label>
            <label className="text-xs text-gray-400">
              Emoji badge
              <input
                type="text"
                value={editing.badge_emoji}
                onChange={e => setEditing(s => ({ ...s, badge_emoji: e.target.value }))}
                maxLength={4}
                className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </label>
            <label className="text-xs text-gray-400">
              Color badge
              <input
                type="color"
                value={editing.badge_color}
                onChange={e => setEditing(s => ({ ...s, badge_color: e.target.value }))}
                className="w-full mt-1 h-10 bg-dark-700 rounded-lg cursor-pointer"
              />
            </label>
          </div>

          <label className="text-xs text-gray-400 block">
            Descripción (qué incluye)
            <textarea
              value={editing.description || ''}
              onChange={e => setEditing(s => ({ ...s, description: e.target.value }))}
              maxLength={300}
              rows={2}
              className="w-full mt-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Acceso a posts exclusivos, prioridad en respuestas..."
            />
          </label>

          <div>
            <p className="text-xs text-gray-400 mb-2">Beneficios</p>
            <div className="space-y-2">
              {Object.entries(PERK_LABELS).map(([k, meta]) => (
                <div key={k} className="flex items-center justify-between gap-3 bg-dark-700/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-300">{meta.label}</span>
                  {meta.type === 'bool' && (
                    <button
                      onClick={() => setEditing(s => ({
                        ...s,
                        perks: { ...s.perks, [k]: !s.perks?.[k] },
                      }))}
                      className={`w-10 h-5 rounded-full transition-colors ${editing.perks?.[k] ? 'bg-brand-500' : 'bg-dark-600'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${editing.perks?.[k] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  )}
                  {(meta.type === 'pct' || meta.type === 'int') && (
                    <input
                      type="number"
                      min="0"
                      max={meta.max}
                      value={editing.perks?.[k] || 0}
                      onChange={e => setEditing(s => ({
                        ...s,
                        perks: { ...s.perks, [k]: parseInt(e.target.value) || 0 },
                      }))}
                      className="w-16 bg-dark-700 rounded px-2 py-1 text-white text-xs text-right"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-2"
            >
              <FiCheck size={14} /> {editing.isNew ? 'Crear tier' : 'Guardar'}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm bg-dark-700 rounded-lg text-gray-300 hover:bg-dark-600">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
