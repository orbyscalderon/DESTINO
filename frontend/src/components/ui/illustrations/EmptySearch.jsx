// Empty state illustration — lupa con orbita y constelación. Para buscar sin
// resultados, filtros vacíos.
export default function EmptySearch({ size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" className="select-none">
      <defs>
        <radialGradient id="ill-search-glass" cx="40%" cy="40%" r="60%">
          <stop offset="0%"  stopColor="#f43f5e" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#d946ef" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#0a0a0f" stopOpacity="0.8" />
        </radialGradient>
        <linearGradient id="ill-search-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>

      {/* Orbits */}
      <circle cx="100" cy="100" r="85" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeDasharray="2 3" />
      <circle cx="100" cy="100" r="65" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeDasharray="2 3" />

      {/* Constelación de puntos */}
      <circle cx="40"  cy="50" r="1.5" fill="#fff" opacity="0.6" />
      <circle cx="170" cy="40" r="2" fill="#f43f5e" opacity="0.7" />
      <circle cx="180" cy="135" r="1.5" fill="#d946ef" opacity="0.6" />
      <circle cx="30"  cy="160" r="2" fill="#fda4af" opacity="0.55" />
      <circle cx="60"  cy="170" r="1" fill="#fff" opacity="0.4" />

      {/* Magnifying glass — lente */}
      <circle cx="90" cy="90" r="36"
              fill="url(#ill-search-glass)"
              stroke="url(#ill-search-ring)" strokeWidth="4"
              style={{ filter: 'drop-shadow(0 4px 20px rgba(244, 63, 94, 0.3))' }} />

      {/* Highlight de la lente */}
      <ellipse cx="78" cy="78" rx="10" ry="6" fill="#ffffff" opacity="0.18" />

      {/* Mango */}
      <rect x="116" y="116" width="32" height="8" rx="3"
            transform="rotate(45 116 116)"
            fill="url(#ill-search-ring)" />
      <rect x="116" y="116" width="32" height="8" rx="3"
            transform="rotate(45 116 116)"
            stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  );
}
