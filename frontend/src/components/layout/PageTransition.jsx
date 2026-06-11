import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Wrapper para que cada cambio de ruta tenga un transition real.
// Coloca este componente DENTRO del Suspense pero ENVUELVE las <Routes>.
//
// El children debe ser <Routes>. Hace fade + slide sutil entre páginas.

export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.32, ease: [0.19, 1, 0.22, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
