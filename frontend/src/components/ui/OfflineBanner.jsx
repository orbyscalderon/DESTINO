import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiWifiOff, FiWifi } from 'react-icons/fi';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOffline(true); setShowBack(false); };
    const goOnline  = () => {
      setOffline(false);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {(offline || showBack) && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 py-2.5 text-sm font-semibold ${
            offline
              ? 'bg-red-600 text-white'
              : 'bg-green-600 text-white'
          }`}
        >
          {offline ? <FiWifiOff size={15} /> : <FiWifi size={15} />}
          {offline ? 'Sin conexión a internet' : '¡Conexión restablecida!'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
