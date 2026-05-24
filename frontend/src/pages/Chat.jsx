import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPhone, FiLock, FiMoreVertical } from 'react-icons/fi';
import { AnimatePresence } from 'framer-motion';
import ChatWindow from '../components/ui/ChatWindow.jsx';
import BlockReportModal from '../components/ui/BlockReportModal.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useCallStore } from '../store/callStore.js';
import api from '../lib/api.js';

export default function Chat() {
  const { matchId } = useParams();
  const { profile } = useAuthStore();
  const { setCalling } = useCallStore();
  const navigate = useNavigate();
  const [initiatingCall, setInitiatingCall] = useState(false);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);

  useEffect(() => {
    const loadMatch = async () => {
      try {
        const { data } = await api.get('/api/matches');
        const m = data.matches?.find(m => m.id === matchId);
        setMatch(m);
      } finally {
        setLoading(false);
      }
    };
    loadMatch();
  }, [matchId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!match) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <p className="text-4xl">💔</p>
      <p className="text-white font-semibold">Esta conversación ya no existe</p>
      <p className="text-gray-500 text-sm">El match pudo haber expirado o fue eliminado.</p>
      <Link to="/matches" className="btn-primary text-sm px-6">Ver mis matches</Link>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-80px)] lg:h-screen flex flex-col bg-dark-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-dark-800 shrink-0">
        <Link to="/matches" className="text-gray-400 hover:text-white transition-colors p-1">
          <FiArrowLeft size={20} />
        </Link>

        {match?.other && (
          <>
            <img
              src={match.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(match.other.full_name)}&size=80&background=1a1a2e&color=f43f5e`}
              alt={match.other.full_name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">{match.other.full_name}</p>
              {match.other.last_active && (() => {
                const diffMin = (Date.now() - new Date(match.other.last_active).getTime()) / 60000;
                if (diffMin < 5) return <p className="text-green-400 text-xs">En línea</p>;
                if (diffMin < 60) return <p className="text-gray-500 text-xs">Hace {Math.floor(diffMin)} min</p>;
                if (diffMin < 1440) return <p className="text-gray-500 text-xs">Hace {Math.floor(diffMin / 60)}h</p>;
                return <p className="text-gray-500 text-xs">Hace {Math.floor(diffMin / 1440)}d</p>;
              })()}
            </div>
          </>
        )}

        {/* Botón de llamada */}
        {match?.other && (
          profile?.is_premium ? (
            <button
              disabled={initiatingCall}
              onClick={async () => {
                setInitiatingCall(true);
                try {
                  const { data } = await api.post(`/api/rtc/call/${matchId}/init`);
                  setCalling({ roomId: data.roomId, matchId, calleeId: data.calleeId });
                  navigate(`/call/${matchId}`, { state: { roomId: data.roomId } });
                } catch (err) {
                  import('react-hot-toast').then(({ default: toast }) =>
                    toast.error(err.response?.data?.error || 'No se pudo iniciar la llamada')
                  );
                } finally {
                  setInitiatingCall(false);
                }
              }}
              title="Videollamada"
              className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-colors disabled:opacity-50"
            >
              {initiatingCall
                ? <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                : <FiPhone size={16} />
              }
            </button>
          ) : (
            <Link
              to="/premium"
              title="Videollamadas directas — Premium"
              className="relative w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-600 hover:text-yellow-400 transition-colors"
            >
              <FiPhone size={14} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                <FiLock size={7} className="text-black" />
              </span>
            </Link>
          )
        )}

        {/* Menú de opciones */}
        {match?.other && (
          <button
            onClick={() => setShowBlockModal(true)}
            className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <FiMoreVertical size={16} />
          </button>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ChatWindow matchId={matchId} otherUser={match?.other} />
      </div>

      <AnimatePresence>
        {showBlockModal && match?.other && (
          <BlockReportModal
            userId={match.other.id}
            userName={match.other.full_name}
            onClose={() => setShowBlockModal(false)}
            onBlocked={() => navigate('/matches')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
