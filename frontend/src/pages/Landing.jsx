import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { FiHeart, FiVideo, FiMessageCircle, FiZap } from 'react-icons/fi';
import { supabase } from '../lib/supabase.js';

const features = [
  { icon: FiHeart, title: 'Swipe & Match', desc: 'Desliza perfiles, da likes y descubre con quién hay química real.' },
  { icon: FiMessageCircle, title: 'Chat en tiempo real', desc: 'Mensajería instantánea con tus matches. Premium: sin límites.' },
  { icon: FiVideo, title: 'Video aleatorio', desc: 'Videollamadas con desconocidos. Premium: elige el género.' },
  { icon: FiZap, title: 'Perfil destacado', desc: 'Aparece primero en el feed y consigue más matches.' },
];

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();
        navigate(profile?.username ? '/home' : '/onboarding', { replace: true });
      }
    };
    checkSession();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-dark-900 overflow-hidden">
      {/* Hero */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {/* Fondo con gradiente */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-transparent to-dark-900 pointer-events-none" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 sm:w-[500px] sm:h-[500px] bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 space-y-6"
        >
          <div className="text-7xl mb-4">💕</div>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight">
            <span className="gradient-text">Destino TV</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-300 max-w-md mx-auto leading-relaxed px-2">
            Conoce personas reales. Conecta en video. Descubre Destino TV.
          </p>

          <div className="flex flex-col gap-3 justify-center pt-4 w-full max-w-xs mx-auto sm:max-w-none sm:flex-row sm:gap-4">
            <Link to="/register" className="btn-primary text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4">
              Comenzar gratis
            </Link>
            <Link to="/login" className="btn-secondary text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4">
              Iniciar sesión
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12 gradient-text"
          >
            Todo lo que necesitas
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.08 }}
                className="card p-5 hover:border-brand-500/30 transition-colors"
              >
                <div className="w-12 h-12 bg-brand-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={22} className="text-brand-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium CTA */}
      <section className="py-20 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-md mx-auto card p-8 text-center bg-gradient-to-br from-brand-500/10 to-yellow-500/5 border-brand-500/20"
        >
          <div className="text-4xl mb-4">⚡</div>
          <h3 className="text-2xl font-bold mb-2">Premium por solo $20/mes</h3>
          <p className="text-gray-400 text-sm mb-6">Chat ilimitado, filtros de video, ver quién te dio like y más.</p>
          <Link to="/register" className="btn-primary w-full block text-center">
            Probar gratis
          </Link>
        </motion.div>
      </section>

      {/* Legal footer */}
      <footer className="py-8 px-6 border-t border-white/5 text-center">
        <p className="text-gray-600 text-xs">
          © {new Date().getFullYear()} Destino TV ·{' '}
          <Link to="/privacy" className="hover:text-gray-400 transition-colors">Privacidad</Link>
          {' · '}
          <Link to="/terms" className="hover:text-gray-400 transition-colors">Términos</Link>
        </p>
      </footer>
    </div>
  );
}
