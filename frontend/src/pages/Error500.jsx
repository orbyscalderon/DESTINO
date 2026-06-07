import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

export default function Error500() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="text-center space-y-5 max-w-sm relative z-10">
        <div className="w-20 h-20 bg-orange-500/20 border-2 border-orange-500/30 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(251,146,60,0.4)] animate-float">
          <FiAlertTriangle className="w-10 h-10 text-orange-400" />
        </div>
        <div>
          <p className="text-6xl font-black text-orange-400 mb-2">500</p>
          <h1 className="text-xl font-bold text-white">Error del servidor</h1>
          <p className="text-gray-400 text-sm mt-2">Algo salió mal de nuestro lado. Intenta de nuevo en un momento.</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary inline-flex items-center gap-2 px-5 py-2.5"
        >
          <FiRefreshCw size={16} /> Reintentar
        </button>
      </div>
    </div>
  );
}
