import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import api from '../lib/api.js';

const PHASE_LABELS = {
  '1-latam': 'Fase 1 — LATAM',
  '2-spain': 'Fase 2 — España + LATAM',
  '3-global': 'Fase 3 — Global',
};

export default function Compliance() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/compliance/config')
      .then(r => setCfg(r.data?.config || {}))
      .catch(() => setCfg({}))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const v = (k, fallback = '—') => (cfg?.[k] && cfg[k] !== 'Pendiente' && cfg[k] !== 'Pendiente de designación' ? cfg[k] : fallback);
  const isPending = (k) => !cfg?.[k] || cfg[k].toLowerCase().startsWith('pendiente') || cfg[k].toLowerCase().startsWith('n/a');

  const Pending = () => <span className="inline-flex items-center gap-1.5 text-xs text-amber-400/80"><FiAlertCircle size={12} /> Pendiente</span>;
  const Ok = ({ children }) => <span className="text-white font-medium">{children}</span>;

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-accent-500/6 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiShield className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Compliance</h1>
        </div>
        <p className="text-gray-500 text-sm mb-2">
          Información de cumplimiento legal de Destino TV
        </p>
        <p className="text-xs text-gray-600 mb-10">
          Fase actual: <span className="text-brand-400 font-mono">{PHASE_LABELS[cfg?.phase] || cfg?.phase || '—'}</span>
        </p>

        <div className="space-y-6">

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiCheckCircle className="text-emerald-400" size={18} />
              Entidad responsable
            </h2>
            <dl className="space-y-3 text-sm">
              <Row label="Razón social"  value={isPending('entity_name') ? <Pending /> : <Ok>{v('entity_name')}</Ok>} />
              <Row label="Jurisdicción"  value={isPending('entity_jurisdiction') ? <Pending /> : <Ok>{v('entity_jurisdiction')}</Ok>} />
              <Row label="Domicilio"     value={isPending('entity_address') ? <Pending /> : <Ok>{v('entity_address')}</Ok>} />
              <Row label="Ley aplicable" value={<Ok>{v('governing_law')}</Ok>} />
              <Row label="Sede arbitral" value={<Ok>{v('arbitration_venue')}</Ok>} />
            </dl>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiCheckCircle className="text-emerald-400" size={18} />
              Data Protection Officer (DPO)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              GDPR Art. 37 / LGPD Art. 41 / LFPDPPP — punto de contacto para derechos de protección de datos.
            </p>
            <dl className="space-y-3 text-sm">
              <Row label="Nombre" value={<Ok>{v('dpo_name')}</Ok>} />
              <Row label="Email"  value={<a href={`mailto:${cfg?.dpo_email}`} className="text-brand-400 hover:underline">{cfg?.dpo_email}</a>} />
            </dl>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiCheckCircle className="text-emerald-400" size={18} />
              DMCA Designated Agent
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              17 U.S.C. § 512(c)(2) — Service Provider designated agent para notificaciones DMCA.
            </p>
            <dl className="space-y-3 text-sm">
              <Row label="Nombre"     value={isPending('dmca_agent_name') ? <Pending /> : <Ok>{v('dmca_agent_name')}</Ok>} />
              <Row label="Dirección"  value={isPending('dmca_agent_address') ? <Pending /> : <Ok>{v('dmca_agent_address')}</Ok>} />
              <Row label="Email"      value={<a href={`mailto:${cfg?.dmca_agent_email}`} className="text-brand-400 hover:underline">{cfg?.dmca_agent_email}</a>} />
              <Row label="Teléfono"   value={isPending('dmca_agent_phone') ? <Pending /> : <Ok>{v('dmca_agent_phone')}</Ok>} />
              <Row label="Registrado en US Copyright Office" value={isPending('dmca_agent_registered_at') ? <Pending /> : <Ok>{v('dmca_agent_registered_at')}</Ok>} />
            </dl>
            <div className="mt-4 pt-4 border-t border-white/5">
              <Link to="/dmca" className="text-sm text-brand-400 hover:underline">
                → Enviar notificación DMCA
              </Link>
            </div>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FiCheckCircle className="text-emerald-400" size={18} />
              Custodian of Records (18 U.S.C. § 2257)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Custodio de registros para contenido adulto producido o distribuido en jurisdicción USA.
            </p>
            <dl className="space-y-3 text-sm">
              <Row label="Nombre"     value={isPending('custodian_name') ? <Pending /> : <Ok>{v('custodian_name')}</Ok>} />
              <Row label="Dirección"  value={isPending('custodian_address') ? <Pending /> : <Ok>{v('custodian_address')}</Ok>} />
              <Row label="Email"      value={<a href={`mailto:${cfg?.custodian_email}`} className="text-brand-400 hover:underline">{cfg?.custodian_email}</a>} />
              <Row label="Horario"    value={<Ok>{v('custodian_hours')}</Ok>} />
            </dl>
            <div className="mt-4 pt-4 border-t border-white/5">
              <Link to="/2257" className="text-sm text-brand-400 hover:underline">
                → Statement 2257 completo
              </Link>
            </div>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">EU Representative</h2>
            <p className="text-xs text-gray-500 mb-4">
              GDPR Art. 27 — Representante designado en la Unión Europea (requerido si la entidad opera fuera del EEE).
            </p>
            <dl className="space-y-3 text-sm">
              <Row label="Nombre"     value={isPending('eu_representative_name') ? <Pending /> : <Ok>{v('eu_representative_name')}</Ok>} />
              <Row label="Dirección"  value={isPending('eu_representative_address') ? <Pending /> : <Ok>{v('eu_representative_address')}</Ok>} />
              <Row label="Email"      value={<a href={`mailto:${cfg?.eu_representative_email}`} className="text-brand-400 hover:underline">{cfg?.eu_representative_email}</a>} />
            </dl>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Buzones de contacto</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Soporte general" value={<a href={`mailto:${cfg?.support_email}`} className="text-brand-400 hover:underline">{cfg?.support_email}</a>} />
              <Row label="Legal"           value={<a href={`mailto:${cfg?.legal_email}`} className="text-brand-400 hover:underline">{cfg?.legal_email}</a>} />
              <Row label="DMCA"            value={<a href={`mailto:${cfg?.dmca_email}`} className="text-brand-400 hover:underline">{cfg?.dmca_email}</a>} />
              <Row label="DPO / Privacidad" value={<a href={`mailto:${cfg?.dpo_email}`} className="text-brand-400 hover:underline">{cfg?.dpo_email}</a>} />
            </dl>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Documentos legales</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Link to="/privacy"               className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Política de Privacidad</Link>
              <Link to="/terms"                 className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Términos de Servicio</Link>
              <Link to="/dmca"                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">DMCA (Copyright)</Link>
              <Link to="/dsa-notice"            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Notice and Action (DSA)</Link>
              <Link to="/2257"                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Statement 2257</Link>
              <Link to="/privacy/ccpa"          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">CCPA Opt-Out (California)</Link>
              <Link to="/privacy/preferences"   className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Preferencias de privacidad</Link>
              <Link to="/privacy/subprocessors" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Subprocesadores (Art. 28)</Link>
              <Link to="/privacy/cookies"       className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Inventario de Cookies</Link>
              <Link to="/privacy/processing"    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition">Records of Processing (Art. 30)</Link>
              <Link to="/transparency"          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition col-span-2">Reportes de Transparencia (DSA)</Link>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-gray-500 w-40 shrink-0">{label}</dt>
      <dd className="flex-1 text-gray-200">{value}</dd>
    </div>
  );
}
