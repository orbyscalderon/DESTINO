import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiExternalLink, FiCheckCircle, FiServer } from 'react-icons/fi';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';

const CATEGORY_LABELS = {
  infrastructure: 'Infraestructura',
  database: 'Base de datos',
  auth: 'Autenticación',
  payments: 'Pagos',
  video: 'Video',
  moderation: 'Moderación',
  analytics: 'Analítica',
  crash_reporting: 'Diagnóstico de errores',
  email: 'Email',
  push: 'Push notifications',
  storage: 'Almacenamiento',
  cdn: 'CDN',
  ai: 'AI',
  advertising: 'Publicidad',
  other: 'Otros',
};

export default function Subprocessors() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/privacy/subprocessors')
      .then(r => setItems(r.data?.subprocessors || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const grouped = items.reduce((acc, sp) => {
    if (!sp.active) return acc;
    (acc[sp.category] ??= []).push(sp);
    return acc;
  }, {});

  const removed = items.filter(s => !s.active && s.removed_at);

  return (
    <PageShell
      icon={FiServer}
      title="Subprocesadores"
      subtitle="Proveedores que tratan datos personales por cuenta de OC Moon Group LLC."
      backTo="/privacy"
      backLabel="Volver a Privacidad"
      maxWidth="4xl"
    >
        <p className="text-xs text-gray-600 mb-10">
          GDPR Art. 28(2) — Lista mantenida actualizada. Cambios se anuncian con 30 días de antelación.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([cat, sps]) => (
              <section key={cat}>
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  {CATEGORY_LABELS[cat] || cat}
                </h2>
                <div className="space-y-3">
                  {sps.map(sp => <Card key={sp.id} sp={sp} />)}
                </div>
              </section>
            ))}

            {removed.length > 0 && (
              <section className="mt-12 pt-8 border-t border-white/5">
                <h2 className="text-base font-bold text-gray-500 mb-3">Historial de proveedores retirados</h2>
                <ul className="text-xs text-gray-600 space-y-1">
                  {removed.map(s => (
                    <li key={s.id}>
                      <s>{s.name}</s> — retirado el {new Date(s.removed_at).toLocaleDateString('es')}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 flex-wrap">
          <Link to="/privacy"     className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/compliance"  className="hover:text-brand-400 transition-colors">Compliance</Link>
          <Link to="/privacy/cookies" className="hover:text-brand-400 transition-colors">Cookies</Link>
          <Link to="/privacy/processing" className="hover:text-brand-400 transition-colors">Records of Processing</Link>
        </div>
    </PageShell>
  );
}

function Card({ sp }) {
  return (
    <div className="glass-strong rounded-2xl p-5 border border-white/5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="font-bold text-white text-base">{sp.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{sp.country}</p>
        </div>
        {sp.scc_signed && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono shrink-0">
            <FiCheckCircle size={10} /> SCC
          </span>
        )}
      </div>
      <p className="text-sm text-gray-300 mb-2">{sp.purpose}</p>
      <p className="text-xs text-gray-500 mb-3">
        <span className="text-gray-600">Datos tratados:</span> {sp.data_categories}
      </p>
      <div className="flex gap-3 text-xs">
        {sp.dpa_url && (
          <a href={sp.dpa_url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-brand-400 hover:underline">
            DPA <FiExternalLink size={11} />
          </a>
        )}
        {sp.privacy_url && (
          <a href={sp.privacy_url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-brand-400 hover:underline">
            Privacy Policy <FiExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
