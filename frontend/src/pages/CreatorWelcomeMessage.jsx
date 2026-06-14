import { useEffect, useState } from 'react';
import { FiMessageSquare, FiInfo, FiCheck, FiImage } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import Toggle from '../components/ui/Toggle.jsx';

export default function CreatorWelcomeMessage() {
  const [form, setForm] = useState({
    enabled: true,
    message_text: '',
    ppv_media_url: '',
    ppv_price: '',
  });
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
    if (form.ppv_media_url && (!form.ppv_price || parseInt(form.ppv_price) < 1)) {
      toast.error('Si adjuntás un PPV, definí un precio mayor a 0');
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
      toast.success('✓ Welcome message guardado');
    } catch {
      toast.error('Error guardando');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell icon={FiMessageSquare} title="Welcome Message" backTo="/creator/monetization" maxWidth="2xl">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      icon={FiMessageSquare}
      title="Welcome Message"
      subtitle="DM automático al nuevo suscriptor. Con PPV opcional para monetizar la bienvenida."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="2xl"
    >
      {/* Info */}
      <div className="card p-4 mb-5 bg-brand-500/5 border-brand-500/20 flex gap-3">
        <FiInfo className="text-brand-400 shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-gray-300 leading-relaxed">
          <p className="text-brand-300 font-bold mb-1">¿Cómo funciona?</p>
          <p>Cada vez que alguien se suscribe a tu contenido, le mandamos automáticamente el mensaje que configures acá. Si adjuntás un PPV, va pago y el sub paga para verlo.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Toggle */}
        <div className="card p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-white font-bold text-sm">Activar welcome message</p>
            <p className="text-xs text-gray-400 mt-0.5">Si está apagado, no se envía DM automático a nuevos subs.</p>
          </div>
          <Toggle
            on={form.enabled}
            onChange={() => setForm(s => ({ ...s, enabled: !s.enabled }))}
            ariaLabel="Activar welcome message"
          />
        </div>

        {/* Mensaje */}
        <div className="card p-4">
          <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1.5 flex items-center justify-between">
            <span>Texto del mensaje *</span>
            <span className={form.message_text.length > 1900 ? 'text-amber-400' : 'text-gray-600'}>
              {form.message_text.length}/2000
            </span>
          </label>
          <textarea
            value={form.message_text}
            onChange={(e) => setForm(s => ({ ...s, message_text: e.target.value.slice(0, 2000) }))}
            rows={5}
            placeholder="¡Hola! Gracias por suscribirte 💕 Tenés acceso a todo mi contenido exclusivo. Si querés algo custom, escribime."
            className="input-field w-full text-sm resize-y"
          />
          <p className="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1">
            <FiInfo size={11} className="shrink-0 mt-0.5" />
            Mantenelo personal y cálido — los subs notan la diferencia.
          </p>
        </div>

        {/* PPV opcional */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FiImage size={14} className="text-accent-400" />
            <p className="text-white font-bold text-sm">PPV opcional</p>
            <span className="text-[10px] bg-accent-500/15 text-accent-300 border border-accent-500/30 px-2 py-0.5 rounded-full font-bold">Monetiza</span>
          </div>
          <p className="text-xs text-gray-500">
            Adjuntá una foto o video pago al mensaje. El sub paga la cantidad que pongas para verlo.
            Subí el archivo a tu vault primero y pegá la URL acá.
          </p>

          <div>
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1 block">
              URL del media (desde vault)
            </label>
            <input
              type="url"
              value={form.ppv_media_url}
              onChange={(e) => setForm(s => ({ ...s, ppv_media_url: e.target.value }))}
              placeholder="https://… (URL pública del archivo en tu vault)"
              className="input-field w-full text-sm font-mono"
            />
            {form.ppv_media_url && (
              <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-dark-800 border border-white/10 max-w-xs">
                <img src={form.ppv_media_url} alt="Preview"
                  className="w-full h-full object-cover"
                  onError={e => e.target.style.display = 'none'} />
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1 block">
              Precio en coins
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="10"
                value={form.ppv_price}
                onChange={(e) => setForm(s => ({ ...s, ppv_price: e.target.value }))}
                placeholder="100"
                className="input-field text-sm w-32"
              />
              <span className="text-xs text-gray-500">coins (mínimo 1 si hay PPV)</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={save}
          disabled={saving || form.message_text.length < 5}
          className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white font-black text-sm py-3 rounded-xl shadow-glow-sm hover:shadow-glow flex items-center justify-center gap-2 transition-all"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <FiCheck size={16} /> Guardar configuración
            </>
          )}
        </button>
      </div>
    </PageShell>
  );
}
