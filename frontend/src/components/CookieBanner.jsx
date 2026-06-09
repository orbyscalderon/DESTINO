import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';

const STORAGE_KEY = 'destino_cookie_consent_v1';

// Países en EU/EEA/UK requieren GDPR-strict consent (opt-in granular,
// sin defaults pre-checked, derecho a "rechazar" tan prominente como "aceptar")
const GDPR_STRICT_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','NO','IS','LI','CH','GB',
]);

async function detectGdprStrict() {
  try {
    const cached = sessionStorage.getItem('destino_geo_country');
    if (cached) return GDPR_STRICT_COUNTRIES.has(cached);
    const res = await fetch('/cdn-cgi/trace').catch(() => null);
    if (res?.ok) {
      const text = await res.text();
      const match = text.match(/loc=([A-Z]{2})/);
      if (match) {
        sessionStorage.setItem('destino_geo_country', match[1]);
        return GDPR_STRICT_COUNTRIES.has(match[1]);
      }
    }
  } catch {}
  return false;
}

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [gdprStrict, setGdprStrict] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {}
    detectGdprStrict().then(setGdprStrict);
  }, []);

  const syncToBackend = async (purposesGranted) => {
    if (!user) return;
    try {
      const consents = {
        analytics:        purposesGranted,
        marketing:        purposesGranted,
        personalization:  purposesGranted,
        advertising:      purposesGranted,
        thirdparty_share: purposesGranted,
      };
      await api.post('/api/consents/bulk', { consents });
    } catch {}
  };

  const accept = (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode,
        accepted_at: new Date().toISOString(),
        gdpr_strict: gdprStrict,
      }));
    } catch {}
    if (mode === 'all') syncToBackend(true);
    if (mode === 'essential') syncToBackend(false);
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-3 sm:p-4 glass border-t border-white/10 shadow-[0_-4px_30px_rgba(0,0,0,0.4)]"
        >
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 text-xs sm:text-sm text-gray-300 leading-relaxed">
              <p>
                <span className="font-bold text-white">🍪 {gdprStrict ? 'Tu privacidad importa' : 'Usamos cookies'}</span>
                {' — '}
                {gdprStrict
                  ? 'Usamos cookies para sesión + analítica + publicidad. Puedes elegir granularmente. '
                  : 'para mantener tu sesión activa, recordar tus preferencias y mejorar la app. '}
                Lee nuestra <Link to="/privacy" className="text-brand-400 hover:text-brand-300 underline">Política de Privacidad</Link>.
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0 flex-wrap">
              <Link
                to="/privacy/preferences"
                onClick={() => accept('customized')}
                className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg border border-white/15 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/25 transition-all duration-200 ease-out-expo active:scale-95 text-center"
              >
                Personalizar
              </Link>
              <button
                onClick={() => accept('essential')}
                className={`flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm rounded-lg border border-white/15 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/25 transition-all duration-200 ease-out-expo active:scale-95 ${gdprStrict ? 'font-bold' : ''}`}
              >
                {gdprStrict ? 'Rechazar todas' : 'Solo esenciales'}
              </button>
              <button
                onClick={() => accept('all')}
                className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-out-expo"
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
