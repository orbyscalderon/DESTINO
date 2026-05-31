import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiEye, FiEyeOff } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const EMOJIS_SUGGEST = ['💋','💕','📞','📹','💌','🌹','🎁','💎','👙','📸','🔥','✨'];

export default function TipMenuManager() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ label: '', emoji: '💋', price_coins: 50, description: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/creator/tip-menu');
      setItems(data?.items || []);
    } catch { toast.error('Error cargando menú'); }
    finally { setLoading(false); }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      label: item.label, emoji: item.emoji || '💋',
      price_coins: item.price_coins,
      description: item.description || '',
    });
  };

  const startAdd = () => {
    setAdding(true);
    setForm({ label: '', emoji: '💋', price_coins: 50, description: '' });
  };

  const cancel = () => { setEditingId(null); setAdding(false); };

  const save = async () => {
    if (!form.label.trim()) return toast.error('Pon una etiqueta');
    const price = parseInt(form.price_coins);
    if (!price || price < 1) return toast.error('Precio inválido');
    try {
      if (editingId) {
        await api.patch(`/api/creator/tip-menu/${editingId}`, form);
        toast.success('Actualizado');
      } else {
        await api.post('/api/creator/tip-menu', form);
        toast.success('Agregado');
      }
      cancel();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const toggleActive = async (item) => {
    try {
      await api.patch(`/api/creator/tip-menu/${item.id}`, { is_active: !item.is_active });
      load();
    } catch { toast.error('Error'); }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este item del menú?')) return;
    try {
      await api.delete(`/api/creator/tip-menu/${id}`);
      load();
    } catch { toast.error('Error'); }
  };

  const isEditing = editingId || adding;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">💌 Tip Menu</h3>
          <p className="text-[10px] text-gray-500">Lista de cosas que tus fans pueden "comprar" enviándote coins</p>
        </div>
        {!isEditing && (
          <button onClick={startAdd}
            className="text-brand-400 hover:text-brand-300 text-xs font-bold flex items-center gap-1">
            <FiPlus size={12} /> Agregar
          </button>
        )}
      </div>

      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="bg-dark-800 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <button
                  className="w-12 h-10 bg-dark-700 rounded-lg flex items-center justify-center text-xl shrink-0 hover:bg-dark-600"
                  title="Click para abrir selector"
                >
                  {form.emoji}
                </button>
                <input
                  className="input-field flex-1 py-2 text-sm"
                  placeholder="Etiqueta (ej: Beso por video)"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value.substring(0, 60) }))}
                />
                <div className="relative w-24 shrink-0">
                  <input
                    type="number" min="1" max="99999"
                    className="input-field py-2 text-sm w-full pl-7"
                    placeholder="50"
                    value={form.price_coins}
                    onChange={e => setForm(f => ({ ...f, price_coins: e.target.value }))}
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400 text-xs">⚡</span>
                </div>
              </div>
              <input
                className="input-field py-2 text-sm w-full"
                placeholder="Descripción opcional"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value.substring(0, 200) }))}
              />
              <div className="flex gap-1.5 flex-wrap">
                {EMOJIS_SUGGEST.map(e => (
                  <button key={e}
                    onClick={() => setForm(f => ({ ...f, emoji: e }))}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-base transition-colors ${
                      form.emoji === e ? 'bg-brand-500/30 ring-1 ring-brand-500' : 'bg-dark-700 hover:bg-dark-600'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={save} className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1">
                  <FiSave size={11} /> Guardar
                </button>
                <button onClick={cancel} className="btn-secondary text-xs py-2 px-4 flex items-center gap-1">
                  <FiX size={11} /> Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center py-8 text-gray-500 text-xs">Cargando…</div>
      ) : items.length === 0 && !isEditing ? (
        <div className="text-center py-6 text-gray-500 text-xs">
          Tu menú está vacío. Agrega "Beso", "Llamada 5min", etc.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.id} className={`flex items-center gap-2 p-2 rounded-lg bg-dark-800 ${!item.is_active ? 'opacity-50' : ''}`}>
              <span className="text-2xl shrink-0">{item.emoji || '💌'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.label}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span className="text-yellow-400 font-bold">⚡ {item.price_coins}</span>
                  {item.redemptions_count > 0 && <span>· {item.redemptions_count} ventas</span>}
                </div>
              </div>
              <button onClick={() => toggleActive(item)}
                title={item.is_active ? 'Pausar' : 'Activar'}
                className="w-8 h-8 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 flex items-center justify-center">
                {item.is_active ? <FiEye size={13} /> : <FiEyeOff size={13} />}
              </button>
              <button onClick={() => startEdit(item)}
                className="w-8 h-8 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 flex items-center justify-center">
                <FiEdit2 size={12} />
              </button>
              <button onClick={() => remove(item.id)}
                className="w-8 h-8 rounded-lg bg-dark-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 flex items-center justify-center">
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
