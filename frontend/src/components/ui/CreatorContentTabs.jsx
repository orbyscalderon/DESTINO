import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiLock, FiPlay, FiZap, FiGrid, FiImage, FiFilm, FiHeart,
  FiMessageCircle, FiVideo, FiCalendar, FiUnlock, FiTrendingUp,
} from 'react-icons/fi';
import api from '../../lib/api.js';
import WatermarkLayer from './WatermarkLayer.jsx';

// Vista tipo OnlyFans del contenido del creador con tabs prominentes.
// Cualquier item de pago se ve como tarjeta visual con CTA "Desbloquear $X"
// directo, sin necesidad de matchear o suscribirse.
//
// Props:
//   creatorId, creatorName, isOwnProfile, subscribed,
//   paidPhotos, freePhotos, videos, galleries, userPosts, shows,
//   onBuyPhoto, buyingPhoto,
//   onBuyVideo, buyingVideo,
//   onOpenGallery, loadingGallery,
//   onSubscribe (callback para abrir TierPicker modal)
export default function CreatorContentTabs({
  creatorId, creatorName, isOwnProfile = false, subscribed = false,
  paidPhotos = [], freePhotos = [], videos = [], galleries = [],
  userPosts = [], shows = [],
  onBuyPhoto, buyingPhoto,
  onBuyVideo, buyingVideo,
  onOpenGallery, loadingGallery,
  onSubscribe,
}) {
  const allPhotos = [...freePhotos, ...paidPhotos];
  const feedItems = buildFeed({ userPosts, paidPhotos, videos });
  const lockedPosts = userPosts.filter(p => p.locked || p.blurred);
  const showLiveOrUpcoming = shows.filter(s => s.status === 'live' || s.status === 'scheduled');

  // Reels del creador — carga perezosa cuando se abre el tab
  const [reels, setReels] = useState([]);
  const [reelsLoaded, setReelsLoaded] = useState(false);
  const [reelsCount, setReelsCount] = useState(null);

  // Lookup inicial del count para decidir si mostrar el tab
  useEffect(() => {
    let cancel = false;
    api.get(`/api/reels/user/${creatorId}?limit=30`)
      .then(({ data }) => {
        if (cancel) return;
        const list = data.reels || [];
        setReels(list);
        setReelsCount(list.length);
        setReelsLoaded(true);
      })
      .catch(() => { if (!cancel) setReelsCount(0); });
    return () => { cancel = true; };
  }, [creatorId]);

  // Tabs disponibles dinámicamente: si no hay contenido en una categoría, se oculta
  const tabs = [
    { id: 'feed',      label: 'Feed',     icon: FiGrid,           count: feedItems.length },
    { id: 'reels',     label: 'Reels',    icon: FiTrendingUp,     count: reelsCount ?? 0 },
    { id: 'photos',    label: 'Fotos',    icon: FiImage,          count: allPhotos.length },
    { id: 'videos',    label: 'Videos',   icon: FiFilm,           count: videos.length },
    { id: 'galleries', label: 'Galerías', icon: FiUnlock,         count: galleries.length },
    { id: 'shows',     label: 'Shows',    icon: FiVideo,          count: showLiveOrUpcoming.length },
  ].filter(t => t.count > 0 || t.id === 'feed');

  const [active, setActive] = useState(tabs[0]?.id || 'feed');

  if (tabs.length === 0 || (tabs.length === 1 && feedItems.length === 0)) {
    return isOwnProfile ? null : (
      <div className="card p-8 text-center">
        <FiGrid className="text-gray-700 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">Este creador aún no tiene contenido publicado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs sticky */}
      <div className="sticky top-0 z-20 -mx-5 px-5 py-2 glass border-b border-white/5 lg:static lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:p-0 lg:mx-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ease-out-expo active:scale-95 ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow-sm'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <Icon size={13} />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20' : 'bg-dark-900/40'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido del tab activo */}
      {active === 'feed' && (
        <FeedView
          items={feedItems}
          subscribed={subscribed}
          onBuyPhoto={onBuyPhoto}
          buyingPhoto={buyingPhoto}
          onBuyVideo={onBuyVideo}
          buyingVideo={buyingVideo}
          onSubscribe={onSubscribe}
          isOwnProfile={isOwnProfile}
        />
      )}
      {active === 'photos' && (
        <PhotosGrid
          paidPhotos={paidPhotos}
          freePhotos={freePhotos}
          onBuyPhoto={onBuyPhoto}
          buyingPhoto={buyingPhoto}
        />
      )}
      {active === 'videos' && (
        <VideosGrid videos={videos} onBuyVideo={onBuyVideo} buyingVideo={buyingVideo} />
      )}
      {active === 'galleries' && (
        <GalleriesGrid galleries={galleries} onOpen={onOpenGallery} loadingId={loadingGallery} />
      )}
      {active === 'shows' && (
        <ShowsList shows={showLiveOrUpcoming} />
      )}
      {active === 'reels' && (
        <ReelsGrid reels={reels} loaded={reelsLoaded} />
      )}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

function buildFeed({ userPosts, paidPhotos, videos }) {
  // Mezcla momentos + fotos pagas + videos en orden cronológico inverso
  // Cada item lleva un `_kind` para saber cómo renderizarlo
  const items = [];
  userPosts.forEach(p => items.push({ ...p, _kind: 'post', _date: new Date(p.created_at).getTime() }));
  paidPhotos.forEach(p => items.push({ ...p, _kind: 'paid_photo', _date: new Date(p.created_at || 0).getTime() }));
  videos.forEach(v => items.push({ ...v, _kind: 'video', _date: new Date(v.created_at || 0).getTime() }));
  return items.sort((a, b) => b._date - a._date);
}

// ─── FEED VIEW (cards estilo Instagram/OnlyFans) ──────────────────────

function FeedView({ items, subscribed, onBuyPhoto, buyingPhoto, onBuyVideo, buyingVideo, onSubscribe, isOwnProfile }) {
  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <FiGrid className="text-gray-700 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">
          {isOwnProfile ? 'Publica fotos, videos o posts para llenar tu feed' : 'Aún no hay publicaciones'}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {items.map(item => {
        if (item._kind === 'post') return <PostCard key={`p-${item.id}`} post={item} subscribed={subscribed} onSubscribe={onSubscribe} />;
        if (item._kind === 'paid_photo') return <PaidPhotoCard key={`ph-${item.id}`} photo={item} onBuy={onBuyPhoto} buying={buyingPhoto === item.id} />;
        if (item._kind === 'video') return <VideoCard key={`v-${item.id}`} video={item} onBuy={onBuyVideo} buying={buyingVideo === item.id} />;
        return null;
      })}
    </div>
  );
}

function PostCard({ post, subscribed, onSubscribe }) {
  const isLocked = post.locked || post.blurred;
  return (
    <div className="card overflow-hidden p-0">
      {post.media_url && !isLocked ? (
        post.media_type === 'video' ? (
          <video src={post.media_url} className="w-full aspect-square object-cover bg-black" controls preload="metadata" />
        ) : (
          <img src={post.media_url} alt="" className="w-full aspect-square object-cover" loading="lazy" />
        )
      ) : isLocked ? (
        <div className="relative aspect-square bg-gradient-to-br from-brand-900/40 to-dark-700 flex items-center justify-center">
          {post.media_url && (
            <img src={post.media_url} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-60" />
          )}
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FiLock className="text-white" size={32} />
            <p className="text-white font-bold text-base">Contenido exclusivo</p>
            <p className="text-gray-300 text-xs max-w-xs">Suscríbete para ver este post y todo el contenido bloqueado</p>
            {!subscribed && onSubscribe && (
              <button
                onClick={onSubscribe}
                className="mt-2 bg-gradient-to-r from-brand-500 to-accent-500 hover:from-brand-400 hover:to-accent-400 text-white text-sm font-bold px-5 py-2 rounded-full transition-all duration-200 ease-out-expo shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:scale-95"
              >
                Suscribirse
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="p-4 space-y-2">
        {post.caption && !isLocked && (
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{post.caption}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {post.likes_count > 0 && (
            <span className="flex items-center gap-1">
              <FiHeart className="text-pink-400" size={12} />
              {post.likes_count}
            </span>
          )}
          {post.comments_count > 0 && (
            <span className="flex items-center gap-1">
              <FiMessageCircle size={12} />
              {post.comments_count}
            </span>
          )}
          <span className="ml-auto">{timeAgo(post.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function PaidPhotoCard({ photo, onBuy, buying }) {
  const unlocked = !!photo.url || photo.is_purchased;
  return (
    <div className="card overflow-hidden p-0">
      <div
        className="relative aspect-[4/5] bg-dark-700"
        onContextMenu={(e) => unlocked && e.preventDefault()}
      >
        {unlocked && photo.url ? (
          <>
            <img
              src={photo.url}
              alt=""
              className="w-full h-full object-cover select-none"
              draggable={false}
              loading="lazy"
            />
            <WatermarkLayer variant="visible" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-brand-900/30 to-dark-800" />
            <div className="absolute inset-0 backdrop-blur-3xl bg-dark-800/40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
              <FiLock className="text-brand-400" size={36} />
              <p className="text-white font-bold text-lg">Foto exclusiva</p>
              <button
                onClick={() => onBuy?.(photo)}
                disabled={buying}
                className="mt-1 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold px-6 py-2.5 rounded-full transition-all duration-200 ease-out-expo disabled:opacity-60 shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:scale-95"
              >
                {buying ? 'Procesando...' : `Desbloquear · $${photo.price}`}
              </button>
            </div>
          </>
        )}
        <div className="absolute top-3 left-3">
          <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <FiLock size={9} /> Foto de pago
          </span>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video, onBuy, buying }) {
  const unlocked = !!video.url;
  return (
    <div className="card overflow-hidden p-0">
      <div
        className="relative aspect-video bg-black"
        onContextMenu={(e) => unlocked && e.preventDefault()}
      >
        {unlocked ? (
          <>
            <video
              src={video.url}
              className="w-full h-full object-cover"
              controls
              controlsList="nodownload"
              disablePictureInPicture
              preload="metadata"
            />
            <WatermarkLayer variant="visible" />
          </>
        ) : (
          <>
            {video.thumbnail_url && (
              <img src={video.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-50" />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 to-dark-900/80" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-14 h-14 bg-white/15 backdrop-blur-md rounded-full flex items-center justify-center">
                <FiPlay className="text-white ml-1" size={24} />
              </div>
              <p className="text-white font-bold">{video.title || 'Video exclusivo'}</p>
              <button
                onClick={() => onBuy?.(video)}
                disabled={buying}
                className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold px-6 py-2 rounded-full transition-all duration-200 ease-out-expo disabled:opacity-60 flex items-center gap-2 shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:scale-95"
              >
                <FiZap size={14} />
                {buying ? 'Procesando...' : `${video.price} coins`}
              </button>
            </div>
          </>
        )}
        <div className="absolute top-3 left-3">
          <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <FiFilm size={9} /> Video
          </span>
        </div>
      </div>
      {video.title && unlocked && (
        <div className="p-3">
          <p className="text-white text-sm font-medium">{video.title}</p>
        </div>
      )}
    </div>
  );
}

// ─── PHOTOS GRID (3 columnas) ─────────────────────────────────────────

function PhotosGrid({ paidPhotos, freePhotos, onBuyPhoto, buyingPhoto }) {
  if (paidPhotos.length === 0 && freePhotos.length === 0) {
    return <EmptyMsg icon={FiImage} text="Sin fotos publicadas" />;
  }
  // Ordenar: pagadas primero, luego gratis (más visuales)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {paidPhotos.map(photo => {
        const unlocked = !!photo.url || photo.is_purchased;
        return (
          <div key={`pp-${photo.id}`} className="relative aspect-square rounded-xl overflow-hidden bg-dark-700">
            {unlocked && photo.url ? (
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 to-dark-800" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
                  <FiLock className="text-brand-400" size={20} />
                  <p className="text-white text-xs font-bold">${photo.price}</p>
                  <button
                    onClick={() => onBuyPhoto?.(photo)}
                    disabled={buyingPhoto === photo.id}
                    className="text-[10px] bg-brand-500 hover:bg-brand-400 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {buyingPhoto === photo.id ? '...' : 'Desbloquear'}
                  </button>
                </div>
              </>
            )}
            <div className="absolute top-1.5 right-1.5">
              <span className="bg-brand-500/80 backdrop-blur-md text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">PAGO</span>
            </div>
          </div>
        );
      })}
      {freePhotos.map(photo => (
        <div key={`fp-${photo.id}`} className="aspect-square rounded-xl overflow-hidden bg-dark-700">
          <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

// ─── VIDEOS GRID (1 columna en mobile, 2 en desktop) ──────────────────

function VideosGrid({ videos, onBuyVideo, buyingVideo }) {
  if (videos.length === 0) return <EmptyMsg icon={FiFilm} text="Sin videos publicados" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {videos.map(vid => (
        <VideoCard key={vid.id} video={vid} onBuy={onBuyVideo} buying={buyingVideo === vid.id} />
      ))}
    </div>
  );
}

// ─── GALLERIES GRID ───────────────────────────────────────────────────

function GalleriesGrid({ galleries, onOpen, loadingId }) {
  if (galleries.length === 0) return <EmptyMsg icon={FiUnlock} text="Sin galerías" />;
  return (
    <div className="grid grid-cols-2 gap-3">
      {galleries.map(gallery => (
        <button
          key={gallery.id}
          onClick={() => onOpen?.(gallery)}
          disabled={loadingId === gallery.id}
          className="relative rounded-2xl overflow-hidden bg-dark-700 aspect-[3/2] text-left hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {gallery.cover_url ? (
            <img src={gallery.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-dark-600">
              <FiImage className="text-gray-600" size={24} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
          {!gallery.unlocked && (
            <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
              <FiLock size={12} className="text-white" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white text-sm font-bold truncate">{gallery.title}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-300 text-[11px]">{gallery.items_count} items</span>
              {!gallery.unlocked && gallery.price_coins > 0 && (
                <span className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <FiZap size={9} /> {gallery.price_coins}
                </span>
              )}
            </div>
          </div>
          {loadingId === gallery.id && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── SHOWS LIST ───────────────────────────────────────────────────────

function ShowsList({ shows }) {
  if (shows.length === 0) return <EmptyMsg icon={FiVideo} text="Sin shows programados" />;
  return (
    <div className="space-y-2">
      {shows.map(show => {
        const isLive = show.status === 'live';
        return (
          <Link
            key={show.id}
            to={`/show/${show.id}`}
            className="card p-3 flex items-center gap-3 hover:bg-dark-800 transition-colors"
          >
            <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-dark-700 shrink-0">
              {show.cover_url ? (
                <img src={show.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FiVideo className="text-gray-600" size={24} />
                </div>
              )}
              {isLive && (
                <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                  <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">{show.title}</p>
              <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1.5">
                <FiCalendar size={10} />
                {isLive ? 'En vivo ahora' : new Date(show.scheduled_at).toLocaleString('es', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>
              {show.ticket_price > 0 && (
                <span className="inline-block mt-1.5 text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-medium">
                  ${show.ticket_price} entrada
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── REELS GRID ───────────────────────────────────────────────────────

function ReelsGrid({ reels, loaded }) {
  if (!loaded) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (reels.length === 0) return <EmptyMsg icon={FiTrendingUp} text="Sin reels publicados" />;
  return (
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
  );
}

function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function EmptyMsg({ icon: Icon, text }) {
  return (
    <div className="card p-8 text-center">
      <Icon className="text-gray-700 mx-auto mb-3" size={28} />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
