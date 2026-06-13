// Empty state illustration — caja flotante. Para vault vacío, drafts, downloads.
export default function EmptyVault({ size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" className="select-none">
      <defs>
        <linearGradient id="ill-vault-front" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#1f2937" />
          <stop offset="100%" stopColor="#111118" />
        </linearGradient>
        <linearGradient id="ill-vault-top" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#374151" />
          <stop offset="100%" stopColor="#1f2937" />
        </linearGradient>
        <linearGradient id="ill-vault-glow" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#f43f5e" stopOpacity="0" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* Floor glow */}
      <ellipse cx="100" cy="170" rx="60" ry="10" fill="#000" opacity="0.35" />

      {/* Top of box (lid open angle) */}
      <path
        d="M50 80 L100 60 L150 80 L100 100 Z"
        fill="url(#ill-vault-top)"
        stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1"
      />

      {/* Front of box */}
      <path
        d="M50 80 L100 100 L100 160 L50 140 Z"
        fill="url(#ill-vault-front)"
        stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1"
      />

      {/* Right side of box */}
      <path
        d="M150 80 L100 100 L100 160 L150 140 Z"
        fill="#0a0a0f"
        stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1"
      />

      {/* Glow inside box (saliendo del fondo) */}
      <path
        d="M50 80 L100 100 L100 160 L50 140 Z"
        fill="url(#ill-vault-glow)"
        opacity="0.5"
      />

      {/* Cinta brand de candado */}
      <rect x="75" y="50" width="50" height="14" rx="3" fill="#f43f5e" opacity="0.85" />
      <rect x="75" y="50" width="50" height="14" rx="3" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1" />

      {/* Floating sparkles */}
      <circle cx="40"  cy="50" r="2" fill="#d946ef" opacity="0.7" />
      <circle cx="160" cy="40" r="2.5" fill="#f43f5e" opacity="0.6" />
      <circle cx="170" cy="100" r="1.5" fill="#fff" opacity="0.5" />
      <circle cx="30"  cy="110" r="1.5" fill="#fff" opacity="0.4" />
    </svg>
  );
}
