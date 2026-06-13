// Empty state illustration — monedas apiladas con brillo. Para Coins vacío,
// withdrawals vacíos, sin ganancias.
export default function EmptyCoins({ size = 160 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" className="select-none">
      <defs>
        <linearGradient id="ill-coin-front" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#fbbf24" />
          <stop offset="50%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="ill-coin-side" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>

      {/* Floor shadow */}
      <ellipse cx="100" cy="170" rx="55" ry="8" fill="#000" opacity="0.4" />

      {/* Coin 1 (bottom) */}
      <ellipse cx="100" cy="155" rx="42" ry="12" fill="url(#ill-coin-side)" />
      <ellipse cx="100" cy="148" rx="42" ry="12" fill="url(#ill-coin-front)" stroke="#fff" strokeOpacity="0.15" strokeWidth="1" />

      {/* Coin 2 (middle) */}
      <ellipse cx="95" cy="135" rx="42" ry="12" fill="url(#ill-coin-side)" />
      <ellipse cx="95" cy="128" rx="42" ry="12" fill="url(#ill-coin-front)" stroke="#fff" strokeOpacity="0.15" strokeWidth="1" />

      {/* Coin 3 (top) */}
      <ellipse cx="105" cy="115" rx="42" ry="12" fill="url(#ill-coin-side)" />
      <ellipse cx="105" cy="108" rx="42" ry="12" fill="url(#ill-coin-front)" stroke="#fff" strokeOpacity="0.2" strokeWidth="1" />

      {/* Zap icon en la top coin */}
      <path
        d="M101 95 L98 108 L104 109 L99 121 L107 107 L101 106 L106 95 Z"
        fill="#ffffff"
        opacity="0.85"
      />

      {/* Sparkles */}
      <g opacity="0.7">
        <path d="M55 60 L57 64 L61 65 L57 66 L55 70 L53 66 L49 65 L53 64 Z" fill="#fbbf24" />
        <path d="M160 50 L161.5 53 L164 53.5 L161.5 54 L160 57 L158.5 54 L156 53.5 L158.5 53 Z" fill="#f43f5e" />
        <path d="M150 90 L151 92 L153 92.5 L151 93 L150 95 L149 93 L147 92.5 L149 92 Z" fill="#fff" />
      </g>
    </svg>
  );
}
