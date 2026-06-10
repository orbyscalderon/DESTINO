import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiPlayCircle, FiTrash2 } from 'react-icons/fi';
import api from '../lib/api.js';

export default function ContinueWatching() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/adult-video/watch/continue?limit=30');
      setItems(r.data?.items || []);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (videoId, e) => {
    e.preventDefault();
    e.stopPropagation();
    await api.delete(`/api/adult-video/watch/${videoId}`);
    setItems(items.filter(i => i.video?.id !== videoId));
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2 flex items-center gap-2">
          <FiPlayCircle /> Continuar viendo
        </h1>
        <p className="text-gray-500 text-sm mb-10">Tus videos en progreso</p>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No tenés videos en progreso.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(i => (
              <Link key={i.video?.id} to={`/explore/v/${i.video?.id}`}
                className="glass-strong rounded-2xl border border-white/5 overflow-hidden hover:bg-white/[0.04] transition group relative">
                <div className="aspect-video bg-dark-800 relative">
                  {i.video?.thumbnail_url && <img src={i.video.thumbnail_url} className="w-full h-full object-cover" alt="" />}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                    <div className="h-full bg-brand-500" style={{ width: `${i.progress_pct}%` }} />
                  </div>
                  <button onClick={(e) => remove(i.video?.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/70 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition">
                    <FiTrash2 size={12} />
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-sm text-white truncate font-medium">{i.video?.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                    {i.progress_pct}% · {new Date(i.last_watched_at).toLocaleDateString('es')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
