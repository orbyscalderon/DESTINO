import { useEffect, useRef, useState } from 'react';

// Cuenta animadamente desde el valor previo (o desde 0 en mount) al valor actual.
// Usa requestAnimationFrame con easing out-expo.
//
// Props:
//   value:      number — destino
//   duration:   ms (default 1100)
//   decimals:   cuántos decimales mostrar (default 0)
//   format:     fn(n) => string (opcional, default localeString)
//   className:  string
//   suffix:     string opcional (ej. ' coins')

const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export default function AnimatedCounter({
  value, duration = 1100, decimals = 0,
  format, className = '', suffix = '', prefix = '',
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number(value) || 0;
    if (from === to) { setDisplay(to); return; }

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutExpo(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else prevRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = format
    ? format(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString('es');

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
