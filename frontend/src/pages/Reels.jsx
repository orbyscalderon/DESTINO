import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiInbox, FiHash, FiX } from 'react-icons/fi';
import ReelCard from '../components/ui/ReelCard.jsx';
import ReelComments from '../components/ui/ReelComments.jsx';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

// Feed de Reels estilo TikTok. Scroll vertical full-screen con snap.
// Cada card es un reel; el activo se reproduce, el resto pausan.
// Carga infinita cuando se acerca al final.
export default function Reels() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialReelId = searchParams.get('id'); // deep link a un reel específico
  const hashtagFilter = (searchParams.get('tag') || '').toLowerCase().trim() || null;
  const tab = searchParams.get('tab') === 'following' ? 'following' : 'foryou';

  const setTab = (newTab) => {
    const next = new URLSearchParams(searchParams);
    if (newTab === 'foryou') next.delete('tab');
    else next.set('tab', newTab);
    setSearchParams(next);
  };

  // Patrón Instagram: Reels NO usa swipe horizontal — el feed es full-screen
  // con scroll vertical snap. El user vuelve a Inicio con el botón del navbar.

  const containerRef = useRef(null);
  const [reels, setReels] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true); // empezar muteado (autoplay policies)
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentsReelId, setCommentsReelId] = useState(null);
  const cursorRef = useRef(null);
  const viewTrackQueueRef = useRef(new Map()); // reelId → watched_seconds

  // Cargar primer batch
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setReels([]);
    setActiveIndex(0);
    cursorRef.current = null;

    const params = new URLSearchParams({ limit: '10' });
    if (hashtagFilter) params.set('tag', hashtagFilter);
    if (tab !== 'foryou') params.set('tab', tab);

    api.get(`/api/reels/feed?${params}`)
      .then(({ data }) => {
        if (cancel) return;
        let initial = data.reels || [];
        // Si vienen con deep link, asegurar que ese reel sea el primero
        if (initialReelId && !hashtagFilter) {
          const idx = initial.findIndex(r => r.id === initialReelId);
          if (idx > 0) {
            const target = initial.splice(idx, 1)[0];
            initial = [target, ...initial];
          }
        }
        setReels(initial);
        cursorRef.current = data.next_cursor;
        setHasMore(data.next_cursor !== null);
        // Scroll al top cuando cambia el filtro
        if (containerRef.current) containerRef.current.scrollTop = 0;
      })
      .catch(err => {
        if (cancel) return;
        if (err?.response?.status !== 401) {
          toast.error('No se pudo cargar el feed');
        }
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [initialReelId, hashtagFilter, tab]);

  const clearHashtag = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tag');
    setSearchParams(next);
  };

  // Detectar el reel activo según scroll position
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onScroll = () => {
      const idx = Math.round(c.scrollTop / window.innerHeight);
      if (idx !== activeIndex) setActiveIndex(idx);
      // Cargar más si estamos cerca del final
      if (idx >= reels.length - 3 && hasMore && !loadingMore) loadMore();
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, [activeIndex, reels.length, hasMore, loadingMore]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: '10' });
      if (cursorRef.current != null) params.set('cursor', String(cursorRef.current));
      if (hashtagFilter) params.set('tag', hashtagFilter);
      if (tab !== 'foryou') params.set('tab', tab);
      const { data } = await api.get(`/api/reels/feed?${params}`);
      const newReels = data.reels || [];
      setReels(prev => {
        const seen = new Set(prev.map(r => r.id));
        return [...prev, ...newReels.filter(r => !seen.has(r.id))];
      });
      cursorRef.current = data.next_cursor;
      if (data.next_cursor === null || newReels.length === 0) setHasMore(false);
    } catch {
      // silencio — el user puede seguir mirando lo que ya cargó
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, hashtagFilter, tab]);

  // Flush tracking al desmontar / cambio de página
  const handleViewTracked = useCallback((reelId, watchedSeconds) => {
    if (watchedSeconds < 1) return; // ignorar saltos
    viewTrackQueueRef.current.set(reelId, watchedSeconds);
    api.post(`/api/reels/${reelId}/view`, { watched_seconds: watchedSeconds }).catch(() => {});
  }, []);

  // Flush al salir
  useEffect(() => () => {
    for (const [reelId, ws] of viewTrackQueueRef.current) {
      api.post(`/api/reels/${reelId}/view`, { watched_seconds: ws }).catch(() => {});
    }
  }, []);

  // ── Empty / loading ──
  if (loading) {
    return (
      <div className="h-screen [@supports(height:100dvh)]:h-[100dvh] w-full bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reels.length === 0) {
    const isFollowing = tab === 'following';
    return (
      <div className="h-screen [@supports(height:100dvh)]:h-[100dvh] w-full bg-black flex flex-col items-center justify-center px-6 text-center text-white">
        <FiInbox size={48} className="text-gray-600 mb-3" />
        <h2 className="text-xl font-bold mb-1">
          {isFollowing ? 'Sin reels de tus seguidos' : hashtagFilter ? 'Sin reels con ese tag' : 'Sin reels aún'}
        </h2>
        <p className="text-gray-400 text-sm mb-6 max-w-xs">
          {isFollowing
            ? 'Sigue creadores para ver sus reels aquí.'
            : hashtagFilter
              ? `Nadie ha publicado con #${hashtagFilter} aún. Sé el primero.`
              : 'Sé el primero en publicar. Sube un video corto vertical y atrae fans.'}
        </p>
        <div className="flex gap-2">
          {isFollowing ? (
            <button
              onClick={() => setTab('foryou')}
              className="bg-gradient-to-r from-brand-500 to-pink-500 text-white font-bold px-5 py-2.5 rounded-xl"
            >
              Ver Para ti
            </button>
          ) : (
            <button
              onClick={() => navigate('/reels/new')}
              className="bg-gradient-to-r from-brand-500 to-pink-500 text-white font-bold px-5 py-2.5 rounded-xl flex items-center gap-2"
            >
              <FiPlus size={16} /> Subir reel
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            className="bg-dark-700 text-gray-300 font-medium px-5 py-2.5 rounded-xl"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen [@supports(height:100dvh)]:h-[100dvh] w-full bg-black overflow-hidden">
      {/* Topbar */}
      <div className="absolute top-0 left-0 right-0 z-20 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
        >
          <FiArrowLeft size={18} />
        </button>
        {hashtagFilter ? (
          <button
            onClick={clearHashtag}
            className="flex items-center gap-1.5 bg-brand-500/90 backdrop-blur-md text-white text-sm font-bold px-3 py-1.5 rounded-full hover:bg-brand-500 transition-colors"
            aria-label={`Quitar filtro #${hashtagFilter}`}
          >
            <FiHash size={14} />
            {hashtagFilter}
            <FiX size={14} className="ml-0.5" />
          </button>
        ) : (
          // Tabs Para ti / Siguiendo estilo IG
          <div className="flex items-center gap-4 text-white">
            <button
              onClick={() => setTab('following')}
              className={`relative font-bold text-sm transition-opacity ${tab === 'following' ? 'opacity-100' : 'opacity-60'}`}
            >
              Siguiendo
              {tab === 'following' && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </button>
            <span className="w-px h-3 bg-white/20" />
            <button
              onClick={() => setTab('foryou')}
              className={`relative font-bold text-sm transition-opacity ${tab === 'foryou' ? 'opacity-100' : 'opacity-60'}`}
            >
              Para ti
              {tab === 'foryou' && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </button>
          </div>
        )}
        <button
          onClick={() => navigate('/reels/new')}
          aria-label="Subir reel"
          className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center text-white"
        >
          <FiPlus size={18} />
        </button>
      </div>

      {/* Feed scrolleable con snap.
          touch-action: pan-y evita conflictos con swipe horizontal del navbar. */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-none"
        style={{ scrollSnapType: 'y mandatory', touchAction: 'pan-y' }}
      >
        {reels.map((reel, i) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            active={i === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted(m => !m)}
            onViewTracked={handleViewTracked}
            onOpenComments={(reelId) => setCommentsReelId(reelId)}
            onCommentDelta={(delta) => {
              setReels(prev => prev.map(r =>
                r.id === reel.id ? { ...r, comments_count: Math.max(0, (r.comments_count || 0) + delta) } : r
              ));
            }}
          />
        ))}
        {loadingMore && (
          <div className="h-20 flex items-center justify-center bg-black">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Comments drawer */}
      <ReelComments
        reelId={commentsReelId}
        reelOwnerId={reels.find(r => r.id === commentsReelId)?.user?.id}
        onClose={() => setCommentsReelId(null)}
        onCommentAdded={(delta) => {
          setReels(prev => prev.map(r =>
            r.id === commentsReelId
              ? { ...r, comments_count: Math.max(0, (r.comments_count || 0) + delta) }
              : r
          ));
        }}
      />
    </div>
  );
}
