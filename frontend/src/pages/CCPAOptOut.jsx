import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';

export default function CCPAOptOut() {
  const { user } = useAuthStore();
  const [optedOut, setOptedOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      if (user) {
        await api.post('/api/consents/bulk', {
          consents: { ccpa_optout: true, data_sale: false, thirdparty_share: false },
        });
      }
      try {
        localStorage.setItem('destino_ccpa_optout', JSON.stringify({
          opted_out_at: new Date().toISOString(),
        }));
      } catch {}
      setOptedOut(true);
      toast.success('Opt-out registrado');
    } catch (err) {
      toast.error('Error registrando opt-out');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-2xl mx-auto relative z-10">
        <Link to="/privacy" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
            <FiShield className="text-brand-400" size={22} />
          </div>
          <h1 className="text-3xl font-black gradient-text">Do Not Sell or Share My Information</h1>
        </div>
        <p className="text-gray-500 text-sm mb-10">CCPA / CPRA — California Consumer Privacy Act</p>

        <div className="space-y-6 text-gray-300 leading-relaxed">

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-3">Tu derecho bajo CCPA</h2>
            <p>
              Si eres residente de California, la Ley de Privacidad del Consumidor de California (Cal. Civ. Code §§ 1798.100–1798.199.100)
              te otorga el derecho a optar por no participar en la "venta" o "compartición" de tu información personal.
            </p>
            <p className="mt-3">
              <strong className="text-white">OC Moon Group LLC no vende información personal por dinero.</strong> Sin embargo, ciertas
              prácticas de compartición de datos con proveedores analíticos y publicitarios (Google AdMob, PostHog, Sentry)
              pueden ser interpretadas como "compartición" bajo CCPA. Esta página te permite optar por no participar.
            </p>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-3">Datos que compartimos</h2>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li><strong className="text-white">Identificadores de dispositivo</strong> con Google AdMob para servir anuncios.</li>
              <li><strong className="text-white">Eventos de uso</strong> con PostHog para analítica de producto.</li>
              <li><strong className="text-white">Errores de aplicación</strong> con Sentry para diagnóstico técnico.</li>
            </ul>
            <p className="mt-3 text-sm text-gray-400">
              Al optar por no participar, dejaremos de compartir tus datos con los dos primeros. Sentry sigue procesando errores ya que es
              esencial para la seguridad y estabilidad del servicio (legitimate interest bajo GDPR Art. 6(1)(f)).
            </p>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-3">Ejercer el opt-out</h2>
            {optedOut ? (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <FiCheckCircle className="text-emerald-400 mt-0.5 shrink-0" size={20} />
                <div>
                  <p className="font-bold text-white">Opt-out registrado</p>
                  <p className="text-sm text-gray-300 mt-1">
                    Tu solicitud fue procesada. A partir de ahora, OC Moon Group LLC no compartirá tu información con
                    proveedores analíticos ni publicitarios.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm">
                  Al hacer clic en "Optar por no participar", solicitas que OC Moon Group LLC deje de compartir tu
                  información personal con los proveedores indicados arriba.
                </p>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="mt-4 w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Procesando…' : 'Optar por no participar (Do Not Sell or Share)'}
                </button>
                {!user && (
                  <p className="text-xs text-gray-500 mt-3">
                    Sin iniciar sesión, el opt-out se guarda solo en este dispositivo.
                    Para opt-out permanente cross-device, inicia sesión.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-3">Authorized agent</h2>
            <p className="text-sm">
              Si actúas como agente autorizado por un residente de California, envía la solicitud a{' '}
              <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a> con
              poder notarial o autorización escrita.
            </p>
          </section>

          <section className="glass-strong rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-3">No-discrimination</h2>
            <p className="text-sm">
              Bajo Cal. Civ. Code § 1798.125, OC Moon Group LLC no discriminará contra usuarios que ejerzan sus derechos
              CCPA. Tu acceso, precios y calidad de servicio no se verán afectados por solicitar este opt-out.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 flex-wrap">
          <Link to="/privacy"    className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/compliance" className="hover:text-brand-400 transition-colors">Compliance</Link>
          <Link to="/"           className="hover:text-brand-400 transition-colors">Inicio</Link>
        </div>
      </div>
    </div>
  );
}
