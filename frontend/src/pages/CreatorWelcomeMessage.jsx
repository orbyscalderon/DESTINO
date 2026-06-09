import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiMessageSquare } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorWelcomeMessage() {
  const [form, setForm] = useState({ enabled: true, message_text: '', ppv_media_url: '', ppv_price: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/creator-auto/welcome-message')
      .then(r => {
        const w = r.data?.welcome;
        if (w) setForm({
          enabled: w.enabled,
          message_text: w.message_text || '',
          ppv_media_url: w.ppv_media_url || '',
          ppv_price: w.ppv_price?.toString() || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.message_text || form.message_text.length < 5) {
      toast.error('El mensaje debe tener al menos 5 caracteres');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/creator-auto/welcome-message', {
        enabled: form.enabled,
        message_text: form.message_text,
        ppv_media_url: form.ppv_media_url || null,
        ppv_price: form.ppv_price ? parseInt(form.ppv_price) : null,
      });
      toast.success('Welcome message guardado');
    } catch {
      toast.error('Error guardando');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-xl mx-auto relative z-10">
        <Link to="/creator/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiMessageSquare className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Welcome Message</h1>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Mensaje automático que se envía cada vez que alguien se suscribe a tu contenido.
          Puede incluir un PPV (foto/video pago) opcional.
        </p>

        <div className="space-y-5">
          <label className="glass-strong rounded-2xl p-5 border border-white/5 flex items-center gap-4 cursor-pointer">
            <div className="flex-1">
              <p className="font-bold text-white">Activar welcome message</p>
              <p className="text-xs text-gray-400 mt-1">Si está desactivado, los nuevos subs no recibirán DM automático.</p>
            </div>
            <Toggle on={form.enabled} onChange={() => setForm(s => ({ ...s, enabled: !s.enabled }))} />
          </label>

          <div className="glass-strong rounded-2xl p-5 border border-white/5">
            <label className="block">
              <span className="block text-sm font-bold text-white mb-2">Texto del mensaje</span>
              <textarea
                value={form.message_text}
                onChange={(e) => setForm(s => ({ ...s, message_text: e.target.value }))}
                rows={5}
                maxLength={2000}
                placeholder="¡Hola! Gracias por suscribirte 💕 Aquí tienes contenido exclusivo cada semana…"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition resize-y"
              />
              <span className="text-xs text-gray-500 mt-1 block text-right">{form.message_text.length}/2000</span>
            </label>
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-white/5 space-y-4">
            <p className="text-sm font-bold text-white">PPV opcional</p>
            <p className="text-xs text-gray-400 -mt-2">
              Adjunta una foto o video con precio. El sub tendrá que pagar para verlo. (Sube primero el archivo desde tu galería).
            </p>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1">URL del media PPV</span>
              <input
                type="text"
                value={form.ppv_media_url}
                onChange={(e) => setForm(s => ({ ...s, ppv_media_url: e.target.value }))}
                placeholder="https://… (de tu galería privada)"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1">Precio en coins</span>
              <input
                type="number"
                value={form.ppv_price}
                onChange={(e) => setForm(s => ({ ...s, ppv_price: e.target.value }))}
                min="0"
                placeholder="100"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm focus:border-brand-500/50 focus:outline-none transition"
              />
            </label>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={onChange} role="switch" aria-checked={on}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? 'bg-brand-500' : 'bg-white/10'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
