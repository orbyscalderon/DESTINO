import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function NotFound() {
  useEffect(() => {
    // Safety net: if the user lands here with OAuth callback params
    // (e.g. Supabase implicit flow puts tokens in the hash directly),
    // redirect them to the auth callback page so it can process the session.
    const rawHash = window.location.hash.replace(/^#/, '');
    const hasTokens = rawHash.includes('access_token=') || rawHash.includes('type=signup') || rawHash.includes('type=recovery');
    const hasCode   = window.location.search.includes('code=');

    if (hasTokens || hasCode) {
      // Move everything to /#/auth/callback so AuthCallback can process it
      const search = window.location.search || (hasTokens ? `?${rawHash}` : '');
      window.location.replace(`${window.location.origin}/#/auth/callback${search}`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
        className="text-center space-y-4 max-w-sm relative z-10"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 12 }}
          className="text-6xl inline-block animate-float"
        >
          💔
        </motion.div>
        <h1 className="text-5xl font-black gradient-text">404</h1>
        <p className="text-gray-400">Esta página no existe o fue eliminada.</p>
        <Link to="/" className="btn-primary inline-block mt-4 px-8 shadow-glow hover:shadow-glow-lg">
          Volver al inicio
        </Link>
      </motion.div>
    </div>
  );
}
