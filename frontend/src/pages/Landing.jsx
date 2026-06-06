import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { FiHeart, FiVideo, FiMessageCircle, FiZap, FiUsers, FiRadio, FiStar } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';

// Features con keys i18n — se traducen en el render con t(titleKey/descKey)
const FEATURES = [
  { icon: FiHeart,         titleKey: 'landing.feature_swipe_title',  descKey: 'landing.feature_swipe_desc' },
  { icon: FiMessageCircle, titleKey: 'landing.feature_chat_title',   descKey: 'landing.feature_chat_desc' },
  { icon: FiVideo,         titleKey: 'landing.feature_video_title',  descKey: 'landing.feature_video_desc' },
  { icon: FiZap,           titleKey: 'landing.feature_boost_title',  descKey: 'landing.feature_boost_desc' },
];

// Formato de números para social proof: 12000 → "12k+", 800 → "800+"
function fmtCount(n) {
  if (!n) return '—';
  if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
  return `${n}+`;
}

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    // Stats y creators destacados — no bloqueamos render si fallan
    api.get('/api/seo/public-stats').then(({ data }) => setStats(data)).catch(() => {});
    api.get('/api/seo/featured-creators').then(({ data }) => setFeatured(data.creators || [])).catch(() => {});
  }, []);

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
    <div className="min-h-screen bg-dark-900 overflow-hidden hero-mesh">
      {/* Hero */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {/* Glow orbs decorativos animados */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 sm:w-[500px] sm:h-[500px] bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-72 sm:h-72 bg-accent-500/10 rounded-full blur-3xl pointer-events-none animate-float" style={{ animationDelay: '1s' }} />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="relative z-10 space-y-6"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 12 }}
            className="text-7xl mb-4 inline-block"
          >
            💕
          </motion.div>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight">
            <span className="gradient-text">Destino TV</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-300 max-w-md mx-auto leading-relaxed px-2">
            {t('landing.tagline')}
          </p>

          <div className="flex flex-col gap-3 justify-center pt-4 w-full max-w-xs mx-auto sm:max-w-none sm:flex-row sm:gap-4">
            <Link to="/register" className="btn-primary text-base sm:text-lg px-8 py-3.5 sm:px-10 sm:py-4 shadow-glow hover:shadow-glow-lg">
              {t('landing.start_free')}
            </Link>
            <Link to="/login" className="btn-secondary text-base sm:text-lg px-8 py-3.5 sm:px-10 sm:py-4">
              {t('auth.login')}
            </Link>
          </div>

          {/* Social proof — stats reales del backend (cache 5 min) */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-center gap-5 sm:gap-8 pt-6"
            >
              <Stat icon={FiUsers} value={fmtCount(stats.users)} label={t('landing.stat_users')} />
              <span className="w-px h-8 bg-white/10" />
              <Stat icon={FiStar} value={fmtCount(stats.creators)} label={t('landing.stat_creators')} />
              {stats.live_now > 0 && (
                <>
                  <span className="w-px h-8 bg-white/10" />
                  <Stat icon={FiRadio} value={stats.live_now} label={t('landing.stat_live_now')} pulse />
                </>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Creadores destacados — solo si hay al menos 3 */}
      {featured.length >= 3 && (
        <section className="py-12 px-6">
          <div className="max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl sm:text-3xl font-bold text-center mb-8"
            >
              {t('landing.creators_in_destino')} <span className="gradient-text">Destino TV</span>
            </motion.h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 px-2 snap-x">
              {featured.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="shrink-0 w-32 snap-start text-center"
                >
                  <div className="w-24 h-24 mx-auto rounded-full p-0.5 bg-gradient-to-br from-brand-500 to-purple-500">
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-full h-full rounded-full object-cover bg-dark-800"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white truncate">{c.name}</p>
                  {c.tag && <p className="text-[10px] text-gray-500 truncate">{c.tag}</p>}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12 gradient-text"
          >
            {t('landing.everything_you_need')}
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, titleKey, descKey }, i) => (
              <motion.div
                key={titleKey}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.08, ease: [0.19, 1, 0.22, 1] }}
                className="card-interactive p-5 group"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-brand-500/30 to-accent-500/20 rounded-xl flex items-center justify-center mb-4 ring-1 ring-brand-500/20 group-hover:ring-brand-500/40 transition-all duration-200">
                  <Icon size={22} className="text-brand-400 group-hover:scale-110 transition-transform duration-200" />
                </div>
                <h3 className="font-bold text-white mb-2">{t(titleKey)}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{t(descKey)}</p>
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
          className="max-w-md mx-auto card p-8 text-center bg-gradient-to-br from-brand-500/15 via-accent-500/5 to-yellow-500/5 border-brand-500/30 shadow-glow"
        >
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-4xl mb-4 inline-block"
          >
            ⚡
          </motion.div>
          <h3 className="text-2xl font-bold mb-2">{t('landing.premium_cta_title')}</h3>
          <p className="text-gray-400 text-sm mb-6">{t('landing.premium_cta_desc')}</p>
          <Link to="/register" className="btn-primary w-full block text-center">
            {t('landing.try_free')}
          </Link>
        </motion.div>
      </section>

      {/* Legal footer */}
      {/* Stat: bloque pequeño de número + label para el hero */}
      {/* (componente abajo) */}
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

function Stat({ icon: Icon, value, label, pulse }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        {pulse && <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>}
        <Icon size={14} className="text-brand-400" />
        <span className="text-xl sm:text-2xl font-black text-white tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}
