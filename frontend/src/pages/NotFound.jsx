import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function NotFound() {
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
