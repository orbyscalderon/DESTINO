import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiAlertTriangle } from 'react-icons/fi';
import api from '../lib/api.js';

const BASIS_LABEL = {
  consent: 'Consentimiento',
  contract: 'Ejecución del contrato',
  legal_obligation: 'Obligación legal',
  vital_interests: 'Intereses vitales',
  public_task: 'Tarea de interés público',
  legitimate_interests: 'Interés legítimo',
};

export default function ProcessingActivities() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/privacy/processing-activities')
      .then(r => setItems(r.data?.activities || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link to="/privacy" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Records of Processing</h1>
        <p className="text-gray-500 text-sm mb-2">
          GDPR Art. 30 — Registro de actividades de tratamiento de datos personales
        </p>
        <p className="text-xs text-gray-600 mb-10">
          OC Moon Group LLC como responsable del tratamiento publica este registro voluntariamente como medida de transparencia.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {items.map(a => <Card key={a.id} a={a} />)}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 flex-wrap">
          <Link to="/privacy"               className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/privacy/subprocessors" className="hover:text-brand-400 transition-colors">Subprocesadores</Link>
          <Link to="/privacy/cookies"       className="hover:text-brand-400 transition-colors">Cookies</Link>
        </div>
      </div>
    </div>
  );
}

function Card({ a }) {
  return (
    <div className={`glass-strong rounded-2xl p-6 border ${a.is_special_category ? 'border-amber-500/30' : 'border-white/5'}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold text-white">{a.name}</h3>
        {a.is_special_category && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono shrink-0">
            <FiAlertTriangle size={10} /> Art. 9 Special Category
          </span>
        )}
      </div>
      <p className="text-gray-300 mb-4">{a.purpose}</p>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row label="Datos tratados"        value={a.data_categories} />
        <Row label="Personas afectadas"    value={a.data_subjects} />
        <Row label="Base legal"            value={BASIS_LABEL[a.legal_basis] || a.legal_basis} />
        <Row label="Retención"             value={a.retention_period} />
        <Row label="Transferencias intl."  value={a.international_transfers || 'Ninguna'} />
        <Row label="Subprocesadores"       value={a.subprocessors || '—'} />
        {a.is_special_category && (
          <Row label="Base Art. 9" value={a.special_category_basis} fullWidth />
        )}
        <Row label="Medidas de seguridad" value={a.security_measures} fullWidth />
      </dl>
    </div>
  );
}

function Row({ label, value, fullWidth }) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <dt className="text-xs text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm text-gray-200">{value}</dd>
    </div>
  );
}
