import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDollarSign, FiVideo, FiImage, FiTrendingUp, FiArrowRight, FiCheck,
  FiUsers, FiHeart, FiZap, FiShield, FiAlertTriangle, FiArrowLeft, FiLock,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import SuccessConfetti from '../components/ui/SuccessConfetti.jsx';

const normalBenefits = [
  { icon: FiVideo, title: 'Shows en vivo', desc: 'Transmite en directo y cobra entrada o propinas en coins.' },
  { icon: FiImage, title: 'Contenido exclusivo', desc: 'Pon precio a tus fotos, videos, posts y galerías.' },
  { icon: FiUsers, title: 'Suscripciones por niveles', desc: 'Hasta 3 tiers (Bronze/Silver/Gold) con beneficios personalizados.' },
  { icon: FiDollarSign, title: '70% para ti', desc: 'La plataforma retiene 30%. El resto va a tu cuenta bancaria.' },
  { icon: FiTrendingUp, title: 'Pagos automáticos', desc: 'Retiros directos a tu banco vía Stripe Connect.' },
];

const adultExtras = [
  { icon: FiHeart, title: 'Contenido +18 permitido', desc: 'Fotos, videos y shows íntimos en tu sección adulta privada.' },
  { icon: FiLock, title: 'Audiencia verificada', desc: 'Solo usuarios con verificación de edad pueden ver tu contenido.' },
  { icon: FiZap, title: 'Pay-per-view y galerías privadas', desc: 'Vende contenido individual o packs.' },
];

const adultRequirements = [
  'Eres mayor de 18 años (verificable con identificación oficial).',
  'Cumples con USC §2257 — mantienes registros de edad de cualquier modelo en tu contenido.',
  'NO publicarás contenido con menores, no consensuado, o que viole nuestras políticas.',
  'Entiendes que Stripe puede rechazar payouts en algunos países para contenido adulto. En ese caso, se ofrecerán alternativas (CCBill/Segpay) próximamente.',
  'Acepto que mi sección adulta requiere age-gate y NO aparece en el feed general de la app.',
];

