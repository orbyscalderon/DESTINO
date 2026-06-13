import { useEffect, useRef } from 'react';

// Focus trap para modales: una vez activo, Tab/Shift+Tab queda contenido
// dentro del contenedor referenciado. Restaura el foco al elemento previo
// cuando se desactiva. Soporta Escape para cerrar (callback opcional).
//
// Uso:
//   const ref = useFocusTrap(open, { onEscape: () => setOpen(false) });
//   return <div ref={ref}>...</div>;
//
// Opciones:
//   onEscape    — handler cuando se presiona Esc
//   autoFocus   — si true (default), enfoca el primer elemento al activarse
//   returnFocus — si true (default), restaura el foco previo al desactivarse

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

export function useFocusTrap(active, { onEscape, autoFocus = true, returnFocus = true } = {}) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current = document.activeElement;

    if (autoFocus) {
      const focusables = container.querySelectorAll(FOCUSABLE);
      const first = focusables[0];
      if (first) first.focus();
      else container.setAttribute('tabindex', '-1'), container.focus();
    }

    const handleKey = (e) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = Array.from(container.querySelectorAll(FOCUSABLE))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (returnFocus && previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        try { previousFocusRef.current.focus(); } catch {}
      }
    };
  }, [active, onEscape, autoFocus, returnFocus]);

  return containerRef;
}
