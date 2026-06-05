import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiBookmark, FiHeart, FiPlay, FiTrash2 } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Galería de hasta 3 reels destacados del user, para mostrar en perfil
// público (UserProfile.jsx) y privado (Profile.jsx). El dueño puede
// despinearlos desde el botón en cada thumb.

export default function PinnedReelsGrid({ userId, isOwner }) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/reels/pinned/${userId}`);
      setReels(data.reels || []);
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const handleUnpin = async (e, reelId) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.post(`/api/reels/${reelId}/pin`);
      setReels(prev => prev.filter(r => r.id !== reelId));
      toast.success('Despinneado');
    } catch {
      toast.error('Error');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {[...Array(3)].map((_, i) => <div key={i} className="aspect-[9/16] bg-dark-700 animate-pulse rounded-lg" />)}
      </div>
    );
  }

  if (reels.length === 0) {
    if (!isOwner) return null;
    return (
      <div className="card p-4 text-center text-xs text-gray-500">
        <FiBookmark size={20} className="text-gray-600 mx-auto mb-2" />
        Pinea tus mejores reels en tu perfil (máx 3) para destacarlos.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FiBookmark size={12} className="text-brand-400" />
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          Destacados ({reels.length}/3)
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {reels.map(r => (
          <Link
            key={r.id}
            to={`/reels?id=${r.id}`}
            className="relative aspect-[9/16] rounded-lg overflow-hidden bg-dark-700 group block"
          >
            {r.thumbnail_url ? (
              <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <video src={r.video_url} className="w-full h-full object-cover" muted preload="metadata" />
            )}
            {/* Overlay con stats */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-90 pointer-events-none" />
            <div className="absolute top-1.5 left-1.5">
              <FiBookmark size={12} className="text-yellow-400 fill-current drop-shadow" />
            </div>
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-2 text-white text-[10px] font-bold pointer-events-none">
              <span className="flex items-center gap-0.5">
                <FiPlay size={9} /> {fmtCompact(r.views_count)}
              </span>
              <span className="flex items-center gap-0.5">
                <FiHeart size={9} /> {fmtCompact(r.likes_count)}
              </span>
            </div>
            {isOwner && (
              <button
                onClick={(e) => handleUnpin(e, r.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Despinear"
              >
                <FiTrash2 size={10} />
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function fmtCompact(n) {
  if (!n || n < 1000) return n || 0;
  if (n < 1000000) return `${Math.floor(n / 100) / 10}k`;
  return `${Math.floor(n / 100000) / 10}M`;
}

// Botón flotante para pinear/despinear el reel actual.
// Se usa en Reels.jsx en los reels propios del user.
export function PinReelButton({ reelId, currentlyPinned, onChange }) {
  const [pinned, setPinned] = useState(!!currentlyPinned);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPinned(!!currentlyPinned); }, [currentlyPinned, reelId]);

  const toggle = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/api/reels/${reelId}/pin`);
      setPinned(data.pinned);
      onChange?.(data.pinned);
      toast.success(data.pinned ? 'Destacado en tu perfil' : 'Despinneado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
        pinned
          ? 'bg-yellow-500 text-black'
          : 'bg-black/50 backdrop-blur-sm text-white border border-white/20'
      }`}
      aria-label={pinned ? 'Despinear de perfil' : 'Pinear a perfil'}
    >
      <FiBookmark size={11} className={pinned ? 'fill-current' : ''} />
      {pinned ? 'En perfil' : 'Pinear'}
    </button>
  );
}
