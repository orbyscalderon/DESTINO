import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import api from '../lib/api.js';

const CAT_LABELS = {
  essential:    { label: 'Esenciales',      color: 'emerald' },
  preferences:  { label: 'Preferencias',    color: 'blue'    },
  analytics:    { label: 'Analítica',       color: 'amber'   },
  marketing:    { label: 'Marketing',       color: 'rose'    },
  advertising:  { label: 'Publicidad',      color: 'fuchsia' },
  thirdparty:   { label: 'Terceros',        color: 'orange'  },
};

const COLOR_CLS = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  rose:    'bg-rose-500/10 text-rose-400 border-rose-500/20',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
  orange:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

export default function Cookies() {
  const [cookies, setCookies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/privacy/cookies')
      .then(r => setCookies(r.data?.cookies || []))
      .catch(() => setCookies([]))
      .finally(() => setLoading(false));
  }, []);

  const grouped = cookies.reduce((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link to="/privacy" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Inventario de Cookies</h1>
        <p className="text-gray-500 text-sm mb-2">
          Lista exhaustiva de cookies y similares que Destino TV puede usar
        </p>
        <p className="text-xs text-gray-600 mb-8">
          ePrivacy Directive — Para gestionar consentimiento granular:{' '}
          <Link to="/privacy/preferences" className="text-brand-400 hover:underline">Preferencias de privacidad</Link>
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([cat, list]) => {
              const meta = CAT_LABELS[cat] || { label: cat, color: 'orange' };
              return (
                <section key={cat}>
                  <h2 className={`text-lg font-bold mb-3 inline-block px-3 py-1 rounded-full border ${COLOR_CLS[meta.color]}`}>
                    {meta.label} ({list.length})
                  </h2>
                  <div className="glass-strong rounded-2xl border border-white/5 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-white/5">
                          <th className="text-left p-3 font-medium">Nombre</th>
                          <th className="text-left p-3 font-medium hidden md:table-cell">Dominio</th>
                          <th className="text-left p-3 font-medium">Propósito</th>
                          <th className="text-left p-3 font-medium hidden md:table-cell">Duración</th>
                          <th className="text-left p-3 font-medium">Origen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(c => (
                          <tr key={c.id} className="border-b border-white/5 last:border-0">
                            <td className="p-3 font-mono text-brand-400 text-xs">{c.name}</td>
                            <td className="p-3 text-xs text-gray-400 hidden md:table-cell">{c.domain}</td>
                            <td className="p-3 text-gray-300 text-xs">{c.purpose}</td>
                            <td className="p-3 text-xs text-gray-400 hidden md:table-cell">{c.duration}</td>
                            <td className="p-3 text-xs">
                              <span className={`px-2 py-0.5 rounded-full ${c.party === 'first' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}`}>
                                {c.party === 'first' ? '1ª parte' : '3ª parte'}
                              </span>
                              {c.subprocessor && <div className="text-[10px] text-gray-600 mt-1">{c.subprocessor}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 flex-wrap">
          <Link to="/privacy"      className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/privacy/subprocessors" className="hover:text-brand-400 transition-colors">Subprocesadores</Link>
          <Link to="/privacy/preferences" className="hover:text-brand-400 transition-colors">Preferencias</Link>
        </div>
      </div>
    </div>
  );
}
