import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiDollarSign, FiVideo, FiImage, FiTrendingUp, FiArrowRight, FiCheck } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const benefits = [
  { icon: FiVideo, title: 'Shows en vivo de pago', desc: 'Transmite en broadcast o sesiones privadas 1-a-1 con precio de entrada.' },
  { icon: FiImage, title: 'Fotos exclusivas', desc: 'Pon precio a tus fotos. Solo quienes paguen las verán.' },
  { icon: FiDollarSign, title: '70% para ti', desc: 'La plataforma retiene solo el 30%. El resto es tuyo.' },
  { icon: FiTrendingUp, title: 'Pagos a tu cuenta', desc: 'Retira tus ganancias directamente a tu cuenta bancaria via Stripe.' },
];

export default function BecomeCreator() {
  const { profile, fetchProfile, user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(profile?.is_creator ? 'setup' : 'intro');

  const handleRegister = async () => {
    setLoading(true);
    try {
      await api.post('/api/creator/register');
      await fetchProfile(user.id);
      setStep('setup');
      toast.success('Cuenta de creador activada');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error al activar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPayments = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/creator/onboarding-link');
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al abrir la configuración de pagos');
      setLoading(false);
    }
  };

  const isStripeActive = profile?.stripe_account_status === 'active';

  return (
    <div className="min-h-screen px-4 pt-8 pb-8 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1">
        ← Volver
      </button>

      {step === 'intro' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FiDollarSign className="text-brand-400" size={30} />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Conviértete en Creador</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Monetiza tu contenido directamente desde tu perfil. Gana dinero con shows en vivo y fotos exclusivas.
            </p>
          </div>

          <div className="space-y-3 mb-8">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center shrink-0">
                  <Icon className="text-brand-400" size={18} />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-4 mb-6 bg-yellow-500/5 border-yellow-500/20">
            <p className="text-yellow-400 text-xs font-medium mb-1">Importante</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Necesitarás conectar una cuenta bancaria a través de Stripe para recibir pagos. El proceso toma 2-3 minutos y es completamente seguro.
            </p>
          </div>

          <button
            onClick={handleRegister}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Activar cuenta de creador <FiArrowRight size={16} /></>
            )}
          </button>
        </motion.div>
      )}

      {step === 'setup' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FiCheck className="text-green-400" size={30} />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Ya eres Creador</h1>
            <p className="text-gray-400 text-sm">
              {isStripeActive
                ? 'Tu cuenta de pagos está activa. ¡Puedes empezar a ganar!'
                : 'Configura tus pagos para poder cobrar por tu contenido.'}
            </p>
          </div>

          <div className="space-y-3 mb-8">
            <div className={`card p-4 flex items-center gap-3 ${isStripeActive ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isStripeActive ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                <FiCheck className={isStripeActive ? 'text-green-400' : 'text-yellow-400'} size={14} />
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  {isStripeActive ? 'Pagos configurados' : 'Configura tus pagos'}
                </p>
                <p className="text-gray-500 text-xs">
                  {isStripeActive ? 'Puedes cobrar por shows y fotos' : 'Necesario para recibir dinero'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {!isStripeActive && (
              <button
                onClick={handleSetupPayments}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Configurar pagos en Stripe <FiArrowRight size={16} /></>
                )}
              </button>
            )}
            <button
              onClick={() => navigate('/creator/dashboard')}
              className="btn-secondary w-full"
            >
              Ir al panel de creador
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
