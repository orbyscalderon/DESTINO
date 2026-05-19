import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';
const LAST_UPDATED = '19 de mayo de 2026';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-dark-900 px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Política de Privacidad</h1>
        <p className="text-gray-500 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Quiénes somos</h2>
            <p>Destino es una aplicación de citas y conexión social. El responsable del tratamiento de tus datos es el operador de Destino, contactable en <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Datos que recopilamos</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (cifrada), fecha de registro.</li>
              <li><strong>Datos de perfil:</strong> edad, género, país, idioma, foto de perfil, fotografías adicionales y biografía que tú proporcionas voluntariamente.</li>
              <li><strong>Datos de uso:</strong> matches, mensajes (almacenados de forma segura), sesiones de video (metadatos, no contenido), likes y actividad en la app.</li>
              <li><strong>Datos de pago:</strong> gestionados exclusivamente por Stripe. Destino no almacena números de tarjeta ni datos bancarios.</li>
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
            <p>No vendemos tus datos. Compartimos información solo con:</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong>Supabase</strong> — almacenamiento de base de datos y autenticación.</li>
              <li><strong>Stripe</strong> — procesamiento de pagos.</li>
              <li><strong>Agora</strong> — infraestructura de videollamadas (metadatos de sesión).</li>
              <li><strong>Google AdMob</strong> — publicidad (datos de dispositivo y uso).</li>
              <li>Autoridades legales cuando sea requerido por ley.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Retención de datos</h2>
            <p>Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, borramos tus datos personales en un plazo máximo de 30 días, excepto los que debamos conservar por obligaciones legales (p. ej., registros de transacciones por 5 años).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Tus derechos</h2>
            <p>Tienes derecho a acceder, rectificar, eliminar, portar y oponerte al tratamiento de tus datos. Para ejercerlos, escríbenos a <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a>. También puedes eliminar tu cuenta directamente desde Configuración → Eliminar cuenta.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Seguridad</h2>
            <p>Usamos cifrado en tránsito (HTTPS/TLS), autenticación JWT, Row Level Security en base de datos y acceso mínimo necesario a los datos.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Menores de edad</h2>
            <p>Destino está dirigida exclusivamente a mayores de 18 años. No recopilamos datos de menores de forma intencionada. Si detectas un perfil de un menor, repórtalo inmediatamente.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Cambios en esta política</h2>
            <p>Notificaremos cambios significativos mediante un aviso en la app. El uso continuado tras la notificación implica aceptación.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Contacto</h2>
            <p>Para cualquier consulta sobre privacidad: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-400 hover:underline">{SUPPORT_EMAIL}</a></p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500">
          <Link to="/terms" className="hover:text-brand-400 transition-colors">Términos de Servicio</Link>
          <Link to="/" className="hover:text-brand-400 transition-colors">Inicio</Link>
        </div>
      </div>
    </div>
  );
}
