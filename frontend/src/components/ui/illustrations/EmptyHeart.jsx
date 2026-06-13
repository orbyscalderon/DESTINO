// Empty state illustration — corazón orbital. Para Discover sin más perfiles,
// Matches vacío, sin likes.
export default function EmptyHeart({ size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" className="select-none">
      <defs>
        <linearGradient id="ill-heart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f43f5e" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#d946ef" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="ill-heart-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f43f5e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Glow base */}
      <circle cx="100" cy="100" r="80" fill="url(#ill-heart-glow)" />

      {/* Orbits */}
      <ellipse cx="100" cy="100" rx="72" ry="38" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <ellipse cx="100" cy="100" rx="38" ry="72" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />

      {/* Heart shape (custom path) */}
      <path
        d="M100 145
           C 70 125, 45 105, 45 80
           C 45 65, 58 55, 72 55
           C 82 55, 92 60, 100 70
           C 108 60, 118 55, 128 55
           C 142 55, 155 65, 155 80
           C 155 105, 130 125, 100 145 Z"
        fill="url(#ill-heart-grad)"
        style={{ filter: 'drop-shadow(0 6px 24px rgba(244, 63, 94, 0.45))' }}
      />

      {/* Small orbital dots */}
      <circle cx="172" cy="100" r="3" fill="#f43f5e" />
      <circle cx="28"  cy="100" r="2.5" fill="#d946ef" />
      <circle cx="100" cy="28"  r="2" fill="#fff" opacity="0.6" />
      <circle cx="100" cy="172" r="2.5" fill="#fda4af" />
    </svg>
  );
}
