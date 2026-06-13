// Skeleton screens forma-específica por tipo de contenido. Cada uno matchea
// el layout exacto del componente final, eliminando layout shift al cargar.
//
// Patrón: shimmer es la utility `.skeleton` (globals.css) que ya tiene el
// shimmer animation. Acá solo combinamos en formas específicas.

import { motion } from 'framer-motion';

const stagger = (i = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.04, duration: 0.35, ease: [0.19, 1, 0.22, 1] },
});

// ── Match row (Messages list) ──────────────────────────────────────────────
export function SkeletonMatchRow({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="flex items-center gap-3.5 px-2 py-3">
      <div className="skeleton w-14 h-14 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 rounded w-1/2" />
        <div className="skeleton h-3 rounded w-2/3" />
      </div>
      <div className="skeleton w-10 h-3 rounded" />
    </motion.div>
  );
}

// ── Profile card horizontal (Top Fans, Leaderboard) ────────────────────────
export function SkeletonStatRow({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="card-form flex items-center gap-3">
      <div className="skeleton w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 rounded w-1/3" />
        <div className="skeleton h-3 rounded w-2/3" />
      </div>
      <div className="skeleton w-16 h-6 rounded" />
    </motion.div>
  );
}

// ── Video card (Reels feed, ExploreVideo, ContinueWatching) ────────────────
export function SkeletonVideoCard({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="card-form p-0 overflow-hidden">
      <div className="skeleton aspect-video w-full" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-3.5 rounded w-3/4" />
        <div className="skeleton h-2.5 rounded w-1/3" />
      </div>
    </motion.div>
  );
}

// ── Photo collection thumbnail (vault, collections) ────────────────────────
export function SkeletonPhotoTile({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="card-form p-0 overflow-hidden">
      <div className="skeleton aspect-square w-full" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-3 rounded w-2/3" />
        <div className="skeleton h-2.5 rounded w-1/3" />
      </div>
    </motion.div>
  );
}

// ── Stats grid (CreatorDashboard, TransparencyReport) ──────────────────────
export function SkeletonStatCard({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="rounded-2xl border border-white/5 p-4 bg-white/[0.02] space-y-2">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 rounded w-1/2" />
        <div className="skeleton w-4 h-4 rounded" />
      </div>
      <div className="skeleton h-7 rounded w-2/3 mt-1" />
    </motion.div>
  );
}

// ── Comment row (VideoCommentsSection) ─────────────────────────────────────
export function SkeletonComment({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="flex gap-3 py-2">
      <div className="skeleton w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 rounded w-1/4" />
        <div className="skeleton h-3 rounded w-full" />
        <div className="skeleton h-3 rounded w-3/4" />
      </div>
    </motion.div>
  );
}

// ── Notification row ───────────────────────────────────────────────────────
export function SkeletonNotification({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="flex gap-3 p-3">
      <div className="skeleton w-9 h-9 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 rounded w-3/4" />
        <div className="skeleton h-2.5 rounded w-1/3" />
      </div>
    </motion.div>
  );
}

// ── Show card (Live shows) ─────────────────────────────────────────────────
export function SkeletonShowCard({ i = 0 }) {
  return (
    <motion.div {...stagger(i)} className="card-form p-0 overflow-hidden">
      <div className="skeleton aspect-[16/10] w-full relative">
        <div className="absolute top-2 left-2 w-12 h-5 skeleton rounded-md" />
        <div className="absolute bottom-2 left-2 w-20 h-3 skeleton rounded" />
      </div>
      <div className="p-3 space-y-2">
        <div className="skeleton h-3.5 rounded w-2/3" />
        <div className="skeleton h-2.5 rounded w-1/3" />
      </div>
    </motion.div>
  );
}

// Helper para generar arrays de skeletons rápido
export function SkeletonList({ count = 6, Component, ...props }) {
  return Array.from({ length: count }).map((_, i) => (
    <Component key={i} i={i} {...props} />
  ));
}
