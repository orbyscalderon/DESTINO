import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCalendar, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

export default function CreatorScheduled() {
  const [posts, setPosts] = useState([]);
  const [reels, setReels] = useState([]);
  const load = async () => {
    try {
      const r = await api.get('/api/creator-monetization/scheduled/mine');
      setPosts(r.data?.posts || []);
      setReels(r.data?.reels || []);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!confirm('¿Cancelar programación?')) return;
    await api.delete(`/api/creator-monetization/scheduled/post/${id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiCalendar /> Scheduled</h1>
        <p className="text-gray-500 text-sm mb-8">Contenido programado para publicarse. Cron corre cada 2 min.</p>

        <section className="mb-8">
          <h2 className="font-bold text-white mb-3">Posts ({posts.length})</h2>
          {posts.length === 0 ? (
            <p className="text-gray-500 text-sm">Ninguno programado</p>
          ) : (
            <div className="space-y-2">
              {posts.map(p => (
                <div key={p.id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-center gap-3">
                  {p.media_url && <img src={p.media_url} className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{p.caption || '(sin caption)'}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {new Date(p.scheduled_for).toLocaleString('es')}
                    </p>
                  </div>
                  <button onClick={() => cancel(p.id)} className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-white/5">
                    <FiX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-bold text-white mb-3">Reels ({reels.length})</h2>
          {reels.length === 0 ? (
            <p className="text-gray-500 text-sm">Ninguno programado</p>
          ) : (
            <div className="space-y-2">
              {reels.map(r => (
                <div key={r.id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-center gap-3">
                  <video src={r.video_url} className="w-12 h-12 rounded-lg object-cover shrink-0" muted />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.caption || '(sin caption)'}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {new Date(r.scheduled_for).toLocaleString('es')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
