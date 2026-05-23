import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { FiX, FiLock, FiCreditCard } from 'react-icons/fi';

let stripePromise = null;
const getStripe = () => {
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');
  return stripePromise;
};

const CARD_STYLE = {
  base: {
    color: '#ffffff',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    fontSize: '16px',
    '::placeholder': { color: '#6b7280' },
    iconColor: '#9ca3af',
  },
  invalid: { color: '#f87171', iconColor: '#f87171' },
};

/**
 * Modal reutilizable de pago con Stripe.js (vanilla).
 *
 * Props:
 *  - clientSecret (string)     — PaymentIntent client_secret del backend
 *  - amount (string)           — Texto del precio, ej. "$5.00"
 *  - description (string)      — Qué se está comprando
 *  - onSuccess(intentId)       — Callback con el paymentIntentId confirmado
 *  - onClose()                 — Callback para cerrar el modal
 */
export default function PaymentModal({ clientSecret, amount, description, onSuccess, onClose }) {
  const mountRef   = useRef(null);
  const stripeRef  = useRef(null);
  const cardRef    = useRef(null);

  const [ready,  setReady]  = useState(false);
  const [paying, setPaying] = useState(false);
  const [cardError, setCardError] = useState(null);

  useEffect(() => {
    let active = true;

    getStripe().then(stripe => {
      if (!active || !mountRef.current) return;
      stripeRef.current = stripe;

      const elements  = stripe.elements();
      const cardEl    = elements.create('card', { style: CARD_STYLE, hidePostalCode: true });
      cardEl.mount(mountRef.current);
      cardRef.current = cardEl;

      cardEl.on('ready',  ()  => { if (active) setReady(true); });
      cardEl.on('change', evt => { if (active) setCardError(evt.error?.message || null); });
    });

    return () => {
      active = false;
      cardRef.current?.destroy();
    };
  }, []);

  const handlePay = async () => {
    if (!stripeRef.current || !cardRef.current || !ready) return;
    setPaying(true);
    setCardError(null);

    try {
      const { paymentIntent, error } = await stripeRef.current.confirmCardPayment(clientSecret, {
        payment_method: { card: cardRef.current },
      });

      if (error) {
        setCardError(error.message);
        return;
      }

      onSuccess(paymentIntent.id);
    } catch {
      setCardError('Error al procesar el pago. Intenta de nuevo.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 60, opacity: 0 }}
        className="w-full max-w-sm bg-dark-800 rounded-2xl border border-white/10 p-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-white font-bold text-base">{description}</h2>
            <p className="text-3xl font-black gradient-text mt-0.5">{amount}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5 mt-0.5"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Card Element mount point */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 flex items-center gap-1.5">
            <FiCreditCard size={11} /> Datos de la tarjeta
          </label>
          <div
            ref={mountRef}
            className="bg-dark-700 border border-white/10 rounded-xl px-4 py-3.5 min-h-[46px] transition-colors focus-within:border-brand-500/50"
          />
        </div>

        {/* Error */}
        {cardError && (
          <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
            <span className="w-1 h-1 bg-red-400 rounded-full shrink-0" />
            {cardError}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={handlePay}
          disabled={!ready || paying}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {paying ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><FiLock size={14} /> Pagar {amount}</>
          )}
        </button>

        <p className="text-center text-[11px] text-gray-600 mt-3 flex items-center justify-center gap-1">
          <FiLock size={9} /> Pago seguro · Stripe
        </p>
      </motion.div>
    </motion.div>
  );
}
