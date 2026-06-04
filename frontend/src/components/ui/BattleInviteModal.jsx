import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCheck, FiZap } from 'react-icons/fi';
import api from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';
import { useAuthStore } from '../../store/authStore.js';
import toast from 'react-hot-toast';

// Modal que aparece cuando OTRO host te invita a un battle.
// Polling cada 10s + listener Supabase para detectar invitaciones nuevas.
// Solo se monta cuando estás en /show/:id (durante un show live).
export default function BattleInviteModal({ onAccepted, showId }) {
  const { user } = useAuthStore();
  const [invitation, setInvitation] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  // Poll pendings cada 10s (+ una vez al montar)
  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    const fetchPending = async () => {
      try {
        const { data } = await api.get('/api/battles/pending');
        const first = (data.battles || [])[0];
        if (!cancel && first && (!invitation || invitation.id !== first.id)) {
          setInvitation(first);
          // Cuenta regresiva basada en invited_at
          const ageSec = Math.floor((Date.now() - new Date(first.invited_at).getTime()) / 1000);
          setSecondsLeft(Math.max(0, 60 - ageSec));
        }
      } catch {}
    };
    fetchPending();
    const t = setInterval(fetchPending, 10_000);

    // Subscribe al canal de mi show si lo conozco. Cuando alguien me invita
    // y emite `battle_invite_received`, refrescamos pendings al instante en
    // vez de esperar al próximo polling de 10s.
    let ch = null;
    if (showId) {
      ch = supabase.channel(`show:${showId}`)
        .on('broadcast', { event: 'battle_invite_received' }, () => {
          fetchPending();
        })
        .subscribe();
    }

    return () => {
      cancel = true;
      clearInterval(t);
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, showId]);

  // Countdown
  useEffect(() => {
    if (!invitation) return;
    if (secondsLeft <= 0) {
      // Invitación expiró visualmente — el backend la rechazará en el próximo
      // intento de accept
      setInvitation(null);
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [invitation, secondsLeft]);

  const handleAccept = async () => {
    if (!invitation || processing) return;
    setProcessing(true);
    try {
      const { data } = await api.post(`/api/battles/${invitation.id}/accept`);
      toast.success(`⚔️ ¡Battle aceptado!`);
      setInvitation(null);
      onAccepted?.(data.battle);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo aceptar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!invitation || processing) return;
    setProcessing(true);
    try {
      await api.post(`/api/battles/${invitation.id}/reject`);
      setInvitation(null);
    } catch {} finally { setProcessing(false); }
  };

  return (
    <AnimatePresence>
      {invitation && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 22 }}
            role="dialog" aria-modal="true" aria-labelledby="battle-invite-title"
            className="w-full max-w-sm bg-gradient-to-br from-pink-600 via-brand-600 to-pink-500 rounded-3xl p-6 text-center shadow-2xl shadow-pink-500/40"
          >
            <div className="text-5xl mb-3 animate-pulse" aria-hidden="true">⚔️</div>
            <h2 id="battle-invite-title" className="text-white font-black text-2xl mb-1">¡Battle!</h2>
            <p className="text-white/85 text-sm mb-4">Te invitan a un battle 1v1</p>

            <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 mb-4 flex items-center gap-3">
              <img
                src={invitation.host1?.avatar_url || '/avatar-placeholder.png'}
                alt={`Avatar de ${invitation.host1?.full_name || 'host'}`}
                className="w-12 h-12 rounded-full object-cover border-2 border-white"
              />
              <div className="text-left">
                <p className="text-white font-bold text-sm">{invitation.host1?.full_name || 'Creador'}</p>
                <p className="text-white/70 text-xs flex items-center gap-1">
                  <FiZap size={11} /> {invitation.duration_minutes} min de battle
                </p>
              </div>
            </div>

            {/* Countdown */}
            <div className="mb-4">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-1000"
                  style={{ width: `${(secondsLeft / 60) * 100}%` }}
                />
              </div>
              <p className="text-white/80 text-[11px] mt-1.5">
                Expira en {secondsLeft}s
              </p>
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
                className="flex-1 py-3 bg-white text-pink-600 font-black rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
              >
                {processing
                  ? <div className="w-5 h-5 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
                  : <><FiCheck size={16} /> ¡Aceptar!</>
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
