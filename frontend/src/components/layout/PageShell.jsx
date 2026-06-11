import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';

// Shell estándar para páginas internas (creator/, /privacy/*, etc).
// Reemplaza el patrón repetitivo de:
//   <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
//     <Link to=".." className="...">Volver</Link>
//     <div className="flex items-center gap-3 mb-2"><Icon /><h1 className="gradient-text" /></div>
//     <p className="text-gray-500" />
//
// Props:
//   icon:      componente de react-icons (FiX, etc)
//   title:     string
//   subtitle:  string (opcional)
//   backTo:    ruta (default '/')
//   backLabel: string (default 'Volver')
//   actions:   ReactNode (botones a la derecha del hero)
//   maxWidth:  'xl' | '2xl' | '3xl' | '4xl' | '5xl' (default '3xl')
//   orbs:      bool — pinta glow orbs decorativos en background (default true)
//   children:  contenido principal

const MAX_W = {
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

export default function PageShell({
  icon: Icon,
  title,
  subtitle,
  backTo = '/',
  backLabel = 'Volver',
  actions,
  maxWidth = '3xl',
  orbs = true,
  children,
}) {
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      {orbs && (
        <>
          <div className="glow-orb glow-orb-brand top-[-80px] left-1/2 -translate-x-1/2 w-[420px] h-[420px]" />
          <div className="glow-orb glow-orb-accent bottom-[-100px] right-[-80px] w-[320px] h-[320px]"
            style={{ animationDelay: '1.2s' }} />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
        className={`${MAX_W[maxWidth] || MAX_W['3xl']} mx-auto relative z-10`}
      >
        <Link to={backTo} className="back-link mb-8">
          <FiArrowLeft size={16} /> {backLabel}
        </Link>

        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              {Icon && (
                <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 shadow-glow-sm">
                  <Icon className="text-brand-400" size={20} />
                </div>
              )}
              <h1 className="page-hero-title">{title}</h1>
            </div>
            {subtitle && <p className="page-hero-desc">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>

        {children}
      </motion.div>
    </div>
  );
}
