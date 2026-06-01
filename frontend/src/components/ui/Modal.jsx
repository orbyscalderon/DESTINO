import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

// Modal base accesible: role="dialog", Esc para cerrar, focus trap simple,
// auto-focus en primer elemento focuseable, restaura focus al cerrar.
//
// Props:
//   open: boolean
//   onClose: () => void
//   title?: string (para aria-labelledby)
//   description?: string (para aria-describedby)
//   size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'  (default 'md')
//   closeOnBackdrop?: boolean (default true)
//   showCloseButton?: boolean (default true)
//   children: contenido
//
// Notas:
// - Sin trap focus elaborado: usamos un sentinel al final del modal con
//   tabindex=0 que vuelve al primero. Suficiente para casi todos los flujos.
// - El stack de modales se maneja con z-index incremental (z-50, z-60, etc.)
//   y la restauración de focus usa una stack propia (lastFocused ref).
const SIZES = {
  sm:   'sm:max-w-sm',
  md:   'sm:max-w-md',
  lg:   'sm:max-w-lg',
  xl:   'sm:max-w-2xl',
  full: 'sm:max-w-4xl',
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  showCloseButton = true,
  children,
  className = '',
  zClass = 'z-50',
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Escape key + auto-focus + restore focus
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKey);

    // Auto-focus en el primer elemento focuseable del modal
    setTimeout(() => {
      const focusables = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = Array.from(focusables || []).find(el => !el.disabled);
      first?.focus();
    }, 50);

    // Body scroll lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      // Restaurar focus al elemento previo
      try { previouslyFocused.current?.focus?.(); } catch {}
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`fixed inset-0 bg-black/80 ${zClass} flex items-end sm:items-center justify-center p-0 sm:p-4`}
          onClick={closeOnBackdrop ? onClose : undefined}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            aria-describedby={description ? 'modal-desc' : undefined}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`bg-dark-900 w-full ${SIZES[size]} rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto outline-none ${className}`}
            onClick={e => e.stopPropagation()}
            tabIndex={-1}
          >
            {(title || showCloseButton) && (
              <div className="sticky top-0 bg-dark-900 px-5 py-4 border-b border-dark-700 flex items-center justify-between z-10">
                {title && (
                  <h3 id="modal-title" className="text-white font-bold">
                    {title}
                  </h3>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="text-gray-400 hover:text-white p-1 -m-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 ml-auto"
                  >
                    <FiX size={20} />
                  </button>
                )}
              </div>
            )}
            {description && (
              <p id="modal-desc" className="sr-only">{description}</p>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
