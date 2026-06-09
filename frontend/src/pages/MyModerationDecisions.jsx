import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiFileText, FiCpu, FiUser, FiExternalLink } from 'react-icons/fi';
import api from '../lib/api.js';

const DECISION_LABEL = {
  removed: 'Contenido removido',
  hidden: 'Contenido oculto',
  demoted: 'Visibilidad reducida',
  age_restricted: 'Restringido por edad',
  monetization_disabled: 'Monetización desactivada',
  account_suspended: 'Cuenta suspendida temporalmente',
  account_banned: 'Cuenta bloqueada permanentemente',
  warning_issued: 'Advertencia',
  restored: 'Contenido restaurado',
};

const SOURCE_LABEL = {
  user_report: 'Reporte de usuario',
  dmca_notice: 'Notificación DMCA',
  dsa_notice: 'Notificación DSA',
  trusted_flagger: 'Trusted Flagger (DSA Art. 22)',
  automated_scan: 'Sistema automatizado',
  admin_initiative: 'Revisión interna',
  court_order: 'Orden judicial',
  government_request: 'Requerimiento gubernamental',
};

export default function MyModerationDecisions() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/privacy/moderation-decisions/mine')
      .then(r => setDecisions(r.data?.decisions || []))
      .catch(() => setDecisions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/settings" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiFileText className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Decisiones de moderación</h1>
        </div>
        <p className="text-gray-500 text-sm mb-2">
          Statement of Reasons — DSA Art. 17
        </p>
        <p className="text-xs text-gray-600 mb-10">
          Cada decisión de moderación que afecta tu cuenta o contenido aparece acá con razón, base legal y derecho a apelar.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : decisions.length === 0 ? (
          <div className="glass-strong rounded-2xl p-8 border border-white/5 text-center">
            <p className="text-gray-400">No hay decisiones de moderación que afecten tu cuenta.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {decisions.map(d => <DecisionCard key={d.id} d={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionCard({ d }) {
  const Icon = d.decision_method === 'automated' ? FiCpu : FiUser;
  const deadlinePast = d.appeal_deadline && new Date(d.appeal_deadline) < new Date();

  return (
    <div className="glass-strong rounded-2xl p-5 border border-white/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-white">{DECISION_LABEL[d.decision] || d.decision}</p>
          <p className="text-xs text-gray-500 mt-1">
            {d.content_type} · {new Date(d.created_at).toLocaleString('es')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 font-mono shrink-0">
          <Icon size={10} /> {d.decision_method === 'automated' ? 'Automatizado' : d.decision_method === 'mixed' ? 'Mixto' : 'Humano'}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <Row label="Motivo"    value={d.reason_detail} />
        {d.tos_clause   && <Row label="Cláusula ToS" value={d.tos_clause} />}
        {d.legal_basis  && <Row label="Base legal"   value={d.legal_basis} />}
        <Row label="Origen"  value={SOURCE_LABEL[d.source] || d.source} />
        {d.automated_system && d.decision_method === 'automated' && (
          <Row label="Sistema usado" value={d.automated_system} />
        )}
      </dl>

      {d.appealable && (
        <div className="mt-4 pt-4 border-t border-white/5">
          {deadlinePast ? (
            <p className="text-xs text-gray-500">
              El plazo de apelación venció el {new Date(d.appeal_deadline).toLocaleDateString('es')}.
            </p>
          ) : (
            <Link to="/settings"
              className="inline-flex items-center gap-2 text-sm text-brand-400 hover:underline">
              Apelar esta decisión <FiExternalLink size={12} />
              {d.appeal_deadline && (
                <span className="text-xs text-gray-500">
                  · plazo {new Date(d.appeal_deadline).toLocaleDateString('es')}
                </span>
              )}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-xs text-gray-500 sm:w-32 shrink-0 mb-0.5 sm:mb-0">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </div>
  );
}
