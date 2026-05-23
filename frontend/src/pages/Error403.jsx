import { Link } from 'react-router-dom';
import { FiLock, FiArrowLeft } from 'react-icons/fi';

export default function Error403() {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
          <FiLock className="w-10 h-10 text-red-400" />
        </div>
        <div>
          <p className="text-6xl font-black text-red-400 mb-2">403</p>
          <h1 className="text-xl font-bold text-white">Acceso denegado</h1>
          <p className="text-gray-400 text-sm mt-2">No tienes permiso para ver esta página.</p>
        </div>
        <Link to="/home" className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 transition-colors">
          <FiArrowLeft size={16} /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
