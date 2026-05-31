import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'destino_cookie_consent_v1';

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch { /* private mode */ }
  }, []);

  const accept = (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode,
        accepted_at: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-3 sm:p-4 bg-dark-900/95 backdrop-blur-md border-t border-white/10"
        >
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 text-xs sm:text-sm text-gray-300 leading-relaxed">
              <p>
                <span className="font-bold text-white">🍪 Usamos cookies</span> para mantener tu sesión activa, recordar tus preferencias y mejorar la app.
                Lee nuestra <Link to="/privacy" className="text-brand-400 underline">Política de Privacidad</Link>.
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => accept('essential')}
                className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg border border-white/15 text-gray-300 hover:bg-white/5"
              >
                Solo esenciales
              </button>
              <button
                onClick={() => accept('all')}
                className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold"
              >
                Aceptar todas
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
