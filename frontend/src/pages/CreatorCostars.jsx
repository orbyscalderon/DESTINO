import { useEffect, useState } from 'react';
import { FiCheck, FiX, FiUserPlus, FiInfo, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';

export default function CreatorCostars() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pendRes, histRes] = await Promise.all([
        api.get('/api/adult-video/costars/pending'),
        api.get('/api/adult-video/costars/history?limit=10').catch(() => ({ data: { history: [] } })),
      ]);
      setPending(pendRes.data?.pending || []);
      setHistory(histRes.data?.history || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const respond = async (videoId, accept) => {
    setBusy(videoId);
    try {
      await api.post(`/api/adult-video/costars/${videoId}/confirm`, { accept });
      toast.success(accept ? '✓ Co-star confirmado — aparecés en el video' : 'Rechazado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setBusy(null); }
  };

  return (
    <PageShell
      icon={FiUserPlus}
      title="Co-stars"
      subtitle="Otros creators te invitan a aparecer en sus videos. Si aceptás, te dan el % de revenue que indican."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="2xl"
    >
      {/* Info box */}
      <div className="card p-4 mb-5 bg-brand-500/5 border-brand-500/20 flex gap-3">
        <FiInfo className="text-brand-400 shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-gray-300 leading-relaxed">
          <p className="text-brand-300 font-bold mb-1">¿Cómo funciona?</p>
          <p>Si aceptás, el creator publica el video y recibís tu % del revenue automáticamente cuando alguien lo compra. Tu nombre aparece como co-star en la ficha del video.</p>
        </div>
      </div>

      {/* Pending */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <FiClock size={14} className="text-amber-400" />
            Pendientes
          </h2>
          <span className="text-xs text-gray-500">{pending.length} {pending.length === 1 ? 'invitación' : 'invitaciones'}</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-32 bg-dark-800 rounded-2xl animate-pulse" />)}
          </div>
        ) : pending.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-2 opacity-40">🎬</div>
            <p className="text-gray-500 text-sm">Sin invitaciones pendientes ahora.</p>
            <p className="text-gray-600 text-xs mt-1">Cuando otros creators te inviten, aparecerán acá.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.video_id} className="card p-4 hover:border-brand-500/30 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  {p.video?.thumbnail_url ? (
                    <img loading="lazy" src={p.video.thumbnail_url} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0 ring-1 ring-white/10" />
                  ) : (
                    <div className="w-24 h-14 rounded-lg bg-dark-800 shrink-0 flex items-center justify-center text-2xl opacity-30">🎬</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{p.video?.title || 'Video sin título'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Te invitó <span className="text-gray-300">{p.video?.profiles?.full_name || 'creator'}</span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {p.revenue_split_pct > 0 ? (
                        <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          💰 {p.revenue_split_pct}% del revenue
                        </span>
                      ) : (
                        <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          📝 Solo crédito (sin revenue)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(p.video_id, true)}
                    disabled={busy === p.video_id}
                    className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <FiCheck size={14} /> Aceptar
                  </button>
                  <button
                    onClick={() => respond(p.video_id, false)}
                    disabled={busy === p.video_id}
                    className="flex-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <FiX size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-sm mb-3">Historial reciente</h2>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.video_id} className="card p-3 flex items-center gap-3">
                {h.video?.thumbnail_url && (
                  <img loading="lazy" src={h.video.thumbnail_url} className="w-10 h-10 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{h.video?.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {h.confirmed ? '✓ Aceptado' : h.confirmed === false ? '✗ Rechazado' : 'Pendiente'}
                    {h.revenue_split_pct > 0 && ` · ${h.revenue_split_pct}%`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}
