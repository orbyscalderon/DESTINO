import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMail, FiCheck, FiClock } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';

const CATEGORIES = [
  { value: 'account',  label: 'Mi cuenta' },
  { value: 'payment',  label: 'Pagos / Coins / Suscripciones' },
  { value: 'creator',  label: 'Soy creador' },
  { value: 'safety',   label: 'Seguridad / Reportar usuario' },
  { value: 'bug',      label: 'Error / bug en la app' },
  { value: 'other',    label: 'Otro' },
];

export default function Support() {
  const navigate = useNavigate();
  const { profile, user } = useAuthStore();
  const [form, setForm] = useState({
    name: profile?.full_name || '',
    email: user?.email || '',
    category: 'other',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [myTickets, setMyTickets] = useState([]);

  useEffect(() => {
    if (!user) return;
    api.get('/api/support/my').then(r => setMyTickets(r.data?.tickets || [])).catch(() => {});
  }, [user?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error('Completa asunto y mensaje');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/api/support', form);
      setTicketId(data.ticket_id);
      toast.success('Recibimos tu solicitud');
      setForm(f => ({ ...f, subject: '', message: '' }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error enviando');
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketId) {
    return (
      <div className="min-h-screen px-4 pt-8 pb-24 max-w-lg mx-auto">
        <div className="card p-8 text-center bg-green-500/5 border-green-500/20">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <FiCheck className="text-green-400" size={32} />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">¡Recibimos tu solicitud!</h1>
          <p className="text-gray-400 text-sm mb-4">Te responderemos por email en máximo 48 horas hábiles.</p>
          <div className="bg-dark-800 rounded-lg p-3 inline-block text-xs">
            <span className="text-gray-500">ID:</span>{' '}
            <span className="text-white font-mono">{ticketId.substring(0, 8)}</span>
          </div>
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => setTicketId(null)} className="btn-secondary text-sm">Enviar otro</button>
            <Link to="/" className="btn-primary text-sm">Volver</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black gradient-text">Soporte</h1>
      </div>

      <div className="card p-4 mb-5 flex items-center gap-3 bg-brand-500/5 border-brand-500/20">
        <FiMail className="text-brand-400 shrink-0" size={20} />
        <div className="flex-1 text-xs text-gray-300">
          <p className="font-bold text-white text-sm mb-0.5">¿Necesitas ayuda?</p>
          <p>Escríbenos y te respondemos en máximo 48 horas hábiles.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Nombre</label>
            <input className="input-field py-2 text-sm w-full"
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Email *</label>
            <input type="email" className="input-field py-2 text-sm w-full"
              value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Categoría</label>
          <select className="input-field py-2 text-sm w-full"
            value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Asunto *</label>
          <input className="input-field py-2 text-sm w-full"
            value={form.subject} onChange={e => set('subject', e.target.value.substring(0, 200))}
            placeholder="Resumen breve de tu consulta" required />
        </div>

        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase mb-1 block">Mensaje *</label>
          <textarea className="input-field py-2 text-sm w-full resize-none" rows={6}
            value={form.message} onChange={e => set('message', e.target.value.substring(0, 5000))}
            placeholder="Cuéntanos qué necesitas con detalle…" required />
          <p className="text-[10px] text-gray-600 mt-1 text-right">{form.message.length} / 5000</p>
        </div>

        <button type="submit" disabled={submitting}
          className="btn-primary w-full disabled:opacity-50">
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>

      {user && myTickets.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-white mb-2">Mis solicitudes</h2>
          <div className="space-y-1.5">
            {myTickets.map(t => (
              <div key={t.id} className="card p-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  t.status === 'resolved' ? 'bg-green-500' :
                  t.status === 'in_progress' ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold truncate">{t.subject}</p>
                  <p className="text-[10px] text-gray-500">
                    {new Date(t.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    {' · '}
                    {t.status === 'resolved' ? 'Resuelto' : t.status === 'in_progress' ? 'En proceso' : 'Abierto'}
                  </p>
                </div>
                {t.admin_response && (
                  <span className="text-[10px] text-green-400 shrink-0 font-bold">Respondido</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
