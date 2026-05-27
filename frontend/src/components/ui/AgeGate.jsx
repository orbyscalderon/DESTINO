import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../lib/api.js';

const AGE_KEY = 'Destino TV_age_verified';

export function isAgeVerified() {
  return localStorage.getItem(AGE_KEY) === '1';
}

export default function AgeGate({ onVerified }) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await api.post('/api/profiles/verify-age').catch(() => {});
      localStorage.setItem(AGE_KEY, '1');
      onVerified();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-dark-900/95 backdrop-blur-md flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-sm w-full bg-dark-800 border border-white/10 rounded-3xl p-8 text-center space-y-5"
      >
        <div className="text-6xl">🔞</div>
        <div>
          <h2 className="text-2xl font-black text-white mb-2">Contenido para adultos</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Esta sección contiene material explícito para mayores de 18 años.
            Al continuar confirmas que eres mayor de edad y aceptas ver este tipo de contenido.
          </p>
        </div>
        <div className="space-y-3 pt-2">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="btn-primary w-full text-base disabled:opacity-60"
          >
            {confirming ? 'Verificando...' : 'Soy mayor de 18 años — Entrar'}
          </button>
          <button
            onClick={() => window.history.back()}
            className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
          >
            Salir
          </button>
        </div>
        <p className="text-[11px] text-gray-600">
          Al confirmar, tu decisión queda registrada en nuestra plataforma conforme a la ley.
        </p>
      </motion.div>
    </motion.div>
  );
}
