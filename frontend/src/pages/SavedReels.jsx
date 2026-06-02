import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBookmark, FiHeart, FiPlay } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

// Reels guardados por el usuario (bookmarks).
export default function SavedReels() {
  const navigate = useNavigate();
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    api.get('/api/reels/saved?limit=50')
      .then(({ data }) => {
        if (!cancel) setReels(data.reels || []);
      })
      .catch(() => { if (!cancel) toast.error('No se pudieron cargar tus guardados'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Topbar */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="w-9 h-9 bg-dark-700 rounded-full flex items-center justify-center"
        >
          <FiArrowLeft size={16} />
        </button>
        <h1 className="font-bold tracking-tight flex items-center gap-2">
          <FiBookmark className="text-yellow-400" size={16} /> Guardados
        </h1>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reels.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FiBookmark className="text-gray-700 mx-auto mb-3" size={40} />
            <h2 className="text-white font-bold mb-1">Sin reels guardados</h2>
            <p className="text-sm mb-5 max-w-xs mx-auto">
              Toca el 🔖 en cualquier reel para guardarlo y verlo después.
            </p>
            <button
              onClick={() => navigate('/reels')}
              className="bg-brand-500 hover:bg-brand-400 text-white font-bold px-5 py-2.5 rounded-xl text-sm"
            >
              Ir al feed
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {reels.map(reel => (
              <Link
                key={reel.id}
                to={`/reels?id=${reel.id}`}
                className="relative aspect-[9/16] rounded-xl overflow-hidden bg-dark-700 group"
              >
                {reel.thumbnail_url ? (
                  <img
                    src={reel.thumbnail_url}
                    alt={reel.caption?.substring(0, 80) || 'Reel'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <video
                    src={reel.video_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-md text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <FiPlay size={8} /> {formatCount(reel.views_count || 0)}
                </div>
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-2 text-white text-[10px] font-semibold">
                  <span className="flex items-center gap-0.5">
                    <FiHeart size={10} className="fill-current" /> {formatCount(reel.likes_count || 0)}
                  </span>
                  {reel.duration_seconds > 0 && (
                    <span className="ml-auto bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded">
                      {Math.round(reel.duration_seconds)}s
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
