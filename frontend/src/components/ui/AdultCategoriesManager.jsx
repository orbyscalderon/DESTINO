import { useEffect, useState } from 'react';
import { FiCheck, FiTag, FiSave } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

const MAX_CATEGORIES = 12;

const GROUP_LABELS = {
  body:        'Físico',
  identity:    'Identidad',
  style:       'Estilo',
  niche:       'Nicho',
  preference:  'Preferencias',
  service:     'Servicios',
};

// Manager de categorías para creadores adultos.
// Solo se muestra a `is_adult_creator: true`.
// Permite seleccionar hasta MAX_CATEGORIES tags para aparecer en los filtros
// del directorio /adult-creators.
export default function AdultCategoriesManager() {
  const [groups, setGroups] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [original, setOriginal] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [catRes, mineRes] = await Promise.all([
          api.get('/api/adult-categories'),
          api.get('/api/adult-categories/mine').catch(() => ({ data: { categories: [] } })),
        ]);
        if (cancel) return;
        setGroups(catRes.data?.groups || {});
        const mineSlugs = (mineRes.data?.categories || []).map(c => c.slug);
        setSelected(new Set(mineSlugs));
        setOriginal(new Set(mineSlugs));
      } catch {
        if (!cancel) toast.error('No se pudieron cargar las categorías');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const toggle = (slug) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        if (next.size >= MAX_CATEGORIES) {
          toast.error(`Máximo ${MAX_CATEGORIES} categorías`);
          return next;
        }
        next.add(slug);
      }
      return next;
    });
  };

  const dirty =
    selected.size !== original.size
    || [...selected].some(s => !original.has(s));

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/adult-categories/mine', { slugs: [...selected] });
      setOriginal(new Set(selected));
      toast.success('Categorías guardadas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-2xl p-4 sm:p-5 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FiTag className="text-pink-400" size={18} />
          <h3 className="text-white font-bold text-base">Categorías</h3>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {selected.size} / {MAX_CATEGORIES}
        </span>
      </div>
      <p className="text-gray-400 text-xs mb-4">
        Selecciona las etiquetas que mejor te describen — los fans las usan
        para encontrarte en el directorio adulto.
      </p>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {Object.entries(groups).map(([groupKey, cats]) => (
          <div key={groupKey}>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
              {GROUP_LABELS[groupKey] || groupKey}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cats.map(cat => {
                const active = selected.has(cat.slug);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggle(cat.slug)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      active
                        ? 'bg-pink-500/20 border border-pink-500/40 text-pink-300'
                        : 'bg-dark-700 border border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    {cat.emoji && <span aria-hidden="true">{cat.emoji}</span>}
                    {cat.name}
                    {active && <FiCheck size={11} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="mt-4 w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <><FiSave size={15} /> Guardar categorías</>
        }
      </button>
    </div>
  );
}
