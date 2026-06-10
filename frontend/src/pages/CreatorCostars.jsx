import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiX, FiUserPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorCostars() {
  const [pending, setPending] = useState([]);

  const load = async () => {
    try {
      const r = await api.get('/api/adult-video/costars/pending');
      setPending(r.data?.pending || []);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const respond = async (videoId, accept) => {
    try {
      await api.post(`/api/adult-video/costars/${videoId}/confirm`, { accept });
      toast.success(accept ? 'Co-star confirmado' : 'Rechazado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiUserPlus /> Co-stars</h1>
        <p className="text-gray-500 text-sm mb-8">
          Invitaciones para aparecer en videos de otros creators. Si aceptas, te ofrecen el % de ingresos indicado.
        </p>

        <h2 className="text-white font-bold mb-3">Pendientes ({pending.length})</h2>

        <div className="space-y-3">
          {pending.map(p => (
            <div key={p.video_id} className="glass-strong rounded-2xl p-4 border border-white/5">
              <div className="flex items-start gap-3 mb-3">
                {p.video?.thumbnail_url && <img src={p.video.thumbnail_url} className="w-20 h-12 rounded object-cover shrink-0" alt="" />}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{p.video?.title || 'Video sin título'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Por {p.video?.profiles?.full_name || 'creator'}
                  </p>
                  <p className="text-xs text-brand-400 font-mono mt-1">
                    {p.revenue_split_pct > 0 ? `${p.revenue_split_pct}% del revenue del video` : 'Solo crédito (sin revenue)'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => respond(p.video_id, true)}
                  className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold flex items-center justify-center gap-1">
                  <FiCheck size={14} /> Aceptar
                </button>
                <button onClick={() => respond(p.video_id, false)}
                  className="flex-1 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-bold flex items-center justify-center gap-1">
                  <FiX size={14} /> Rechazar
                </button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-center py-12 text-gray-500 text-sm">Sin invitaciones pendientes</p>}
        </div>
      </div>
    </div>
  );
}
