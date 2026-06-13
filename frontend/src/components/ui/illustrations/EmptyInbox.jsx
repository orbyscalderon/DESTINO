// Empty state illustration — sobre flotante con burbujas. Para inbox vacío,
// sin mensajes, sin notificaciones.
export default function EmptyInbox({ size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" className="select-none">
      <defs>
        <linearGradient id="ill-inbox-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#1a1a2e" />
          <stop offset="100%" stopColor="#111118" />
        </linearGradient>
        <linearGradient id="ill-inbox-flap" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#374151" />
          <stop offset="100%" stopColor="#1f2937" />
        </linearGradient>
      </defs>

      {/* Burbujas flotantes en background */}
      <circle cx="55"  cy="65"  r="6" fill="#f43f5e" opacity="0.6" />
      <circle cx="155" cy="55"  r="4" fill="#d946ef" opacity="0.7" />
      <circle cx="170" cy="100" r="3" fill="#fda4af" opacity="0.5" />
      <circle cx="35"  cy="95"  r="3.5" fill="#e879f9" opacity="0.55" />

      {/* Sobre cuerpo */}
      <rect x="40" y="85" width="120" height="80" rx="6"
            fill="url(#ill-inbox-body)"
            stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />

      {/* Sobre solapa cerrada */}
      <path
        d="M40 91 L100 130 L160 91"
        fill="none"
        stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Tinta brand en la solapa */}
      <path
        d="M40 91 L100 130 L160 91 L160 110 L100 150 L40 110 Z"
        fill="url(#ill-inbox-flap)"
        opacity="0.4"
      />

      {/* Heart sello */}
      <circle cx="100" cy="100" r="11" fill="#f43f5e" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1" />
      <path
        d="M100 106 C 95 103, 92 99, 92 96 C 92 94, 94 92, 96 92 C 98 92, 100 94, 100 95 C 100 94, 102 92, 104 92 C 106 92, 108 94, 108 96 C 108 99, 105 103, 100 106 Z"
        fill="#fff"
      />

      {/* Sombra debajo */}
      <ellipse cx="100" cy="172" rx="55" ry="6" fill="#000" opacity="0.4" />
    </svg>
  );
}
