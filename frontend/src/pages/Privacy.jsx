import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';
const LAST_UPDATED = '19 de mayo de 2026';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="max-w-3xl mx-auto relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Política de Privacidad</h1>
        <p className="text-gray-500 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Quiénes somos</h2>
            <p>
              Destino TV es una aplicación de citas y conexión social operada por{' '}
              <strong className="text-white">OC Moon Group LLC</strong>, sociedad de responsabilidad limitada
              constituida en Estados Unidos. "Destino TV" es la marca comercial bajo la cual OC Moon Group LLC
              presta los servicios descritos en esta política.
            </p>
            <p className="mt-2">
              <strong className="text-white">OC Moon Group LLC</strong> es el responsable del tratamiento de tus datos
              personales (data controller bajo GDPR Art. 4(7), LGPD Art. 5-VI y LFPDPPP Art. 3-XIV).
            </p>
            <p className="mt-2">
              Para asuntos de privacidad y protección de datos, contacta a nuestro Data Protection Officer (DPO):{' '}
              <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a>.
            </p>
            <p className="mt-2">
              Para soporte general: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Detalles completos de entidad legal, DPO, DMCA Agent y Custodian 2257 en <Link to="/compliance" className="text-brand-400 hover:underline">/compliance</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Datos que recopilamos</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (cifrada), fecha de registro.</li>
              <li><strong>Datos de perfil:</strong> edad, género, país, idioma, foto de perfil, fotografías adicionales y biografía que tú proporcionas voluntariamente.</li>
              <li><strong>Datos de uso:</strong> matches, mensajes (almacenados de forma segura), sesiones de video (metadatos, no contenido), likes y actividad en la app.</li>
              <li><strong>Datos de pago:</strong> gestionados exclusivamente por Stripe. Destino TV no almacena números de tarjeta ni datos bancarios.</li>
              <li><strong>Datos de dispositivo:</strong> tipo de dispositivo, sistema operativo y dirección IP para seguridad y diagnóstico.</li>
              <li><strong>Publicidad:</strong> Google AdMob puede recopilar datos de publicidad según su propia política. Puedes optar por no participar desde la configuración de tu dispositivo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Para qué usamos tus datos</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>Crear y gestionar tu cuenta.</li>
              <li>Mostrarte perfiles compatibles y facilitar conexiones.</li>
              <li>Procesar pagos de suscripción Premium.</li>
              <li>Enviar notificaciones push sobre matches y mensajes.</li>
              <li>Mejorar la seguridad y prevenir el fraude.</li>
              <li>Cumplir obligaciones legales.</li>
              <li>Mostrar publicidad relevante a través de Google AdMob (solo en la versión gratuita).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Base legal</h2>
            <p>El tratamiento de tus datos se basa en: (a) la ejecución del contrato de uso de la app; (b) tu consentimiento explícito para notificaciones y publicidad; (c) nuestro interés legítimo en seguridad y mejora del servicio.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Compartición de datos</h2>
            <p>No vendemos tus datos. Compartimos información solo con proveedores de servicio (subprocesadores) bajo Acuerdos de Tratamiento de Datos (DPA):</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>Supabase</strong> — base de datos + autenticación.</li>
              <li><strong>Stripe / CCBill</strong> — procesamiento de pagos.</li>
              <li><strong>LiveKit</strong> — videollamadas y shows.</li>
              <li><strong>OpenAI, Sightengine</strong> — moderación.</li>
              <li><strong>Sentry, PostHog</strong> — diagnóstico + analítica.</li>
              <li><strong>Cloudflare, Railway, Backblaze, Bunny.net</strong> — infra + CDN + storage.</li>
              <li><strong>Google AdMob</strong> — publicidad (versión gratuita).</li>
              <li>Autoridades legales cuando sea requerido por ley.</li>
            </ul>
            <p className="mt-3 text-sm">
              Lista exhaustiva y actualizada en{' '}
              <Link to="/privacy/subprocessors" className="text-brand-400 hover:underline">/privacy/subprocessors</Link>.
              Notificaremos cualquier cambio con 30 días de antelación.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5.1 Contenido adulto y categorías especiales (GDPR Art. 9)</h2>
            <p>
              Las plataformas como Destino TV pueden procesar datos sobre orientación sexual, preferencias o
              contenido sexualmente explícito. Estos son <strong>datos de categoría especial</strong> bajo GDPR Art. 9
              y requieren consentimiento explícito separado.
            </p>
            <p className="mt-3">
              Cuando activas la sección adulta, marcas tu orientación sexual, o consumes contenido adult, te
              pedimos consentimiento explícito específico. Puedes retirarlo en cualquier momento desde{' '}
              <Link to="/privacy/preferences" className="text-brand-400 hover:underline">Preferencias de privacidad</Link>.
            </p>
            <p className="mt-3 text-sm">
              Detalle del tratamiento de estos datos en{' '}
              <Link to="/privacy/processing" className="text-brand-400 hover:underline">Records of Processing</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Retención de datos</h2>
            <p>Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, borramos tus datos personales en un plazo máximo de 30 días, excepto los que debamos conservar por obligaciones legales (p. ej., registros de transacciones por 5 años).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Tus derechos</h2>
            <p>De acuerdo con GDPR (UE), LGPD (Brasil) y LFPDPPP (México), tienes los siguientes derechos sobre tus datos personales:</p>
            <ul className="list-disc list-inside space-y-1.5 mt-3">
              <li><strong>Acceso</strong> — solicitar copia de los datos que tenemos sobre ti.</li>
              <li><strong>Rectificación</strong> — corregir datos inexactos o incompletos.</li>
              <li><strong>Eliminación</strong> ("derecho al olvido") — eliminar tu cuenta y datos asociados.</li>
              <li><strong>Portabilidad</strong> — descargar tus datos en formato JSON estructurado.</li>
              <li><strong>Oposición y limitación</strong> — restringir ciertos tratamientos.</li>
              <li><strong>Retiro de consentimiento</strong> — granular por finalidad (analítica, marketing, publicidad, etc.).</li>
            </ul>
            <p className="mt-3">
              Para ejercer estos derechos directamente:
            </p>
            <ul className="list-disc list-inside space-y-1.5 mt-2">
              <li><Link to="/privacy/preferences" className="text-brand-400 hover:underline">Preferencias de privacidad</Link> — gestionar consentimientos granulares.</li>
              <li>Configuración → Descargar mis datos — exportación JSON inmediata.</li>
              <li>Configuración → Eliminar cuenta — eliminación con periodo de gracia de 30 días.</li>
              <li>Email al DPO: <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Seguridad</h2>
            <p>Usamos cifrado en tránsito (HTTPS/TLS), autenticación JWT, Row Level Security en base de datos y acceso mínimo necesario a los datos.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8.1 Transferencias internacionales de datos</h2>
            <p>
              OC Moon Group LLC procesa datos en Estados Unidos. Para transferencias de datos personales desde la
              Unión Europea, Reino Unido, Suiza u otros países con leyes de protección de datos similares, aplicamos
              los siguientes mecanismos de transferencia:
            </p>
            <ul className="list-disc list-inside space-y-1.5 mt-3">
              <li>
                <strong>Standard Contractual Clauses (SCC)</strong> de la Comisión Europea — Decisión 2021/914
                (Module Two: Controller-to-Processor) — firmadas con todos nuestros sub-procesadores que tratan datos UE.
              </li>
              <li>
                <strong>UK International Data Transfer Addendum</strong> (IDTA) — para transferencias desde Reino Unido.
              </li>
              <li>
                <strong>Supplementary measures</strong>: encriptación AES-256 en reposo, TLS 1.3 en tránsito,
                segregación de datos por región cuando es posible.
              </li>
            </ul>
            <p className="mt-3">
              Para Schrems II compliance, evaluamos continuamente las leyes del país destino (Estados Unidos)
              y aplicamos las medidas técnicas y organizativas necesarias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8.2 California (CCPA / CPRA)</h2>
            <p>
              Si eres residente de California, tienes derechos adicionales bajo Cal. Civ. Code §§ 1798.100-1798.199.100:
            </p>
            <ul className="list-disc list-inside space-y-1.5 mt-3">
              <li>Derecho a saber qué información personal recopilamos sobre ti.</li>
              <li>Derecho a optar por no participar en la "venta" o "compartición" de información personal.</li>
              <li>Derecho a no ser discriminado por ejercer estos derechos.</li>
              <li>Derecho a corregir información personal inexacta.</li>
              <li>Derecho a limitar el uso de información sensible.</li>
            </ul>
            <p className="mt-3">
              Para ejercer el derecho de opt-out: <Link to="/privacy/ccpa" className="text-brand-400 hover:underline">Do Not Sell or Share My Information</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Menores de edad</h2>
            <p>Destino TV está dirigida exclusivamente a mayores de 18 años. No recopilamos datos de menores de forma intencionada. Si detectas un perfil de un menor, repórtalo inmediatamente.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Cambios en esta política</h2>
            <p>Notificaremos cambios significativos mediante un aviso en la app. El uso continuado tras la notificación implica aceptación.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Contacto</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li>DPO / Privacidad: <a href="mailto:dpo@destino.app" className="text-brand-400 hover:underline">dpo@destino.app</a></li>
              <li>Soporte general: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a></li>
              <li>Legal: <a href="mailto:legal@destino.app" className="text-brand-400 hover:underline">legal@destino.app</a></li>
            </ul>
            <p className="mt-3 text-sm">
              Información legal completa en <Link to="/compliance" className="text-brand-400 hover:underline">/compliance</Link>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 flex-wrap">
          <Link to="/terms"        className="hover:text-brand-400 transition-colors">Términos de Servicio</Link>
          <Link to="/dmca"         className="hover:text-brand-400 transition-colors">DMCA</Link>
          <Link to="/2257"         className="hover:text-brand-400 transition-colors">2257</Link>
          <Link to="/compliance"   className="hover:text-brand-400 transition-colors">Compliance</Link>
          <Link to="/transparency" className="hover:text-brand-400 transition-colors">Transparency</Link>
          <Link to="/" className="hover:text-brand-400 transition-colors">Inicio</Link>
        </div>
      </div>
    </div>
  );
}
