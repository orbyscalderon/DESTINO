import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

export default function Error500() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto">
          <FiAlertTriangle className="w-10 h-10 text-orange-400" />
        </div>
        <div>
          <p className="text-6xl font-black text-orange-400 mb-2">500</p>
          <h1 className="text-xl font-bold text-white">Error del servidor</h1>
          <p className="text-gray-400 text-sm mt-2">Algo salió mal de nuestro lado. Intenta de nuevo en un momento.</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-5 py-2.5 rounded-xl transition-colors"
        >
          <FiRefreshCw size={16} /> Reintentar
        </button>
      </div>
    </div>
  );
}
