import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheck, FiX, FiZap, FiMessageCircle, FiVideo, FiHeart,
  FiStar, FiShield, FiGift, FiEyeOff, FiGlobe, FiAward,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const PLANS = [
  {
    key: 'basic',
    name: 'Básico',
    price: 0,
    color: 'gray',
    emoji: '🌐',
    badge: null,
    features: [
      { label: 'Swipe y matches',                    on: true },
      { label: 'Chat de texto',                      on: true },
      { label: 'Stories',                            on: true },
      { label: 'Ver posts públicos',                 on: true },
      { label: 'Shows gratuitos',                    on: true },
      { label: 'Propinas y compras de contenido',    on: true },
      { label: 'Suscribirse a creadores',            on: true },
      { label: 'Sin anuncios',                       on: false },
      { label: 'Ver quién te dio like',              on: false },
      { label: 'Iniciar videollamadas',              on: false },
      { label: 'Modo incógnito',                     on: false },
      { label: 'Traducción de mensajes',             on: false },
      { label: 'Filtros avanzados de búsqueda',      on: false },
      { label: 'Sección creadores adultos',          on: false },
      { label: 'Shows adultos',                      on: false },
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: 9.99,
    color: 'brand',
    emoji: '⚡',
    badge: 'Más popular',
    features: [
      { label: 'Todo lo del plan Básico',            on: true },
      { label: 'Sin anuncios',                       on: true },
      { label: 'Ver quién te dio like',              on: true },
      { label: 'Iniciar videollamadas',              on: true },
      { label: 'Modo incógnito',                     on: true },
      { label: 'Traducción de mensajes',             on: true },
      { label: 'Filtros avanzados de búsqueda',      on: true },
      { label: 'Sección creadores adultos',          on: false },
      { label: 'Shows adultos',                      on: false },
      { label: 'Badge VIP en perfil',                on: false },
    ],
  },
  {
    key: 'vip',
    name: 'VIP',
    price: 24.99,
    color: 'yellow',
    emoji: '👑',
    badge: 'Todo incluido',
    features: [
      { label: 'Todo lo del plan Premium',           on: true },
      { label: 'Sección creadores adultos',          on: true },
      { label: 'Shows adultos',                      on: true },
      { label: 'Acceso prioritario a shows',         on: true },
      { label: 'Badge VIP en perfil',                on: true },
    ],
  },
];

const COLOR = {
  gray:   { card: 'border-white/10',                   btn: 'bg-dark-600 text-gray-300',           badge: '', text: 'text-gray-400' },
  brand:  { card: 'border-brand-500/40 bg-brand-500/5', btn: 'btn-primary',                        badge: 'bg-brand-500/20 text-brand-400', text: 'text-brand-400' },
  yellow: { card: 'border-yellow-500/40 bg-yellow-500/5', btn: 'bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl px-6 py-3 transition-colors', badge: 'bg-yellow-500/20 text-yellow-400', text: 'text-yellow-400' },
};

export default function Premium() {
  const { profile, fetchProfile, user } = useAuthStore();
  const [loading, setLoading] = useState(null); // 'premium' | 'vip'
  const [subscription, setSubscription] = useState(null);
  const [searchParams] = useSearchParams();

  const currentTier = profile?.premium_tier || 'basic';

  useEffect(() => {
    const plan = searchParams.get('success');
    if (plan !== null) {
      const planName = searchParams.get('plan') === 'vip' ? 'VIP 👑' : 'Premium ⚡';
      toast.success(`¡Bienvenido a ${planName}!`);
      fetchProfile(user.id);
    }
    if (searchParams.get('canceled')) toast.error('Pago cancelado');
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data } = await api.get('/api/payments/status');
      setSubscription(data.subscription);
    } catch {}
  };

  const handleSubscribe = async (plan) => {
    setLoading(plan);
    try {
      const { data } = await api.post('/api/payments/create-checkout', { plan });
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar pago');
      setLoading(null);
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
    if (!confirm('¿Pausar tu suscripción? Perderás acceso hasta que la reanudes.')) return;
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

  // ── Vista con plan activo ────────────────────────────────────────────────────
  if (currentTier !== 'basic') {
    const activePlan = PLANS.find(p => p.key === currentTier);
    const c = COLOR[activePlan?.color || 'brand'];
    return (
      <div className="min-h-screen px-4 pt-8 pb-8 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            className="text-5xl mb-4"
          >{activePlan?.emoji}</motion.div>
          <h1 className="text-3xl font-black gradient-text">Plan {activePlan?.name}</h1>
          {subscription?.current_period_end && (
            <p className="text-gray-400 text-sm mt-2">
              Activo hasta {new Date(subscription.current_period_end).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`card p-5 ${c.card} text-center`}>
            <div className="text-3xl mb-2">{currentTier === 'vip' ? '👑' : '🎉'}</div>
            <h3 className="font-bold text-white text-lg">¡Eres {activePlan?.name}!</h3>
          </div>

          <div className="card p-4 space-y-2.5">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-1">Tus beneficios activos</p>
            {activePlan?.features.filter(f => f.on).map(({ label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-gray-200">
                <div className={`w-6 h-6 rounded-lg ${c.card} flex items-center justify-center shrink-0`}>
                  <FiCheck size={13} className={c.text} />
                </div>
                {label}
              </div>
            ))}
          </div>

          {/* Upgrade a VIP si está en Premium */}
          {currentTier === 'premium' && (
            <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
              <p className="text-yellow-300 font-semibold text-sm mb-1">👑 Upgrade a VIP</p>
              <p className="text-gray-400 text-xs mb-3">Desbloquea creadores adultos, shows adultos y badge VIP.</p>
              <button
                onClick={() => handleSubscribe('vip')}
                disabled={loading === 'vip'}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl px-6 py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                {loading === 'vip' ? 'Redirigiendo...' : 'Upgrade a VIP — $24.99/mes'}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {subscription?.status === 'paused' ? (
              <button onClick={handleResume} className="flex-1 text-green-400 text-sm hover:text-green-300 transition-colors py-3 flex items-center justify-center gap-2 bg-green-500/10 rounded-xl">
                ▶ Reanudar
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

  // ── Vista upgrade (Básico) ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-4 pt-8 pb-10 lg:px-10">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-2">Planes Destino</p>
          <h1 className="text-3xl lg:text-4xl font-black gradient-text mb-2">Elige tu experiencia</h1>
          <p className="text-gray-500 text-sm">Cancela cuando quieras · Cobro seguro vía Stripe</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          {PLANS.map((plan, idx) => {
            const c = COLOR[plan.color];
            const isActive = currentTier === plan.key;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={`card p-5 flex flex-col relative ${c.card} ${plan.key === 'premium' ? 'md:scale-105 md:shadow-xl md:shadow-brand-500/10' : ''}`}
              >
                {plan.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>
                    {plan.badge}
                  </div>
                )}

                <div className="text-center mb-4">
                  <div className="text-3xl mb-2">{plan.emoji}</div>
                  <h2 className={`text-xl font-black ${c.text}`}>{plan.name}</h2>
                  {plan.price === 0
                    ? <p className="text-2xl font-black text-white mt-1">Gratis</p>
                    : (
                      <div className="mt-1">
                        <span className="text-2xl font-black text-white">${plan.price}</span>
                        <span className="text-gray-500 text-sm">/mes</span>
                      </div>
                    )
                  }
                </div>

                <div className="flex-1 space-y-2 mb-5">
                  {plan.features.map(({ label, on }) => (
                    <div key={label} className="flex items-center gap-2">
                      {on
                        ? <FiCheck size={13} className={`${c.text} shrink-0`} />
                        : <FiX size={13} className="text-gray-700 shrink-0" />
                      }
                      <span className={`text-xs ${on ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                    </div>
                  ))}
                </div>

                {plan.key === 'basic' ? (
                  <div className="text-center text-xs text-gray-600 py-2">Plan actual</div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={!!loading}
                    className={`w-full py-3 text-sm font-semibold ${c.btn} disabled:opacity-50`}
                  >
                    {loading === plan.key
                      ? 'Redirigiendo...'
                      : `Activar ${plan.name} ${plan.emoji}`
                    }
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        <p className="text-center text-xs text-gray-700">
          Al suscribirte aceptas nuestros{' '}
          <Link to="/terms" className="text-gray-500 hover:text-gray-300">Términos de servicio</Link>.
          Puedes cancelar en cualquier momento desde Configuración.
        </p>
      </div>
    </div>
  );
}
