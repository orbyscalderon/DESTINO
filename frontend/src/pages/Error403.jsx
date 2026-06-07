import { Link } from 'react-router-dom';
import { FiLock, FiArrowLeft } from 'react-icons/fi';

export default function Error403() {
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-red-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="text-center space-y-5 max-w-sm relative z-10">
        <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500/30 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-float">
          <FiLock className="w-10 h-10 text-red-400" />
        </div>
        <div>
          <p className="text-6xl font-black text-red-400 mb-2">403</p>
          <h1 className="text-xl font-bold text-white">Acceso denegado</h1>
          <p className="text-gray-400 text-sm mt-2">No tienes permiso para ver esta página.</p>
        </div>
        <Link to="/home" className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 px-4 py-2 rounded-lg transition-colors">
          <FiArrowLeft size={16} /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
