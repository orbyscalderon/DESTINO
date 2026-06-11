import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShield, FiBarChart2, FiMail, FiTarget, FiTv, FiShare2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import Toggle from '../components/ui/Toggle.jsx';

const PURPOSES = [
  { key: 'analytics',        icon: FiBarChart2, title: 'Analítica de uso',         desc: 'Métricas anónimas para mejorar la app. Sin esto, no podemos detectar bugs ni problemas de UX.' },
  { key: 'marketing',        icon: FiMail,      title: 'Emails de marketing',      desc: 'Novedades, ofertas y anuncios por email.' },
  { key: 'personalization',  icon: FiTarget,    title: 'Personalización del feed', desc: 'Discover, Reels y Live Shows adaptados a tus intereses.' },
  { key: 'advertising',      icon: FiTv,        title: 'Publicidad personalizada', desc: 'Anuncios relevantes a tus intereses. Solo en la versión gratuita.' },
  { key: 'thirdparty_share', icon: FiShare2,    title: 'Compartir con terceros',   desc: 'Datos anónimos a proveedores analíticos (PostHog, Sentry). NUNCA vendemos datos identificables.' },
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

  const toggle = (key) => setConsents(s => ({ ...s, [key]: !s[key] }));

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/consents/bulk', { consents });
      toast.success('Preferencias guardadas ✨');
    } catch { toast.error('Error guardando'); }
    finally { setSaving(false); }
  };

  const acceptAll = () => setConsents(Object.fromEntries(PURPOSES.map(p => [p.key, true])));
  const rejectAll = () => setConsents(Object.fromEntries(PURPOSES.map(p => [p.key, false])));

  return (
    <PageShell
      icon={FiShield}
      title="Preferencias de privacidad"
      subtitle="Controlá qué datos puede usar Destino TV. Cumple GDPR (UE), LGPD (Brasil) y LFPDPPP (México)."
      backTo="/settings"
      maxWidth="2xl"
    >
      <div className="flex gap-2 mb-6">
        <button onClick={acceptAll} className="btn-secondary text-sm py-2 px-4">
          Aceptar todas
        </button>
        <button onClick={rejectAll} className="btn-ghost text-sm py-2 px-4">
          Rechazar todas
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-card flex items-center gap-3">
              <div className="skeleton w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-line w-1/3" />
                <div className="skeleton-line w-2/3" />
              </div>
              <div className="skeleton w-12 h-7 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <motion.div
          initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="space-y-3"
        >
          {/* Essential — siempre on, no toggleable */}
          <motion.div
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
            className="card-form flex items-start gap-4"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <FiShield size={16} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">Servicios esenciales</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Cookies de sesión, autenticación y seguridad. Necesarias para usar Destino TV — no se pueden desactivar.
              </p>
            </div>
            <span className="pill-emerald shrink-0">Activado</span>
          </motion.div>

          {PURPOSES.map(p => (
            <motion.label
              key={p.key}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className={`card-form flex items-start gap-4 cursor-pointer transition-all duration-300 ${consents[p.key] ? 'border-brand-500/30' : ''}`}
            >
              <div className={`p-2 rounded-lg shrink-0 transition-colors duration-300 ${consents[p.key] ? 'bg-brand-500/15 border border-brand-500/30 text-brand-300' : 'bg-white/5 border border-white/10 text-gray-500'}`}>
                <p.icon size={16} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white">{p.title}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{p.desc}</p>
              </div>
              <Toggle on={!!consents[p.key]} onChange={() => toggle(p.key)} />
            </motion.label>
          ))}
        </motion.div>
      )}

      <div className="mt-8 flex gap-3">
        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              Guardando…
            </>
          ) : 'Guardar preferencias'}
        </button>
      </div>

      <p className="text-xs text-gray-600 mt-6 leading-relaxed">
        Podés cambiar estas preferencias en cualquier momento. Los cambios solo afectan el procesamiento futuro.
        Para ejercer otros derechos (acceso, rectificación, portabilidad, eliminación), visitá{' '}
        <Link to="/settings" className="text-brand-400 hover:underline">Configuración</Link> o escribí a{' '}
        <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a>.
      </p>
    </PageShell>
  );
}
