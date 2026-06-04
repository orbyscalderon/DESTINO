import api from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function isCapacitorNative() {
  return typeof window !== 'undefined'
      && !!window.Capacitor
      && window.Capacitor.isNativePlatform?.() === true;
}

// Web Push (VAPID) — original. Sigue activo en navegadores y en la PWA
// instalada desde Chrome.
async function initWebPush() {
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
  } catch { /* ignorar */ }
}

// Native push (FCM en Android, APNs en iOS) vía @capacitor/push-notifications.
// Requiere `google-services.json` (Android) y APNs cert (iOS) configurados.
// Sin esos, register() falla silenciosamente y caemos en web push si aplica.
async function initNativePush() {
  try {
    const { PushNotifications } = await new Function('return import("@capacitor/push-notifications")')();
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    // Listener BEFORE register para no perder el primer token
    await PushNotifications.addListener('registration', async (token) => {
      const platform = window.Capacitor?.getPlatform?.() || 'unknown';
      await api.post('/api/notifications/subscribe-mobile', {
        token: token.value,
        platform, // 'android' | 'ios'
      }).catch(() => {});
    });
    await PushNotifications.addListener('registrationError', () => {});
    await PushNotifications.addListener('pushNotificationReceived', () => {});
    await PushNotifications.addListener('pushNotificationActionPerformed', (evt) => {
      const url = evt.notification?.data?.url;
      if (url) {
        try {
          // Forzar navegación dentro de la HashRouter SPA
          window.location.hash = url.startsWith('#') ? url : `#${url}`;
        } catch {}
      }
    });

    await PushNotifications.register();
  } catch {
    // Plugin no instalado o entorno donde no aplica — silencio
  }
}

export async function initPushNotifications() {
  if (isCapacitorNative()) {
    await initNativePush();
  } else {
    await initWebPush();
  }
}