export default function BecomeCreator() {
  const { profile, fetchProfile, user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const isCreator = !!profile?.is_creator;
  const isAdultCreator = !!profile?.is_adult_creator;
  const isStripeActive = profile?.stripe_account_status === 'active';

  // Step: 'choose' | 'normal-terms' | 'adult-terms' | 'setup'
  const initialStep = useMemo(() => {
    if (isCreator) return 'setup';
    return 'choose';
  }, [isCreator]);
  const [step, setStep] = useState(initialStep);
  const [creatorType, setCreatorType] = useState(isAdultCreator ? 'adult' : 'normal');
  const [celebrate, setCelebrate] = useState(false);

  // Aceptaciones
  const [acceptedGeneral, setAcceptedGeneral] = useState(false);
  const [adultChecks, setAdultChecks] = useState(Array(adultRequirements.length).fill(false));
  const allAdultChecked = adultChecks.every(Boolean);

  const handleRegister = async (type) => {
    setLoading(true);
    try {
      const body = {
        creatorType: type,
        acceptedTerms: true,
      };
      if (type === 'adult') body.acceptedAdultTerms = true;

      await api.post('/api/creator/register', body);
      await fetchProfile(user.id);
      setCelebrate(true);
      setStep('setup');
      toast.success(type === 'adult' ? '🎉 ¡Cuenta de creador adulto activada!' : '🎉 ¡Cuenta de creador activada!');
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

  // ─────────────────────────────────────────── helpers ──
  const Back = ({ to }) => (
    <button
      onClick={() => setStep(to)}
      className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1"
    >
      <FiArrowLeft size={14} /> Volver
    </button>
  );

  return (
    <div className="min-h-screen hero-mesh px-4 pt-8 pb-28 lg:pb-8 max-w-2xl mx-auto relative overflow-hidden">
      <SuccessConfetti show={celebrate} onDone={() => setCelebrate(false)} count={50} />
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-float -z-10" />
      {step !== 'setup' && (
        <button
          onClick={() => step === 'choose' ? navigate(-1) : setStep('choose')}
          className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1"
        >
          <FiArrowLeft size={14} /> {step === 'choose' ? 'Volver' : 'Cambiar tipo'}
        </button>
      )}

      <AnimatePresence mode="wait">
        {/* ── PASO 1: ELEGIR TIPO ──────────────────────────────────── */}
        {step === 'choose' && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FiDollarSign className="text-brand-400" size={30} />
              </div>
              <h1 className="text-2xl font-black text-white mb-2">Conviértete en Creador</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                Elige el tipo de creador que mejor se ajusta a tu contenido. Puedes upgradearte después.
              </p>
            </div>

            <div className="space-y-3">
              {/* Creador General */}
              <button
                onClick={() => { setCreatorType('normal'); setStep('normal-terms'); }}
                className="card p-5 w-full text-left hover:border-brand-500/40 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center shrink-0">
                    <FiUsers className="text-brand-400" size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-bold">Creador General</h3>
                      <FiArrowRight className="text-gray-500 group-hover:text-brand-400 transition-colors" size={16} />
                    </div>
                    <p className="text-gray-400 text-sm mb-3">
                      Música, lifestyle, gaming, comedia, cocina, fitness, citas… contenido apto para todos los públicos.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Shows en vivo', 'Suscripciones', 'Fotos exclusivas', 'PPV'].map(t => (
                        <span key={t} className="text-[10px] bg-dark-700 px-2 py-0.5 rounded-full text-gray-300">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>

              {/* Creador Adulto */}
              <button
                onClick={() => { setCreatorType('adult'); setStep('adult-terms'); }}
                className="card p-5 w-full text-left hover:border-pink-500/40 transition-colors group border-pink-500/20"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-pink-500/15 rounded-xl flex items-center justify-center shrink-0">
                    <FiHeart className="text-pink-400" size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-bold flex items-center gap-2">
                        Creador Adulto
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full">+18</span>
                      </h3>
                      <FiArrowRight className="text-gray-500 group-hover:text-pink-400 transition-colors" size={16} />
                    </div>
                    <p className="text-gray-400 text-sm mb-3">
                      Contenido +18 explícito. Tu sección requiere age-gate y NO aparece en el feed general.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['NSFW permitido', 'Galerías privadas', 'PPV', 'Shows íntimos'].map(t => (
                        <span key={t} className="text-[10px] bg-pink-500/10 px-2 py-0.5 rounded-full text-pink-300">{t}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-yellow-400/80 mt-3 flex items-center gap-1.5">
                      <FiShield size={11} /> Requiere verificación de edad e identidad
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <p className="text-[11px] text-gray-500 text-center mt-6 leading-relaxed">
              Si vas a publicar contenido sexualmente explícito, elige <strong className="text-white">Creador Adulto</strong>.
              Publicar +18 en una cuenta general puede resultar en suspensión.
            </p>
          </motion.div>
        )}

        {/* ── PASO 2A: TÉRMINOS NORMALES ───────────────────────────── */}
        {step === 'normal-terms' && (
          <motion.div
            key="normal-terms"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FiUsers className="text-brand-400" size={26} />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Creador General</h1>
              <p className="text-gray-400 text-sm">Revisa los beneficios y acepta los términos.</p>
            </div>

            <div className="space-y-2 mb-6">
              {normalBenefits.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="card p-3 flex items-start gap-3">
                  <div className="w-9 h-9 bg-brand-500/15 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="text-brand-400" size={16} />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4 mb-4 bg-yellow-500/5 border-yellow-500/20">
              <p className="text-yellow-400 text-xs font-semibold mb-1 flex items-center gap-1.5">
                <FiAlertTriangle size={12} /> Importante
              </p>
              <p className="text-gray-400 text-xs leading-relaxed">
                Necesitarás conectar tu cuenta bancaria vía Stripe (2-3 min). Como Creador General, NO puedes publicar contenido sexualmente explícito —
                eso requiere upgradearte a Creador Adulto. Reincidencia puede llevar a suspensión.
              </p>
            </div>

            <label className="card p-3 flex items-start gap-3 cursor-pointer hover:bg-dark-800 transition-colors mb-4">
              <input
                type="checkbox"
                checked={acceptedGeneral}
                onChange={e => setAcceptedGeneral(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-gray-300">
                He leído y acepto los <a href="#/terms" target="_blank" className="text-brand-400 underline">Términos de Servicio</a>,
                la <a href="#/privacy" target="_blank" className="text-brand-400 underline">Política de Privacidad</a> y
                la política de monetización (30% plataforma / 70% creador).
              </span>
            </label>

            <button
              onClick={() => handleRegister('normal')}
              disabled={loading || !acceptedGeneral}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Activar cuenta de creador <FiArrowRight size={16} /></>
              )}
            </button>
          </motion.div>
        )}

        {/* ── PASO 2B: TÉRMINOS ADULT ──────────────────────────────── */}
        {step === 'adult-terms' && (
          <motion.div
            key="adult-terms"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-pink-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <FiHeart className="text-pink-400" size={26} />
              </div>
              <h1 className="text-xl font-bold text-white mb-1 flex items-center justify-center gap-2">
                Creador Adulto
                <span className="text-[11px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">+18</span>
              </h1>
              <p className="text-gray-400 text-sm">Lee y acepta cada uno de los requisitos.</p>
            </div>

            <div className="space-y-2 mb-6">
              {adultExtras.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="card p-3 flex items-start gap-3 border-pink-500/15">
                  <div className="w-9 h-9 bg-pink-500/15 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="text-pink-400" size={16} />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4 mb-4 bg-red-500/5 border-red-500/30">
              <p className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                <FiAlertTriangle size={12} /> Requisitos obligatorios
              </p>
              <p className="text-gray-400 text-xs leading-relaxed mb-3">
                Para activar tu cuenta de Creador Adulto, debes confirmar TODOS los siguientes puntos.
                Violarlos resulta en suspensión inmediata y bloqueo de payouts.
              </p>
              <div className="space-y-2.5">
                {adultRequirements.map((req, i) => (
                  <label key={i} className="flex items-start gap-2.5 cursor-pointer hover:bg-dark-800/50 rounded-lg p-2 -m-2 transition-colors">
                    <input
                      type="checkbox"
                      checked={adultChecks[i]}
                      onChange={e => {
                        const next = [...adultChecks];
                        next[i] = e.target.checked;
                        setAdultChecks(next);
                      }}
                      className="mt-0.5 w-4 h-4 accent-pink-500 shrink-0"
                    />
                    <span className="text-xs text-gray-300 leading-relaxed">{req}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="card p-3 mb-4 bg-yellow-500/5 border-yellow-500/20">
              <p className="text-yellow-400/90 text-xs font-medium mb-1 flex items-center gap-1.5">
                <FiShield size={11} /> Verificación de identidad
              </p>
              <p className="text-gray-400 text-xs leading-relaxed">
                Después de activar, deberás subir tu identificación oficial (DNI/pasaporte) + selfie sosteniéndola
                en la sección <strong className="text-white">Verificación de identidad</strong> del panel. Hasta entonces, tu contenido adulto está limitado.
              </p>
            </div>

            <button
              onClick={() => handleRegister('adult')}
              disabled={loading || !allAdultChecked}
              className="w-full py-3 rounded-xl bg-pink-500 hover:bg-pink-400 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Activar cuenta adulta <FiArrowRight size={16} /></>
              )}
            </button>
            {!allAdultChecked && (
              <p className="text-[11px] text-gray-500 text-center mt-2">
                Marca todos los requisitos para continuar
              </p>
            )}
          </motion.div>
        )}

        {/* ── PASO 3: SETUP DE PAGOS ───────────────────────────────── */}
        {step === 'setup' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="text-center mb-8">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isStripeActive ? 'bg-green-500/20' : isAdultCreator ? 'bg-pink-500/20' : 'bg-brand-500/20'}`}>
                <FiCheck className={isStripeActive ? 'text-green-400' : isAdultCreator ? 'text-pink-400' : 'text-brand-400'} size={30} />
              </div>
              <h1 className="text-2xl font-black text-white mb-2">
                {isAdultCreator ? 'Ya eres Creador Adulto' : 'Ya eres Creador'}
              </h1>
              <p className="text-gray-400 text-sm">
                {isStripeActive
                  ? 'Tu cuenta de pagos está activa. ¡Puedes empezar a ganar!'
                  : 'Configura tus pagos para poder cobrar por tu contenido.'}
              </p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="card p-4 flex items-center gap-3 border-green-500/30">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <FiCheck className="text-green-400" size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">Cuenta de creador activa</p>
                  <p className="text-gray-500 text-xs">
                    {isAdultCreator ? 'Modo adulto +18 habilitado' : 'Modo general'}
                  </p>
                </div>
              </div>

              <div className={`card p-4 flex items-center gap-3 ${isStripeActive ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isStripeActive ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                  <FiCheck className={isStripeActive ? 'text-green-400' : 'text-yellow-400'} size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">
                    {isStripeActive ? 'Pagos configurados' : 'Configura tus pagos'}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {isStripeActive ? 'Listo para recibir dinero' : 'Necesario para retirar ganancias'}
                  </p>
                </div>
              </div>

              {isAdultCreator && (
                <div className="card p-4 flex items-center gap-3 border-pink-500/30">
                  <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0">
                    <FiShield className="text-pink-400" size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">Verificación de identidad</p>
                    <p className="text-gray-500 text-xs">Sube tu ID + selfie desde el panel del creador</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upgrade a adult: solo si NO es ya adulto */}
            {!isAdultCreator && (
              <div className="card p-4 mb-6 bg-pink-500/5 border-pink-500/20">
                <p className="text-pink-300 text-xs font-semibold mb-1 flex items-center gap-1.5">
                  <FiHeart size={12} /> ¿Quieres publicar contenido +18?
                </p>
                <p className="text-gray-400 text-xs leading-relaxed mb-3">
                  Puedes upgradearte a Creador Adulto en cualquier momento. Tu sección general permanece intacta.
                </p>
                <button
                  onClick={() => { setCreatorType('adult'); setStep('adult-terms'); }}
                  className="text-pink-400 text-xs font-medium hover:text-pink-300 flex items-center gap-1"
                >
                  Upgradearme a Creador Adulto <FiArrowRight size={12} />
                </button>
              </div>
            )}

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
      </AnimatePresence>
    </div>
  );
}
