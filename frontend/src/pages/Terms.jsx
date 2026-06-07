import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';
const LAST_UPDATED = '19 de mayo de 2026';

export default function Terms() {
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Términos de Servicio</h1>
        <p className="text-gray-500 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Aceptación</h2>
            <p>Al crear una cuenta o usar Destino TV, aceptas estos Términos de Servicio. Si no estás de acuerdo, no uses la aplicación. Debes tener al menos 18 años para usar Destino TV.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Tu cuenta</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>Eres responsable de mantener la seguridad de tu cuenta y contraseña.</li>
              <li>Debes proporcionar información veraz en tu perfil.</li>
              <li>Solo puedes tener una cuenta por persona.</li>
              <li>No puedes ceder o vender tu cuenta a terceros.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Conducta prohibida</h2>
            <p>Está estrictamente prohibido:</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li>Acosar, intimidar o amenazar a otros usuarios.</li>
              <li>Publicar contenido sexual explícito no solicitado.</li>
              <li>Hacerse pasar por otra persona o crear perfiles falsos.</li>
              <li>Usar la plataforma con fines comerciales sin autorización.</li>
              <li>Intentar acceder a cuentas ajenas o vulnerar la seguridad.</li>
              <li>Publicar contenido ilegal, violento, racista o que incite al odio.</li>
              <li>Usar bots, scrapers o herramientas automatizadas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Contenido del usuario</h2>
            <p>Conservas los derechos sobre el contenido que publicas (fotos, textos). Al publicarlo, nos otorgas una licencia mundial, no exclusiva y libre de regalías para mostrarlo dentro de la plataforma. Eres el único responsable del contenido que compartes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Plan Premium</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>El plan Premium se factura mensualmente a través de Stripe.</li>
              <li>Puedes cancelar en cualquier momento desde la sección Premium; el acceso continúa hasta el final del período pagado.</li>
              <li>No realizamos reembolsos por períodos parciales, salvo que la ley lo exija.</li>
              <li>Los precios pueden cambiar con previo aviso de 30 días.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Publicidad</h2>
            <p>Los usuarios del plan gratuito verán anuncios proporcionados por Google AdMob. Los usuarios Premium no verán anuncios. Los ingresos por publicidad nos ayudan a mantener el servicio gratuito.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Disponibilidad del servicio</h2>
            <p>Nos esforzamos por mantener Destino TV disponible 24/7, pero no garantizamos un tiempo de actividad del 100%. Podemos interrumpir el servicio por mantenimiento, seguridad o causas de fuerza mayor sin previo aviso.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Limitación de responsabilidad</h2>
            <p>Destino TV es una plataforma de conexión entre personas. No somos responsables de las acciones de los usuarios entre sí. No garantizamos que encuentres pareja ni que las conexiones sean exitosas. En ningún caso nuestra responsabilidad superará el importe pagado por ti en los últimos 12 meses.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Suspensión y cancelación</h2>
            <p>Podemos suspender o eliminar tu cuenta sin previo aviso si incumples estos términos. Puedes eliminar tu cuenta en cualquier momento desde Configuración → Eliminar cuenta. Esto elimina permanentemente todos tus datos.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Modificaciones</h2>
            <p>Podemos actualizar estos términos. Te notificaremos mediante un aviso en la app con al menos 7 días de antelación para cambios materiales. El uso continuado tras la notificación implica aceptación.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Contacto</h2>
            <p>Para cualquier consulta: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a></p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500">
          <Link to="/privacy" className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/" className="hover:text-brand-400 transition-colors">Inicio</Link>
        </div>
      </div>
    </div>
  );
}
