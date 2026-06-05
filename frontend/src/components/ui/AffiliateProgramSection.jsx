import { useState, useEffect } from 'react';
import { FiUsers, FiDollarSign, FiCopy, FiShare2, FiCheck, FiTrendingUp } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Dashboard del programa de afiliados — para influencers que reclutan creators.
// 10% commission del revenue de cada creator por 6 meses.

export default function AffiliateProgramSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/affiliate/my-program');
      setData(data);
    } catch {
      setData({ program: null });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await api.post('/api/affiliate/enroll');
      toast.success('¡Estás dentro del programa!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setEnrolling(false);
    }
  };

  const share = async (url) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Únete a Destino TV como creador',
          text: `Únete con mi código y empieza a ganar`,
          url,
        });
      } catch {}
    } else {
      copy(url);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copiado');
  };

  if (loading) return <div className="card p-6 text-center text-gray-500 text-sm">Cargando…</div>;

  if (!data?.program) {
    return (
      <div className="card p-5 bg-gradient-to-br from-brand-500/15 to-purple-500/5 border-brand-500/30">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/20 flex items-center justify-center shrink-0">
            <FiTrendingUp size={22} className="text-brand-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Programa de Afiliados</h3>
            <p className="text-xs text-gray-400 mt-1">
              Gana <b className="text-brand-400">10% del revenue</b> de cada creator que traigas
              durante los primeros <b className="text-brand-400">6 meses</b>.
            </p>
          </div>
        </div>

        <ul className="text-xs text-gray-300 space-y-1.5 mb-4">
          <li className="flex items-center gap-2"><FiCheck size={11} className="text-green-400" /> Sin límite de creators reclutados</li>
          <li className="flex items-center gap-2"><FiCheck size={11} className="text-green-400" /> Comisión sobre tips, regalos, subscriptions y shows privados</li>
          <li className="flex items-center gap-2"><FiCheck size={11} className="text-green-400" /> Pagos mensuales vía Stripe Connect</li>
          <li className="flex items-center gap-2"><FiCheck size={11} className="text-green-400" /> Dashboard con stats en tiempo real</li>
        </ul>

        <button
          onClick={handleEnroll}
          disabled={enrolling}
          className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
        >
          {enrolling ? 'Inscribiendo…' : 'Inscribirme al programa'}
        </button>
      </div>
    );
  }

  const program = data.program;
  const refs = data.referrals || [];
  const recent = data.recent_commissions || [];
  const shareUrl = `${window.location.origin}/#/register?aff=${program.affiliate_code}`;
  const activeRefs = refs.filter(r => new Date(r.commission_expires_at) > new Date());

  return (
    <div className="space-y-3">
      {/* Hero card */}
      <div className="card p-5 bg-gradient-to-br from-brand-500/15 to-purple-500/5 border-brand-500/30">
        <div className="flex items-center gap-2 mb-3">
          <FiTrendingUp size={16} className="text-brand-400" />
          <h3 className="text-sm font-bold text-white">Tu Programa de Afiliados</h3>
          <span className="text-[9px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">
            {program.status?.toUpperCase()}
          </span>
        </div>

        <div className="bg-dark-900/70 rounded-xl p-4 mb-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Tu código</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-2xl font-black text-white font-mono tracking-widest">
              {program.affiliate_code}
            </code>
            <button
              onClick={() => copy(program.affiliate_code)}
              className="w-9 h-9 rounded-lg bg-dark-700 hover:bg-dark-600 flex items-center justify-center"
              aria-label="Copiar código"
            >
              {copied ? <FiCheck size={14} className="text-green-400" /> : <FiCopy size={14} className="text-gray-300" />}
            </button>
          </div>
        </div>

        <button
          onClick={() => share(shareUrl)}
          className="btn-primary w-full text-sm py-2 flex items-center justify-center gap-2"
        >
          <FiShare2 size={14} /> Compartir link de invitación
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <FiUsers size={14} className="text-blue-400 mx-auto mb-1" />
          <p className="text-xl font-black text-white tabular-nums">{activeRefs.length}</p>
          <p className="text-[9px] text-gray-500 uppercase">Activos</p>
        </div>
        <div className="card p-3 text-center">
          <FiDollarSign size={14} className="text-green-400 mx-auto mb-1" />
          <p className="text-xl font-black text-white tabular-nums">${Number(program.total_earned_usd || 0).toFixed(0)}</p>
          <p className="text-[9px] text-gray-500 uppercase">Ganado</p>
        </div>
        <div className="card p-3 text-center bg-yellow-500/5 border-yellow-500/20">
          <FiDollarSign size={14} className="text-yellow-400 mx-auto mb-1" />
          <p className="text-xl font-black text-white tabular-nums">${Number(program.total_paid_out_usd || 0).toFixed(0)}</p>
          <p className="text-[9px] text-gray-500 uppercase">Pagado</p>
        </div>
      </div>

      {/* Creadores referidos */}
      {refs.length > 0 && (
        <div className="card p-3">
          <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Tus creadores ({refs.length})</h4>
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
            {refs.map(r => {
              const daysLeft = Math.max(0, Math.ceil((new Date(r.commission_expires_at) - Date.now()) / 86400000));
              return (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  <img
                    src={r.creator?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.creator?.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {r.creator?.full_name || 'Sin nombre'}
                      {r.creator?.is_creator && <span className="ml-1 text-[9px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded">CRE</span>}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {daysLeft > 0
                        ? `${daysLeft} días de comisión`
                        : 'Comisión expiró'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-green-400 tabular-nums">
                    ${Number(r.total_commission_usd || 0).toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent commissions */}
      {recent.length > 0 && (
        <div className="card p-3">
          <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Comisiones recientes</h4>
          <div className="divide-y divide-white/5">
            {recent.slice(0, 10).map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="text-gray-500 capitalize w-20 truncate">{c.source}</span>
                <span className="text-gray-400 flex-1">${Number(c.gross_usd).toFixed(2)} bruto</span>
                <span className="text-green-400 font-bold tabular-nums">+${Number(c.commission_usd).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
