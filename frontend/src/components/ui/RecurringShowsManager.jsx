import { useState, useEffect } from 'react';
import { FiCalendar, FiPlus, FiTrash2, FiPlay, FiPause } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Panel para crear/gestionar shows recurrentes. Las instancias se generan
// automáticamente cada 10 min (backend cron) en live_shows con status='scheduled'.
// Push reminder a seguidores 15 min antes del start.

export default function RecurringShowsManager() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    recurrence: 'weekly',
    day_of_week: 3,
    hour: 20,
    minute: 0,
    duration_minutes: 60,
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/recurring-shows');
      setList(data.recurring || []);
    } catch {
      toast.error('Error cargando shows recurrentes');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return toast.error('Pon un título');
    setCreating(true);
    try {
      await api.post('/api/recurring-shows', form);
      toast.success('Show recurrente creado');
      setForm({ ...form, title: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Borrar este show recurrente? Las próximas instancias no se generarán.')) return;
    try {
      await api.delete(`/api/recurring-shows/${id}`);
      setList(prev => prev.filter(r => r.id !== id));
      toast.success('Borrado');
    } catch { toast.error('Error'); }
  };

  const handleToggle = async (id, active) => {
    try {
      await api.patch(`/api/recurring-shows/${id}`, { active });
      setList(prev => prev.map(r => r.id === id ? { ...r, active } : r));
    } catch { toast.error('Error'); }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FiCalendar size={16} className="text-brand-400" />
          <h3 className="text-sm font-bold text-white">Crear show recurrente</h3>
        </div>
        <p className="text-xs text-gray-500">
          Define un horario fijo (ej. todos los miércoles 8pm) y enviaremos
          push a tus seguidores 15 min antes.
        </p>

        <input
          value={form.title}
          onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Título (ej. Cena con fans)"
          className="input-field py-2 text-sm w-full"
          maxLength={200}
        />
        <input
          value={form.description}
          onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Descripción (opcional)"
          className="input-field py-2 text-sm w-full"
          maxLength={500}
        />

        <div className="flex gap-2">
          <button
            onClick={() => setForm(f => ({ ...f, recurrence: 'weekly' }))}
            className={`flex-1 text-xs py-2 rounded-lg font-semibold ${
              form.recurrence === 'weekly' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'
            }`}
          >
            Semanal
          </button>
          <button
            onClick={() => setForm(f => ({ ...f, recurrence: 'daily' }))}
            className={`flex-1 text-xs py-2 rounded-lg font-semibold ${
              form.recurrence === 'daily' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'
            }`}
          >
            Diario
          </button>
        </div>

        {form.recurrence === 'weekly' && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Día</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_SHORT.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setForm(f => ({ ...f, day_of_week: i }))}
                  className={`py-1.5 text-xs rounded ${
                    form.day_of_week === i ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Hora</p>
            <input
              type="number"
              min="0" max="23"
              value={form.hour}
              onChange={(e) => setForm(f => ({ ...f, hour: parseInt(e.target.value) || 0 }))}
              className="input-field py-2 text-sm w-full"
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Min</p>
            <input
              type="number"
              min="0" max="59"
              value={form.minute}
              onChange={(e) => setForm(f => ({ ...f, minute: parseInt(e.target.value) || 0 }))}
              className="input-field py-2 text-sm w-full"
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Duración</p>
            <input
              type="number"
              min="5" max="360"
              value={form.duration_minutes}
              onChange={(e) => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
              className="input-field py-2 text-sm w-full"
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating || !form.title.trim()}
          className="btn-primary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FiPlus size={14} /> {creating ? 'Creando…' : 'Crear'}
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card p-6 text-center text-gray-500 text-sm">Cargando…</div>
      ) : list.length === 0 ? (
        <div className="card p-6 text-center text-gray-500 text-sm">
          Sin shows recurrentes. Crea uno para que tus fans sepan cuándo encontrarte.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(r => (
            <div key={r.id} className="card p-3 flex items-center gap-3">
              <FiCalendar size={18} className={r.active ? 'text-brand-400' : 'text-gray-600'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{r.title}</p>
                <p className="text-[10px] text-gray-500">
                  {r.recurrence === 'daily'
                    ? `Cada día ${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`
                    : `${DAYS[r.day_of_week]} ${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`}
                  {' · '}{r.duration_minutes} min
                  {!r.active && ' · pausado'}
                </p>
              </div>
              <button
                onClick={() => handleToggle(r.id, !r.active)}
                className="text-gray-500 hover:text-white"
                aria-label={r.active ? 'Pausar' : 'Activar'}
              >
                {r.active ? <FiPause size={14} /> : <FiPlay size={14} />}
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                className="text-gray-500 hover:text-red-400"
                aria-label="Borrar"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
