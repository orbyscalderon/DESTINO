import { Link } from 'react-router-dom';
import { FiArrowLeft, FiArchive, FiImage, FiMessageSquare, FiTag, FiGlobe, FiClock, FiCpu, FiHeart, FiCalendar, FiZap } from 'react-icons/fi';

const SECTIONS = [
  { to: '/creator/vault',         icon: FiArchive,     title: 'Vault',           desc: 'Tu biblioteca privada de contenido reusable' },
  { to: '/creator/collections',   icon: FiImage,       title: 'Photo Collections', desc: 'Sets de fotos pagas — vender N fotos como un único PPV' },
  { to: '/creator/dm-pricing',    icon: FiMessageSquare, title: 'DM Pricing',    desc: 'Cobrar por DM recibido (paywall) o por mensaje (sexting)' },
  { to: '/creator/promo-codes',   icon: FiTag,         title: 'Promo Codes',     desc: 'Descuentos para suscripciones y collections' },
  { to: '/creator/geo-block',     icon: FiGlobe,       title: 'Geo Block',       desc: 'Bloquear contenidos en países específicos' },
  { to: '/creator/auto-reply',    icon: FiClock,       title: 'Auto-Reply',      desc: 'Respuestas automáticas + quick replies' },
  { to: '/creator/ai-persona',    icon: FiCpu,         title: 'AI Persona',      desc: 'Asistente IA que responde como vos cuando estás offline' },
  { to: '/creator/top-fans',      icon: FiHeart,       title: 'Top Fans',        desc: 'Quiénes más gastan + badges de loyalty' },
  { to: '/creator/scheduled',     icon: FiCalendar,    title: 'Scheduled',       desc: 'Programar posts y reels' },
  { to: '/creator/welcome-message', icon: FiZap,       title: 'Welcome Message', desc: 'DM automático al nuevo sub (con PPV opcional)' },
  { to: '/creator/mass-dm',       icon: FiMessageSquare, title: 'Mass DM',       desc: 'Broadcast a todos los subs por tier' },
];

export default function CreatorMonetizationHub() {
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link to="/creator/dashboard" className="inline-flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg mb-8 transition-colors">
          <FiArrowLeft size={16} /> Volver al dashboard
        </Link>

        <h1 className="text-3xl font-black gradient-text mb-2">Monetización</h1>
        <p className="text-gray-500 text-sm mb-10">
          11 herramientas para maximizar tu revenue como creator
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SECTIONS.map(s => (
            <Link
              key={s.to}
              to={s.to}
              className="glass-strong rounded-2xl p-5 border border-white/5 hover:border-brand-500/30 hover:bg-white/[0.04] transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 group-hover:scale-110 transition-transform shrink-0">
                  <s.icon className="text-brand-400" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{s.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
