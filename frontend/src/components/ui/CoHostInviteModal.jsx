import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheck, FiUsers } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';
import { useAuthStore } from '../../store/authStore.js';
import toast from 'react-hot-toast';

// Modal que aparece cuando un host invita al user actual a co-presentar
// un show. Polling cada 10s sobre /api/shows/co-hosts/pending. Solo se
// monta cuando hay sesión.
export default function CoHostInviteModal() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile?.is_creator) return;
    let cancel = false;
    const fetchPending = async () => {
      try {
        const { data } = await api.get('/api/shows/co-hosts/pending');
        const first = (data.invites || [])[0];
        if (!cancel && first && (!invite || invite.show_id !== first.show_id)) {
          setInvite(first);
        } else if (!cancel && !first && invite) {
          // Ya no hay pendientes (otro device respondió, expiró, etc.)
          setInvite(null);
        }
      } catch {}
    };
    fetchPending();
    // Polling cada 60s como FALLBACK del broadcast realtime
    // `cohost_invite_received`. El realtime cubre el caso común.
    const t = setInterval(fetchPending, 60_000);

    // Si estoy live (tengo un show propio en estado 'live'), suscribirme al
    // canal de mi show para reaccionar instantáneo al broadcast
    // `cohost_invite_received` en vez de esperar el polling de 10s.
    let ch = null;
    api.get('/api/shows/my').then(({ data }) => {
      const live = (data.shows || []).find(s => s.status === 'live');
      if (cancel || !live?.id) return;
      ch = supabase.channel(`show:${live.id}`)
        .on('broadcast', { event: 'cohost_invite_received' }, () => {
          fetchPending();
        })
        .subscribe();
    }).catch(() => {});

    return () => {
      cancel = true;
      clearInterval(t);
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.is_creator]);

  const handleAccept = async () => {
    if (!invite || processing) return;
    setProcessing(true);
    try {
      await api.post(`/api/shows/${invite.show_id}/co-hosts/accept`);
      toast.success('🎬 Te uniste al show como co-host');
      const showId = invite.show_id;
      setInvite(null);
      // Navegamos al show — si está live se pondrá modo co-host stage
      navigate(`/show/${showId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo aceptar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!invite || processing) return;
    setProcessing(true);
    try {
      await api.post(`/api/shows/${invite.show_id}/co-hosts/decline`);
      setInvite(null);
    } catch {} finally { setProcessing(false); }
  };

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 22 }}
            role="dialog" aria-modal="true" aria-labelledby="cohost-invite-title"
            className="w-full max-w-sm bg-gradient-to-br from-purple-600 via-brand-600 to-pink-500 rounded-3xl p-6 text-center shadow-2xl shadow-purple-500/40"
          >
            <div className="text-5xl mb-3" aria-hidden="true">🎬</div>
            <h2 id="cohost-invite-title" className="text-white font-black text-2xl mb-1">¡Te invitaron!</h2>
            <p className="text-white/85 text-sm mb-4">Para co-presentar un show</p>

            <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 mb-4 flex items-center gap-3">
              <img
                src={invite.host?.avatar_url || '/avatar-placeholder.png'}
                alt={`Avatar de ${invite.host?.full_name || 'host'}`}
                className="w-12 h-12 rounded-full object-cover border-2 border-white"
              />
              <div className="text-left min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{invite.host?.full_name || 'Un creador'}</p>
                <p className="text-white/80 text-xs flex items-center gap-1 truncate">
                  <FiUsers size={11} className="shrink-0" />
                  <span className="truncate">{invite.show_title || 'Su show'}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={processing}
                className="flex-1 py-3 bg-black/40 hover:bg-black/60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <FiX size={16} /> Rechazar
              </button>
              <button
                onClick={handleAccept}
                disabled={processing}
                autoFocus
                className="flex-1 py-3 bg-white text-purple-600 font-black rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
              >
                {processing
                  ? <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  : <><FiCheck size={16} /> Unirme</>
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
