import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiMail } from 'react-icons/fi';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@destino.app';

const FAQS = [
  {
    category: 'Cuenta',
    items: [
      {
        q: '¿Cómo cambio mi contraseña?',
        a: 'Ve a Configuración → toca tu email → "¿Olvidaste tu contraseña?". Te enviaremos un enlace de restablecimiento.',
      },
      {
        q: '¿Cómo elimino mi cuenta?',
        a: 'Ve a Configuración → "Eliminar cuenta" al final de la página. Esta acción es permanente e irreversible.',
      },
      {
        q: '¿Puedo cambiar mi email?',
        a: 'Por seguridad, el email no se puede cambiar directamente. Escríbenos a soporte y lo gestionamos manualmente.',
      },
    ],
  },
  {
    category: 'Matches y swipes',
    items: [
      {
        q: '¿Por qué no aparecen perfiles?',
        a: 'Asegúrate de tener tu perfil completo (foto, edad, intereses). También verifica los filtros en Home → ícono de filtro.',
      },
      {
        q: '¿Cuántos swipes puedo dar al día?',
        a: 'Los usuarios gratuitos tienen 50 swipes diarios. Con Premium los swipes son ilimitados.',
      },
      {
        q: '¿Puedo deshacer un swipe?',
        a: 'Sí, los usuarios Premium pueden deshacer el último swipe con el botón de retroceso en la pantalla de inicio.',
      },
      {
        q: '¿Los matches expiran?',
        a: 'Sí. Si no inicias una conversación en 7 días, el match expira automáticamente.',
      },
    ],
  },
  {
    category: 'Chat y mensajes',
    items: [
      {
        q: '¿Puedo enviar fotos en el chat?',
        a: 'Sí, toca el ícono de imagen en el chat. También puedes enviar mensajes de voz con el ícono de micrófono.',
      },
      {
        q: '¿Cómo sé si mi mensaje fue leído?',
        a: 'Los mensajes muestran un doble check cuando han sido leídos por la otra persona.',
      },
      {
        q: '¿Puedo fijar mensajes?',
        a: 'Sí. Mantén pulsado un mensaje y selecciona "Fijar". Verás el mensaje fijado en la parte superior del chat.',
      },
      {
        q: '¿Cómo borro un mensaje?',
        a: 'Mantén pulsado el mensaje → "Eliminar". Solo puedes eliminar tus propios mensajes.',
      },
    ],
  },
  {
    category: 'Premium',
    items: [
      {
        q: '¿Qué incluye Premium?',
        a: 'Swipes ilimitados, deshacer último swipe, ver quién te dio like, modo incógnito, boost de perfil, sin anuncios y acceso prioritario a funciones nuevas.',
      },
      {
        q: '¿Cómo cancelo mi suscripción?',
        a: 'Ve a Configuración → Premium → "Cancelar suscripción". Mantendrás el acceso hasta el final del período pagado.',
      },
      {
        q: '¿Hacen reembolsos?',
        a: 'No realizamos reembolsos por períodos parciales, salvo que la ley lo exija. Si tienes un problema técnico, contáctanos.',
      },
    ],
  },
  {
    category: 'Videollamadas y Shows',
    items: [
      {
        q: '¿Cómo inicio una videollamada?',
        a: 'Dentro de un chat activo, toca el ícono de cámara en la parte superior derecha.',
      },
      {
        q: '¿Qué son los Shows en vivo?',
        a: 'Los creadores verificados pueden transmitir en vivo. Puedes acceder desde la sección Video. Algunas transmisiones son gratuitas, otras requieren entrada (ticket).',
      },
      {
        q: '¿Para qué sirven los Coins?',
        a: 'Los Coins se usan para comprar tickets de shows, enviar propinas a creadores y desbloquear contenido exclusivo (PPV).',
      },
    ],
  },
  {
    category: 'Privacidad y seguridad',
    items: [
      {
        q: '¿Quién puede ver mi perfil?',
        a: 'Solo usuarios verificados dentro de la app. Activa el modo incógnito (Premium) para aparecer solo a quienes hayas dado like.',
      },
      {
        q: '¿Cómo reporto a alguien?',
        a: 'Ve al perfil del usuario → toca los tres puntos (⋯) → "Reportar". Revisamos todos los reportes manualmente.',
      },
      {
        q: '¿Cómo bloqueo a alguien?',
        a: 'Ve al perfil del usuario → toca los tres puntos (⋯) → "Bloquear". También puedes gestionar bloqueados desde Configuración.',
      },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-start gap-3 w-full py-4 text-left"
      >
        <span className="flex-1 text-sm font-medium text-white leading-snug">{q}</span>
        {open
          ? <FiChevronUp size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />
          : <FiChevronDown size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />}
      </button>
      {open && (
        <p className="text-sm text-gray-400 leading-relaxed pb-4 pr-6">{a}</p>
      )}
    </div>
  );
}

export default function Help() {
  return (
    <div className="min-h-screen bg-dark-900 px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-2xl mx-auto">
        <Link to="/settings" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors">
          <FiArrowLeft size={16} /> Configuración
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Centro de Ayuda</h1>
        <p className="text-gray-500 text-sm mb-10">Respuestas a las preguntas más frecuentes</p>

        <div className="space-y-6">
          {FAQS.map(section => (
            <div key={section.category} className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h2 className="text-sm font-bold text-brand-400 uppercase tracking-wider">{section.category}</h2>
              </div>
              <div className="px-4">
                {section.items.map(item => (
                  <FAQItem key={item.q} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 card p-5 text-center">
          <p className="text-sm text-gray-300 mb-1">¿No encontraste lo que buscabas?</p>
          <p className="text-xs text-gray-500 mb-4">Escríbenos y te respondemos en menos de 24 horas.</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 btn-primary text-sm px-6"
          >
            <FiMail size={15} />
            Contactar soporte
          </a>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500 justify-center flex-wrap">
          <Link to="/support" className="hover:text-brand-400 transition-colors font-bold">📩 Contacto / Soporte</Link>
          <Link to="/terms" className="hover:text-brand-400 transition-colors">Términos de Servicio</Link>
          <Link to="/privacy" className="hover:text-brand-400 transition-colors">Política de Privacidad</Link>
          <Link to="/dmca" className="hover:text-brand-400 transition-colors">DMCA / Copyright</Link>
        </div>
      </div>
    </div>
  );
}
