import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlayCircle, FiTrash2 } from 'react-icons/fi';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

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
    <PageShell
      icon={FiPlayCircle}
      title="Continuar viendo"
      subtitle="Tus videos en progreso — retomalos desde donde los dejaste."
      backTo="/"
      maxWidth="5xl"
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card p-0 overflow-hidden">
              <div className="skeleton aspect-video w-full" />
              <div className="p-3 space-y-2">
                <div className="skeleton-line w-3/4" />
                <div className="skeleton-line w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🎬"
          title="No hay videos en progreso"
          desc="Cuando empieces un video y lo pauses a la mitad, aparecerá acá para que lo retomes con un clic."
        />
      ) : (
        <motion.div
          layout
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence>
            {items.map(i => (
              <motion.div
                key={i.video?.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
                }}
              >
                <Link
                  to={`/explore/v/${i.video?.id}`}
                  className="card-interactive p-0 overflow-hidden block group h-full"
                >
                  <div className="aspect-video bg-dark-800 relative">
                    {i.video?.thumbnail_url && (
                      <img
                        src={i.video.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
                      />
                    )}
                    {/* Resume indicator overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <FiPlayCircle className="text-white drop-shadow-lg" size={48} />
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-accent-500"
                        style={{ width: `${i.progress_pct}%` }}
                      />
                    </div>
                    {/* Remove button */}
                    <button
                      onClick={(e) => remove(i.video?.id, e)}
                      aria-label="Quitar"
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/70
                                 hover:text-rose-400 hover:bg-black/80
                                 opacity-0 group-hover:opacity-100
                                 transition-all duration-200 ease-out-expo"
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-white truncate font-medium">{i.video?.title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 tabular-nums flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-brand-500" />
                      {i.progress_pct}% · {new Date(i.last_watched_at).toLocaleDateString('es')}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </PageShell>
  );
}
