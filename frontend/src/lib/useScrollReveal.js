import { useEffect, useRef } from 'react';

// Hook para revelar elemento al entrar viewport. Aplica la clase 'revealed'
// (con la transition definida en .reveal-on-scroll de globals.css).
//
// Uso:
//   const ref = useScrollReveal();
//   return <div ref={ref} className="reveal-on-scroll">...</div>
//
// Opcional:
//   useScrollReveal({ threshold: 0.3, once: true })

export function useScrollReveal({ threshold = 0.15, once = true } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('revealed');
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('revealed');
            if (once) obs.unobserve(el);
          } else if (!once) {
            el.classList.remove('revealed');
          }
        });
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  return ref;
}
