import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase.js';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useCallStore } from '../store/callStore.js';

// Suscribirse a un canal y enviar un broadcast, luego desuscribirse
const sendBroadcast = (channelName, event, payload) =>
  new Promise((resolve) => {
    const ch = supabase.channel(channelName);
    const timeout = setTimeout(() => { supabase.removeChannel(ch); resolve(); }, 4000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        ch.send({ type: 'broadcast', event, payload })
          .finally(() => { supabase.removeChannel(ch); resolve(); });
      }
    });
  });

export function useCallManager() {
  const { user } = useAuthStore();
  const {
    callStatus, incomingCall, activeCall,
    setRinging, setCalling, setConnected, resetCall,
  } = useCallStore();
  const callTimeoutRef = useRef(null);

  // Suscripción global: escucha llamadas entrantes y respuestas
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`calls-${user.id}`)
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        // Solo mostrar si no estamos ya en una llamada
        if (useCallStore.getState().callStatus === 'idle') {
          setRinging(payload);
        }
      })
      .on('broadcast', { event: 'call-accepted' }, () => {
        clearTimeout(callTimeoutRef.current);
        setConnected();
      })
      .on('broadcast', { event: 'call-declined' }, () => {
        clearTimeout(callTimeoutRef.current);
        toast('Llamada rechazada', { icon: '📵' });
        resetCall();
      })
      .on('broadcast', { event: 'call-ended' }, () => {
        resetCall();
      })
      .on('broadcast', { event: 'call-cancelled' }, () => {
        if (useCallStore.getState().callStatus === 'ringing') resetCall();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  // Iniciar llamada (solo premium, verifica en backend)
  const initiateCall = async (matchId, otherUser) => {
    try {
      const { data } = await api.post('/api/video/direct-call', { matchId });
      setCalling({
        channelName: data.channelName,
        token: data.token,
        appId: data.appId,
        uid: data.uid,
        otherUserId: data.calleeId,
        otherName: otherUser.full_name,
        otherAvatar: otherUser.avatar_url,
      });
      await sendBroadcast(`calls-${data.calleeId}`, 'incoming-call', {
        callerId: user.id,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        channelName: data.channelName,
        matchId,
      });

      // Si nadie responde en 30 segundos, cancelar
      callTimeoutRef.current = setTimeout(async () => {
        if (useCallStore.getState().callStatus === 'calling') {
          toast('Sin respuesta', { icon: '📵' });
          const otherId = useCallStore.getState().activeCall?.otherUserId;
          resetCall();
          if (otherId) await sendBroadcast(`calls-${otherId}`, 'call-cancelled', {});
        }
      }, 30000);
    } catch (err) {
      resetCall();
      toast.error(err.response?.data?.error || 'Error al iniciar llamada');
    }
  };

  // Aceptar llamada entrante
  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      const uid = Math.floor(Math.random() * 100000);
      const { data } = await api.post('/api/video/token', {
        channelName: incomingCall.channelName,
        uid,
      });
      setCalling({
        channelName: incomingCall.channelName,
        token: data.token,
        appId: data.appId,
        uid,
        otherUserId: incomingCall.callerId,
        otherName: incomingCall.callerName,
        otherAvatar: incomingCall.callerAvatar,
      });
      await sendBroadcast(`calls-${incomingCall.callerId}`, 'call-accepted', {});
    } catch {
      resetCall();
      toast.error('Error al conectar la llamada');
    }
  };

  // Rechazar llamada entrante
  const declineCall = async () => {
    if (!incomingCall) return;
    await sendBroadcast(`calls-${incomingCall.callerId}`, 'call-declined', {});
    resetCall();
  };

  // Colgar (cancela o termina llamada activa)
  const endCall = async () => {
    clearTimeout(callTimeoutRef.current);
    const current = useCallStore.getState();
    const otherId = current.activeCall?.otherUserId || current.incomingCall?.callerId;
    resetCall(); // ← actualiza UI inmediatamente
    if (otherId) {
      const event = current.callStatus === 'ringing' ? 'call-cancelled' : 'call-ended';
      await sendBroadcast(`calls-${otherId}`, event, {});
    }
  };

  return { callStatus, incomingCall, activeCall, initiateCall, acceptCall, declineCall, endCall };
}
