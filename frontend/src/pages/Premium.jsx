import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiZap, FiMessageCircle, FiVideo, FiHeart, FiStar, FiX } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const features = [
  { icon: FiMessageCircle, text: 'Chat ilimitado sin restricciones diarias' },
  { icon: FiVideo, text: 'Filtro de género en videollamadas' },
  { icon: FiHeart, text: 'Ver quién te dio like' },
  { icon: FiStar, text: 'Perfil destacado — apareces primero' },
  { icon: FiZap, text: 'Badge Premium en tu perfil' },
  { icon: FiCheck, text: 'Sin anuncios nunca' },
];

export default function Premium() {
  const { profile, fetchProfile, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('¡Bienvenido a Premium! 🎉');
      fetchProfile(user.id);
    }
    if (searchParams.get('canceled')) {
      toast.error('Pago cancelado');
    }
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data } = await api.get('/api/payments/status');
      setSubscription(data.subscription);
    } catch {}
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/payments/create-checkout');
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar pago');
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('¿Seguro que quieres cancelar tu suscripción?')) return;
    try {
      await api.post('/api/payments/cancel');
      toast.success('Suscripción cancelada al final del período');
      loadSubscription();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-8 lg:px-10 lg:pt-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 lg:mb-10">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            className="text-5xl mb-4"
          >
            ⚡
          </motion.div>
          <h1 className="text-3xl font-black gradient-text">Destino Premium</h1>
          <p className="text-gray-400 mt-2">Sin límites. Sin restricciones.</p>
        </div>

        {/* Si ya es premium */}
        {profile?.is_premium ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-lg mx-auto">
            <div className="card p-5 border-yellow-500/30 bg-yellow-500/5 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <h3 className="font-bold text-white">¡Eres Premium!</h3>
              {subscription?.current_period_end && (
                <p className="text-gray-400 text-sm mt-1">
                  Activo hasta {new Date(subscription.current_period_end).toLocaleDateString('es')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {features.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-gray-300 p-3 card">
                  <Icon size={16} className="text-brand-400 flex-shrink-0" />
                  {text}
                </div>
              ))}
            </div>

            <button onClick={handleCancel} className="w-full text-gray-500 text-sm hover:text-brand-400 transition-colors py-3 flex items-center justify-center gap-2">
              <FiX size={14} /> Cancelar suscripción
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Desktop: 2 columnas. Móvil: stacked */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-4 lg:space-y-0">
              {/* Features */}
              <div className="card p-5 space-y-3">
                <h3 className="font-semibold text-gray-300 mb-4">Todo incluido</h3>
                {features.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-brand-400" />
                    </div>
                    {text}
                  </div>
                ))}
              </div>

              {/* Precio + CTA */}
              <div className="space-y-4">
                <div className="card p-6 text-center bg-gradient-to-br from-brand-500/10 to-yellow-500/5 border-brand-500/20">
                  <div className="text-5xl font-black text-white mb-1">$20</div>
                  <div className="text-gray-400">por mes</div>
                  <div className="text-gray-500 text-sm mt-1">Cancela cuando quieras</div>
                  <div className="text-gray-600 text-xs mt-1">Cobro seguro via Stripe</div>
                </div>

                <button
                  onClick={handleSubscribe}
                  disabled={loading}
                  className="btn-primary w-full text-lg py-4"
                >
                  {loading ? 'Redirigiendo...' : 'Comenzar Premium'}
                </button>

                <Link to="/home" className="block text-center text-gray-600 text-sm hover:text-gray-400">
                  Quizás más tarde
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
