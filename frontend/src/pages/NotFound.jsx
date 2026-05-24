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
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 max-w-sm"
      >
        <div className="text-6xl">💔</div>
        <h1 className="text-4xl font-black gradient-text">404</h1>
        <p className="text-gray-400">Esta página no existe o fue eliminada.</p>
        <Link to="/" className="btn-primary inline-block mt-4 px-8">
          Volver al inicio
        </Link>
      </motion.div>
    </div>
  );
}
