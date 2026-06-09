import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const PURPOSES = [
  {
    key: 'analytics',
    title: 'Analítica de uso',
    desc: 'Permitir métricas anónimas de cómo usas la app para mejorar funcionalidades. Sin esto, no podemos detectar bugs ni problemas de UX.',
  },
  {
    key: 'marketing',
    title: 'Emails de marketing',
    desc: 'Recibir novedades, ofertas y anuncios de Destino TV por email.',
  },
  {
    key: 'personalization',
    title: 'Personalización del feed',
    desc: 'Adaptar el feed de Discover, Reels y Live Shows a tus intereses según tu comportamiento previo.',
  },
  {
    key: 'advertising',
    title: 'Publicidad personalizada',
    desc: 'Mostrar anuncios relevantes a tus intereses. Aplica solo en la versión gratuita.',
  },
  {
    key: 'thirdparty_share',
    title: 'Compartir datos con terceros',
    desc: 'Permitir que datos anónimos sean compartidos con proveedores analíticos (PostHog, Sentry). NUNCA vendemos datos identificables.',
  },
];

export default function PrivacyPreferences() {
  const [consents, setConsents] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/consents')
      .then(r => setConsents(r.data?.consents || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key) => {
    setConsents(s => ({ ...s, [key]: !s[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/consents/bulk', { consents });
      toast.success('Preferencias guardadas');
    } catch {
      toast.error('Error guardando preferencias');
    } finally {
      setSaving(false);
    }
  };

  const acceptAll = () => {
    const all = Object.fromEntries(PURPOSES.map(p => [p.key, true]));
    setConsents(all);
  };
  const rejectAll = () => {
    const none = Object.fromEntries(PURPOSES.map(p => [p.key, false]));
    setConsents(none);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-2xl mx-auto relative z-10">
        <Link to="/settings" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiShield className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Preferencias de privacidad</h1>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Controla qué datos puede usar Destino TV. Cumple con GDPR (UE), LGPD (Brasil) y LFPDPPP (México).
        </p>

        <div className="flex gap-2 mb-6">
          <button onClick={acceptAll} className="px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">
            Aceptar todas
          </button>
          <button onClick={rejectAll} className="px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">
            Rechazar todas
          </button>
        </div>

        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-5 border border-white/5 flex items-start gap-4">
            <div className="flex-1">
              <p className="font-bold text-white mb-1">Servicios esenciales</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Cookies de sesión, autenticación y seguridad. Necesarias para usar Destino TV — no se pueden desactivar.
              </p>
            </div>
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono shrink-0">
              Activado
            </span>
          </div>

          {PURPOSES.map(p => (
            <label key={p.key} className="glass-strong rounded-2xl p-5 border border-white/5 flex items-start gap-4 cursor-pointer hover:bg-white/[0.02] transition">
              <div className="flex-1">
                <p className="font-bold text-white mb-1">{p.title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{p.desc}</p>
              </div>
              <Toggle on={!!consents[p.key]} onChange={() => toggle(p.key)} />
            </label>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Guardar preferencias'}
          </button>
        </div>

        <p className="text-xs text-gray-600 mt-6 leading-relaxed">
          Puedes cambiar estas preferencias en cualquier momento. Los cambios solo afectan el procesamiento futuro.
          Para ejercer otros derechos (acceso, rectificación, portabilidad, eliminación), visita{' '}
          <Link to="/settings" className="text-brand-400 hover:underline">Configuración</Link> o escribe a{' '}
          <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a>.
        </p>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? 'bg-brand-500' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}
