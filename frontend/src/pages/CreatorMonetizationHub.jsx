import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArchive, FiImage, FiMessageSquare, FiTag, FiGlobe, FiClock, FiCpu,
  FiHeart, FiCalendar, FiZap, FiFilm, FiUserPlus, FiTrendingUp,
} from 'react-icons/fi';
import PageShell from '../components/layout/PageShell.jsx';

const SECTIONS = [
  { to: '/creator/vault',           icon: FiArchive,       title: 'Vault',             desc: 'Tu biblioteca privada de contenido reusable',                          tone: 'brand'  },
  { to: '/creator/collections',     icon: FiImage,         title: 'Photo Collections', desc: 'Sets de fotos pagas — vender N fotos como un único PPV',               tone: 'brand'  },
  { to: '/creator/video-series',    icon: FiFilm,          title: 'Video Series',      desc: 'Agrupá N videos como serie vendible (paga o gratis)',                  tone: 'brand'  },
  { to: '/creator/costars',         icon: FiUserPlus,      title: 'Co-stars',          desc: 'Invitaciones para aparecer en videos de otros creators',               tone: 'accent' },
  { to: '/creator/dm-pricing',      icon: FiMessageSquare, title: 'DM Pricing',        desc: 'Cobrá por DM recibido (paywall) o por mensaje (sexting)',              tone: 'brand'  },
  { to: '/creator/promo-codes',     icon: FiTag,           title: 'Promo Codes',       desc: 'Descuentos para suscripciones y collections',                          tone: 'accent' },
  { to: '/creator/geo-block',       icon: FiGlobe,         title: 'Geo Block',         desc: 'Bloquear contenidos en países específicos',                            tone: 'accent' },
  { to: '/creator/auto-reply',      icon: FiClock,         title: 'Auto-Reply',        desc: 'Respuestas automáticas + quick replies',                               tone: 'brand'  },
  { to: '/creator/ai-persona',      icon: FiCpu,           title: 'AI Persona',        desc: 'Asistente IA que responde como vos cuando estás offline',              tone: 'accent' },
  { to: '/creator/top-fans',        icon: FiHeart,         title: 'Top Fans',          desc: 'Quiénes más gastan + badges de loyalty',                               tone: 'brand'  },
  { to: '/creator/scheduled',       icon: FiCalendar,      title: 'Scheduled',         desc: 'Programar posts y reels',                                              tone: 'accent' },
  { to: '/creator/welcome-message', icon: FiZap,           title: 'Welcome Message',   desc: 'DM automático al nuevo sub (con PPV opcional)',                        tone: 'brand'  },
  { to: '/creator/mass-dm',         icon: FiMessageSquare, title: 'Mass DM',           desc: 'Broadcast a todos los subs por tier',                                  tone: 'accent' },
];

export default function CreatorMonetizationHub() {
  return (
    <PageShell
      icon={FiTrendingUp}
      title="Monetización"
      subtitle="13 herramientas para maximizar tu revenue como creator."
      backTo="/creator/dashboard"
      backLabel="Volver al dashboard"
      maxWidth="4xl"
    >
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {SECTIONS.map(s => <SectionCard key={s.to} s={s} />)}
      </motion.div>
    </PageShell>
  );
}

function SectionCard({ s }) {
  const iconTint = s.tone === 'accent'
    ? 'bg-accent-500/10 border-accent-500/20 text-accent-400'
    : 'bg-brand-500/10 border-brand-500/20 text-brand-400';

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 18 },
        show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 22 } },
      }}
    >
      <Link
        to={s.to}
        className="card-interactive h-full p-5 flex items-start gap-4 group"
      >
        <div className={`p-2.5 rounded-xl border ${iconTint} transition-transform duration-300 ease-out-back group-hover:scale-110 group-hover:-rotate-3 shrink-0`}>
          <s.icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{s.title}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{s.desc}</p>
        </div>
      </Link>
    </motion.div>
  );
}
