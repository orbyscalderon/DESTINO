import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiHeart, FiX, FiMoreVertical } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import BlockReportModal from '../components/ui/BlockReportModal.jsx';

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);

  useEffect(() => {
    api.get(`/api/profiles/${userId}`)
      .then(({ data }) => setProfile(data.profile))
      .catch(() => toast.error('Perfil no encontrado'))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleLike = async () => {
    try {
      const { data } = await api.post('/api/matches/like', { targetUserId: userId });
      if (data.isMatch) toast.success('¡Es un match! 💕');
      else toast.success('Like enviado');
      navigate(-1);
    } catch {
      toast.error('Error al dar like');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Foto principal */}
      <div className="relative h-[60vh]">
        <img
          src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name)}&size=600&background=1a1a2e&color=f43f5e`}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent" />

        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <FiArrowLeft />
        </button>
        <button onClick={() => setShowBlockModal(true)} className="absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
          <FiMoreVertical />
        </button>

        <div className="absolute bottom-6 left-6 right-6">
          <h1 className="text-3xl font-bold text-white">
            {profile.full_name}, {profile.age}
          </h1>
          <div className="flex gap-2 mt-2">
            {profile.is_premium && <span className="bg-yellow-500/80 text-black text-xs font-bold px-2 py-0.5 rounded-full">⚡ PREMIUM</span>}
            {profile.is_verified && <span className="bg-blue-500/80 text-white text-xs font-bold px-2 py-0.5 rounded-full">✓ VERIFICADO</span>}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-6 pt-4 pb-28">
        {profile.bio && (
          <div className="card p-4 mb-4">
            <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
          </div>
        )}
        <div className="card p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Género</span>
            <span className="text-white capitalize">{profile.gender}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">En Destino desde</span>
            <span className="text-white">{new Date(profile.created_at).toLocaleDateString('es', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Acciones fijas */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-dark-900/95 backdrop-blur-md border-t border-white/5 flex gap-4">
        <button onClick={() => navigate(-1)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
          <FiX /> Pasar
        </button>
        <button onClick={handleLike} className="btn-primary flex-1 flex items-center justify-center gap-2">
          <FiHeart /> Me gusta
        </button>
      </div>

      <AnimatePresence>
        {showBlockModal && (
          <BlockReportModal
            userId={userId}
            userName={profile.full_name}
            onClose={() => setShowBlockModal(false)}
            onBlocked={() => navigate(-1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
