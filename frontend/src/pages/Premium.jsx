import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiZap, FiMessageCircle, FiVideo, FiHeart, FiStar, FiShield, FiGift } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const COMPARISON = [
  { label: 'Matches por día',          free: '10',        premium: 'Ilimitados' },
  { label: 'Ver quién te dio like',     free: false,       premium: true },
  { label: 'Videollamadas directas',    free: false,       premium: true },
  { label: 'Filtro de género en video', free: false,       premium: true },
  { label: 'Perfil destacado',          free: false,       premium: true },
  { label: 'Filtros avanzados (edad, país)', free: false,  premium: true },
  { label: 'Badge Premium visible',     free: false,       premium: true },
  { label: 'Sin anuncios',              free: false,       premium: true },
  { label: 'Coins de bienvenida',       free: '—',         premium: '100 🪙' },
];

const PERKS = [
  { icon: FiHeart,        text: 'Likes ilimitados todos los días' },
  { icon: FiVideo,        text: 'Videollamadas 1-a-1 con matches' },
  { icon: FiStar,         text: 'Apareces primero en los descubrimientos' },
  { icon: FiMessageCircle,text: 'Chat sin restricciones' },
  { icon: FiShield,       text: 'Sin anuncios interrumpidos' },
  { icon: FiGift,         text: '100 coins de regalo al activar' },
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

  const handlePause = async () => {
    if (!confirm('¿Pausar tu suscripción? Perderás acceso Premium hasta que la reanudes.')) return;
    try {
      await api.post('/api/payments/pause');
      toast.success('Suscripción pausada');
      loadSubscription();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al pausar');
    }
  };

  const handleResume = async () => {
    try {
      await api.post('/api/payments/resume');
      toast.success('Suscripción reanudada');
      loadSubscription();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al reanudar');
    }
  };

  // ── Active premium view ──────────────────────────────────────────────────────
  if (profile?.is_premium) {
    return (
      <div className="min-h-screen px-4 pt-8 pb-8 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            className="text-5xl mb-4"
          >⚡</motion.div>
          <h1 className="text-3xl font-black gradient-text">Destino Premium</h1>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="card p-5 border-yellow-500/30 bg-yellow-500/5 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <h3 className="font-bold text-white text-lg">¡Eres Premium!</h3>
            {subscription?.current_period_end && (
              <p className="text-gray-400 text-sm mt-1">
                Activo hasta {new Date(subscription.current_period_end).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-1">Tus beneficios activos</p>
            {PERKS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-gray-200">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-brand-400" />
                </div>
                {text}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {subscription?.status === 'paused' ? (
              <button onClick={handleResume} className="flex-1 text-green-400 text-sm hover:text-green-300 transition-colors py-3 flex items-center justify-center gap-2 bg-green-500/10 rounded-xl">
                ▶ Reanudar suscripción
              </button>
            ) : (
              <button onClick={handlePause} className="flex-1 text-gray-500 text-sm hover:text-yellow-400 transition-colors py-3 flex items-center justify-center gap-2">
                ⏸ Pausar
              </button>
            )}
            <button onClick={handleCancel} className="flex-1 text-gray-500 text-sm hover:text-red-400 transition-colors py-3 flex items-center justify-center gap-2">
              <FiX size={14} /> Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Upgrade view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 pt-8 pb-8 lg:px-10 lg:pt-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            className="text-5xl mb-4"
          >⚡</motion.div>
          <h1 className="text-3xl font-black gradient-text">Destino Premium</h1>
          <p className="text-gray-400 mt-2">Sin límites. Sin restricciones.</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Comparison table */}
          <div className="card overflow-hidden mb-6">
            <div className="grid grid-cols-3 bg-dark-700/60 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500">
              <span>Función</span>
              <span className="text-center">Gratis</span>
              <span className="text-center text-brand-400">Premium ⚡</span>
            </div>
            <div className="divide-y divide-white/5">
              {COMPARISON.map(({ label, free, premium }) => (
                <div key={label} className="grid grid-cols-3 px-4 py-3 items-center">
                  <span className="text-gray-300 text-sm">{label}</span>
                  <div className="flex justify-center">
                    {typeof free === 'boolean'
                      ? free
                        ? <FiCheck size={15} className="text-green-400" />
                        : <FiX size={15} className="text-gray-600" />
                      : <span className="text-gray-500 text-xs font-medium">{free}</span>
                    }
                  </div>
                  <div className="flex justify-center">
                    {typeof premium === 'boolean'
                      ? premium
                        ? <FiCheck size={15} className="text-brand-400" />
                        : <FiX size={15} className="text-gray-600" />
                      : <span className="text-brand-300 text-xs font-semibold">{premium}</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
            {/* Perks list */}
            <div className="card p-5 space-y-3">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-2">Por qué Premium vale la pena</p>
              {PERKS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-gray-300">
                  <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-brand-400" />
                  </div>
                  {text}
                </div>
              ))}
            </div>

            {/* Price + CTA */}
            <div className="space-y-4">
              <div className="card p-6 text-center bg-gradient-to-br from-brand-500/10 to-yellow-500/5 border-brand-500/20">
                <div className="text-5xl font-black text-white mb-1">$20</div>
                <div className="text-gray-400 mb-3">por mes</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-green-400 text-xs">
                    <FiCheck size={11} /> Cancela cuando quieras
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-gray-500 text-xs">
                    <FiShield size={11} /> Cobro seguro via Stripe
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="btn-primary w-full text-lg py-4 relative overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-white/10"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'linear', repeatDelay: 1 }}
                />
                <span className="relative">{loading ? 'Redirigiendo...' : '⚡ Activar Premium'}</span>
              </button>

              <Link to="/home" className="block text-center text-gray-600 text-sm hover:text-gray-400 transition-colors py-1">
                Quizás más tarde
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
