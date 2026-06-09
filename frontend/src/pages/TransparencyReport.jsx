import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiBarChart2 } from 'react-icons/fi';
import api from '../lib/api.js';

export default function TransparencyReport() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/transparency')
      .then(r => setReports(r.data?.reports || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link to="/compliance" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiBarChart2 className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Reportes de Transparencia</h1>
        </div>
        <p className="text-gray-500 text-sm mb-10">
          Conforme a DSA Art. 15 y 24 — métricas trimestrales de moderación de contenido.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="glass-strong rounded-2xl p-8 border border-white/5 text-center">
            <p className="text-gray-400">Todavía no se han publicado reportes.</p>
            <p className="text-xs text-gray-600 mt-2">
              El primer reporte se publicará al cierre del trimestre fiscal vigente.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {reports.map(r => <ReportCard key={r.id} r={r} />)}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500">
          <Link to="/compliance" className="hover:text-brand-400 transition-colors">Compliance</Link>
          <Link to="/privacy"    className="hover:text-brand-400 transition-colors">Privacidad</Link>
          <Link to="/terms"      className="hover:text-brand-400 transition-colors">Términos</Link>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ r }) {
  return (
    <div className="glass-strong rounded-2xl p-6 border border-white/5">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-2xl font-black text-white">{r.period}</h2>
        <p className="text-xs text-gray-500 font-mono">
          {new Date(r.period_start).toLocaleDateString('es')} — {new Date(r.period_end).toLocaleDateString('es')}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Usuarios"           value={r.total_users} />
        <Stat label="Creadores"          value={r.total_creators} />
        <Stat label="Reportes recibidos" value={r.total_reports_received} />
        <Stat label="Reportes actuados"  value={r.total_reports_actioned} />
        <Stat label="Contenido removido" value={r.total_content_removed} />
        <Stat label="Cuentas baneadas"   value={r.total_accounts_banned} />
        <Stat label="DMCA recibidos"     value={r.total_dmca_received} />
        <Stat label="DMCA aceptados"     value={r.total_dmca_accepted} />
        <Stat label="Trusted Flagger"    value={r.total_trusted_flagger_reports} />
        <Stat label="Solicitudes gob."   value={r.total_government_requests} />
      </div>

      {r.notes && (
        <div className="mt-5 pt-5 border-t border-white/5">
          <p className="text-xs text-gray-500 mb-1">Notas</p>
          <p className="text-sm text-gray-300">{r.notes}</p>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-4 font-mono">
        Publicado: {new Date(r.published_at).toLocaleString('es')}
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black text-white font-mono">{(value || 0).toLocaleString('es')}</p>
    </div>
  );
}
