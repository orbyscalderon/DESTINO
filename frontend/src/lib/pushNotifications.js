import api from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const { data } = await api.get('/api/notifications/vapid-key').catch(() => ({ data: null }));
    if (!data?.publicKey) return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await api.post('/api/notifications/subscribe', { subscription: existing }).catch(() => {});
      return;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });

    await api.post('/api/notifications/subscribe', { subscription }).catch(() => {});
  } catch {
    // Notificaciones no disponibles en este contexto — ignorar silenciosamente
  }
}
