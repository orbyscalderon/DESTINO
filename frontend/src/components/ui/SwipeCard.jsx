import { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { FiHeart, FiX, FiStar, FiPlay, FiMapPin } from 'react-icons/fi';
import VerifiedBadge from './VerifiedBadge.jsx';
import { hapticImpact, hapticNotification } from '../../lib/haptics.js';
import { formatDistance } from '../../lib/geolocation.js';

export default function SwipeCard({ profile, onLike, onDislike, onSuperLike, isPremium, isOnline, compatibilityPct }) {
  const [decision, setDecision] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const dragDistanceRef = useRef(0);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const likeOpacity = useTransform(x, [20, 100], [0, 1]);
  const dislikeOpacity = useTransform(x, [-100, -20], [1, 0]);
  const cardOpacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

  const avatarUrl = profile.avatar_url
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name)}&size=400&background=1a1a2e&color=f43f5e`;

  const allPhotos = [avatarUrl, ...(profile.photos || []).map(p => p.url)];
  const profileVideoUrl = profile.profile_video_url || profile.intro_video_url || null;

  const handleDragStart = () => { dragDistanceRef.current = 0; };

  const handleDragEnd = (_, info) => {
    dragDistanceRef.current = Math.abs(info.offset.x);
    if (info.offset.x > 100) triggerLike();
    else if (info.offset.x < -100) triggerDislike();
  };

  const handlePhotoTap = (e) => {
    if (dragDistanceRef.current > 10) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width * 0.35) {
      setPhotoIndex(i => Math.max(i - 1, 0));
    } else if (relX > rect.width * 0.65) {
      setPhotoIndex(i => Math.min(i + 1, allPhotos.length - 1));
    }
  };

  const triggerLike = () => {
    hapticNotification('Success');
    setDecision('like');
    setTimeout(() => onLike(profile.id), 400);
  };

  const triggerDislike = () => {
    hapticImpact('Light');
    setDecision('dislike');
    setTimeout(() => onDislike(profile.id), 400);
  };

  const triggerSuperLike = () => {
    hapticNotification('Success');
    setDecision('superlike');
    setTimeout(() => onSuperLike(profile.id), 400);
  };

  return (
    <motion.div
      className="relative w-full max-w-sm mx-auto cursor-grab active:cursor-grabbing select-none"
      style={{ x, rotate, opacity: cardOpacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      animate={
        decision === 'like'
          ? { x: 500, rotate: 20, opacity: 0 }
          : decision === 'dislike'
          ? { x: -500, rotate: -20, opacity: 0 }
          : decision === 'superlike'
          ? { y: -500, opacity: 0 }
          : {}
      }
      transition={{ duration: 0.4 }}
    >
      <div
        className="relative h-[520px] rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
        onClick={handlePhotoTap}
      >
        {showVideo && profileVideoUrl ? (
          <video
            src={profileVideoUrl}
            autoPlay
            loop
            muted={false}
            playsInline
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <img
            src={allPhotos[photoIndex]}
            alt={profile.full_name}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        )}

        {/* Photo strip indicator */}
        {allPhotos.length > 1 && (
          <div className="absolute top-3 left-3 right-3 flex gap-1 z-10 pointer-events-none">
            {allPhotos.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full transition-all duration-200 ${
                  i === photoIndex ? 'bg-white' : 'bg-white/35'
                }`}
              />
            ))}
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Swipe indicators */}
        <motion.div
          className="absolute top-8 left-8 bg-green-500 text-white font-black text-2xl px-4 py-2 rounded-xl border-4 border-green-400 rotate-[-15deg] pointer-events-none"
          style={{ opacity: likeOpacity }}
        >
          LIKE
        </motion.div>
        <motion.div
          className="absolute top-8 right-8 bg-brand-500 text-white font-black text-2xl px-4 py-2 rounded-xl border-4 border-brand-400 rotate-[15deg] pointer-events-none"
          style={{ opacity: dislikeOpacity }}
        >
          NOPE
        </motion.div>
        {decision === 'superlike' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-blue-500 text-white font-black text-3xl px-6 py-3 rounded-2xl border-4 border-blue-300">
              ⭐ SUPER
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto z-10">
          {profileVideoUrl && (
            <button
              onClick={e => { e.stopPropagation(); setShowVideo(v => !v); }}
              title={showVideo ? 'Ver foto' : 'Ver video intro'}
              className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm hover:bg-black/80 transition-colors"
            >
              <FiPlay size={10} /> {showVideo ? 'Foto' : 'Video'}
            </button>
          )}
          {profile.boosted_until && new Date(profile.boosted_until) > new Date() && (
            <span className="bg-brand-500/90 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
              ⚡ Destacado
            </span>
          )}
          {profile.is_premium && (
            <span className="bg-yellow-500/90 text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
              <FiStar size={10} /> PREMIUM
            </span>
          )}
          {profile.is_verified && <VerifiedBadge size={18} />}
        </div>

        {/* Compatibility badge */}
        {compatibilityPct > 0 && (
          <div className="absolute top-4 left-4 pointer-events-none">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
              compatibilityPct >= 70
                ? 'bg-green-500/90 text-white'
                : compatibilityPct >= 40
                ? 'bg-yellow-500/90 text-black'
                : 'bg-white/20 text-white'
            }`}>
              {compatibilityPct}% compatible
            </span>
          </div>
        )}

        {/* Profile info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                {profile.full_name}, <span className="font-light">{profile.age}</span>
                {isOnline && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)] flex-shrink-0" />
                )}
              </h2>
              {profile.distance_km != null && (
                <p className="text-gray-300 text-xs mt-0.5 flex items-center gap-1">
                  <FiMapPin size={11} /> {formatDistance(profile.distance_km)}
                </p>
              )}
              {profile.bio && (
                <p className="text-gray-300 text-sm mt-1 line-clamp-2">{profile.bio}</p>
              )}
            </div>
            {allPhotos.length > 1 && (
              <span className="text-white/60 text-xs mb-1 shrink-0 ml-2">
                {photoIndex + 1}/{allPhotos.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <button
          onClick={triggerDislike}
          className="w-16 h-16 rounded-full bg-dark-700 border border-white/10 flex items-center justify-center
                     text-brand-500 text-2xl transition-all hover:bg-brand-500 hover:text-white hover:scale-110 active:scale-95"
        >
          <FiX />
        </button>

        {/* Super Like — solo Premium */}
        <button
          onClick={isPremium ? triggerSuperLike : undefined}
          title={isPremium ? 'Super Like' : 'Super Like (Premium)'}
          className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl transition-all active:scale-95 ${
            isPremium
              ? 'bg-dark-700 border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white hover:scale-110'
              : 'bg-dark-800 border-white/5 text-gray-700 cursor-not-allowed'
          }`}
        >
          <FiStar size={18} />
        </button>

        <button
          onClick={triggerLike}
          className="w-16 h-16 rounded-full bg-dark-700 border border-white/10 flex items-center justify-center
                     text-green-500 text-2xl transition-all hover:bg-green-500 hover:text-white hover:scale-110 active:scale-95"
        >
          <FiHeart />
        </button>
      </div>
    </motion.div>
  );
}
