/**
 * Badge azul de verificación (estilo Twitter/Instagram).
 * Props:
 *   size      — diámetro en px (default 16)
 *   overlay   — true → posicionado absolute bottom-right sobre un avatar
 *   className — clases adicionales
 */
export default function VerifiedBadge({ size = 16, overlay = false, className = '' }) {
  const base = `inline-flex items-center justify-center rounded-full bg-blue-500 text-white shrink-0 select-none`;
  const overlayClass = overlay
    ? 'absolute -bottom-1 -right-1 border-2 border-dark-900'
    : '';

  return (
    <span
      className={`${base} ${overlayClass} ${className}`}
      style={{ width: size, height: size }}
      title="Verificado"
      aria-label="Cuenta verificada"
    >
      <svg
        viewBox="0 0 12 12"
        fill="none"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        <path
          d="M2 6.5L4.5 9L10 3"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
