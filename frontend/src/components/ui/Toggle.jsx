// Toggle switch reutilizable. Reemplaza el pattern inline que se repite en
// 10+ pages del v67-v73.
//
// Usa las utilities .toggle-switch / .toggle-switch-on / .toggle-thumb
// definidas en globals.css.

export default function Toggle({ on, onChange, disabled = false, size = 'md', ariaLabel }) {
  const sizes = {
    sm: 'w-9 h-5',
    md: 'w-12 h-7',
    lg: 'w-14 h-8',
  };
  const thumbSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };
  const translate = {
    sm: on ? 'translate-x-4' : '',
    md: on ? 'translate-x-5' : '',
    lg: on ? 'translate-x-6' : '',
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={`toggle-switch ${sizes[size]} ${on ? 'toggle-switch-on' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`toggle-thumb ${thumbSizes[size]} ${translate[size]}`} />
    </button>
  );
}
