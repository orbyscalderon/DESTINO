import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Hook para navegar entre páginas con swipe horizontal estilo Instagram.
// Semántica direccional:
//   - "left"  = path destino cuando el dedo se desplaza HACIA LA IZQUIERDA
//   - "right" = path destino cuando el dedo se desplaza HACIA LA DERECHA
// (el dedo y el "viaje" van en la misma dirección — convención que pidió
//  el usuario: "desplazar a la izquierda → cámara").
//
// Criterios para evitar falsos positivos:
//   - Solo activo en mobile (< 1024px)
//   - Threshold mínimo 80px horizontal
//   - Ratio horizontal:vertical > 2 (descarta scrolls verticales)
//   - El touch start NO puede ser sobre: inputs, textareas, contenteditable,
//     elementos con [data-no-swipe]
//   - Velocidad mínima ~0.3 px/ms para que un swipe lento intencional no
//     cuente (evita conflictos con scroll lentos)
//
// Uso:
//   useSwipeNavigation({ left: '/reels/new', right: '/reels' });
//   useSwipeNavigation({ left: null, right: '/messages' });  // ya en el extremo
export function useSwipeNavigation({ left = null, right = null, threshold = 80 }) {
  const navigate = useNavigate();
  const stateRef = useRef({ x0: 0, y0: 0, t0: 0, dx: 0, dy: 0, tracking: false });

  useEffect(() => {
    // Si la página no tiene rutas a ambos lados, igual seguimos enganchados
    // (por si solo un swipe es válido).
    const s = stateRef.current;

    const isInteractive = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return true;
      if (el.isContentEditable) return true;
      // [data-no-swipe] en el elemento o cualquier ancestro
      return !!el.closest?.('[data-no-swipe]');
    };

    const onStart = (e) => {
      if (window.innerWidth >= 1024) return;
      if (e.touches.length > 1) return; // multi-touch (pinch) — no
      if (isInteractive(e.target)) return;
      const t = e.touches[0];
      s.x0 = t.clientX;
      s.y0 = t.clientY;
      s.t0 = Date.now();
      s.dx = 0;
      s.dy = 0;
      s.tracking = true;
    };

    const onMove = (e) => {
      if (!s.tracking) return;
      const t = e.touches[0];
      s.dx = t.clientX - s.x0;
      s.dy = t.clientY - s.y0;
    };

    const onEnd = () => {
      if (!s.tracking) return;
      s.tracking = false;
      const absX = Math.abs(s.dx);
      const absY = Math.abs(s.dy);
      const dt = Math.max(1, Date.now() - s.t0);
      const velocity = absX / dt;

      // Validaciones
      if (absX < threshold) return;
      if (absX < absY * 2) return;       // gesto más vertical que horizontal
      if (velocity < 0.25) return;        // demasiado lento — probablemente scroll/drag

      if (s.dx < 0 && left)  { navigate(left); }
      else if (s.dx > 0 && right) { navigate(right); }
    };

    document.addEventListener('touchstart',  onStart, { passive: true });
    document.addEventListener('touchmove',   onMove,  { passive: true });
    document.addEventListener('touchend',    onEnd);
    document.addEventListener('touchcancel', onEnd);

    return () => {
      document.removeEventListener('touchstart',  onStart);
      document.removeEventListener('touchmove',   onMove);
      document.removeEventListener('touchend',    onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [left, right, threshold, navigate]);
}
