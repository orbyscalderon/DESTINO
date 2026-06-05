import webpush from 'web-push';
import { supabase } from '../lib/supabase.js';
import { safeErrorMessage } from '../lib/helpers.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    `mailto:${process.env.SUPPORT_EMAIL || 'soporte@destino.app'}`,
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

// GET /api/notifications/vapid-key
export const getVapidKey = (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Push notifications no configuradas' });
  res.json({ publicKey: VAPID_PUBLIC });
};

// POST /api/notifications/subscribe
// Multi-device: si el user ya tiene esa misma subscription (mismo endpoint)
// solo actualiza last_seen. Si es nueva, la añade.
export const subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription requerida con endpoint' });

    // Tras migración v54, UNIQUE(user_id, endpoint) — onConflict actualiza
    // last_seen sin reemplazar otras suscripciones del mismo user.
    await supabase.from('push_subscriptions').upsert({
      user_id: req.user.id,
      subscription,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// DELETE /api/notifications/unsubscribe
export const unsubscribe = async (req, res) => {
  try {
    await supabase.from('push_subscriptions').delete().eq('user_id', req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// POST /api/notifications/subscribe-mobile
// Body: { token: string (FCM/APNs), platform: 'android' | 'ios' }
// Guarda el token de push nativo del device. El send real requiere Firebase
// Admin SDK en el backend (mobile_push_tokens). Por ahora solo persistimos.
export const subscribeMobile = async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 20) {
      return res.status(400).json({ error: 'token inválido' });
    }
    if (!['android', 'ios'].includes(platform)) {
      return res.status(400).json({ error: 'platform debe ser android o ios' });
    }

    // upsert por (user_id + token) — un user puede tener el mismo token en
    // varios devices y queremos que cada device se registre una sola fila.
    const { error } = await supabase
      .from('mobile_push_tokens')
      .upsert({
        user_id: req.user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,token' });
    if (error) {
      // Si la tabla no existe aún en producción (migration pendiente),
      // no rompemos el flujo del cliente — registramos warning.
      console.warn('[subscribeMobile] supabase error:', error.message);
      return res.json({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// GET /api/notifications/prefs
export const getNotifPrefs = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', req.user.id)
      .single();
    res.json({ prefs: profile?.notification_prefs || {} });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// PUT /api/notifications/prefs
export const updateNotifPrefs = async (req, res) => {
  try {
    const allowed = ['matches', 'messages', 'likes', 'shows', 'rewards'];
    const prefs = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') prefs[key] = req.body[key];
    }
    await supabase
      .from('profiles')
      .update({ notification_prefs: prefs })
      .eq('id', req.user.id);
    res.json({ prefs });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// Enviar push a todos los suscriptores (broadcast admin)
export const sendBroadcastNotification = async (title, body) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { sent: 0, failed: 0, total: 0 };

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription');

  if (!subs?.length) return { sent: 0, failed: 0, total: 0 };

  const payload = JSON.stringify({ title, body, icon: '/icons/icon-192.png' });
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('user_id', row.user_id);
      }
    }
  }));

  return { sent, failed, total: subs.length };
};

// Envía push a TODOS los dispositivos del user (web + mobile FCM/APNs).
// Errores 410/404 limpian la suscripción expirada. last_seen se actualiza
// en cada envío exitoso para que el cron de cleanup no borre devices activos.
//
// payload típico:
//   { title, body, url?, icon?, badge?, data? }
//
// El service worker (sw.js) lee este shape para showNotification.
export const sendPushToUser = async (userId, payload) => {
  if (!userId) return { web: 0, mobile: 0 };

  const payloadStr = JSON.stringify(payload);
  let webSent = 0, mobileSent = 0;

  // ── Web Push (todas las subs del user, no solo una) ──
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const { data: webSubs } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    if (webSubs?.length) {
      await Promise.all(webSubs.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payloadStr);
          webSent++;
          // Touch last_seen — el cron no la borrará por inactividad
          supabase.from('push_subscriptions')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', row.id)
            .then(() => {}, () => {});
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Suscripción expirada (browser desinstalado, sub revocada)
            await supabase.from('push_subscriptions').delete().eq('id', row.id);
          } else {
            console.error('[webpush]', err?.statusCode, err?.message);
          }
        }
      }));
    }
  }

  // ── Mobile Push (FCM/APNs via Firebase Admin SDK si está disponible) ──
  // El SDK Firebase es opcional — si no está instalado, solo persistimos sin
  // enviar (degradación graceful). Para activar: npm i firebase-admin en backend
  // y exportar GOOGLE_APPLICATION_CREDENTIALS_JSON con el service account.
  try {
    const { data: mobileTokens } = await supabase
      .from('mobile_push_tokens')
      .select('id, token, platform')
      .eq('user_id', userId);

    if (mobileTokens?.length) {
      const sentTokens = await sendFcmBatch(
        mobileTokens.map(r => r.token),
        payload,
      );
      mobileSent = sentTokens.length;

      // Limpieza de tokens inválidos reportados por FCM
      const invalidTokens = mobileTokens
        .map(r => r.token)
        .filter(t => !sentTokens.includes(t) && sentTokens.length > 0);
      if (invalidTokens.length > 0) {
        await supabase.from('mobile_push_tokens')
          .delete()
          .in('token', invalidTokens);
      }

      // Touch last_seen en los enviados
      if (sentTokens.length > 0) {
        await supabase.from('mobile_push_tokens')
          .update({ last_seen: new Date().toISOString() })
          .in('token', sentTokens);
      }
    }
  } catch (err) {
    console.error('[fcm push]', err?.message);
  }

  return { web: webSent, mobile: mobileSent };
};

// Envío a FCM. Carga firebase-admin lazy — si no está, devuelve [] sin error.
// FCM también puede enviar a iOS via APNs si el config está en Firebase Console.
let _fcmInit = null;
async function getFcm() {
  if (_fcmInit !== null) return _fcmInit;
  try {
    const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credsJson) { _fcmInit = false; return false; }
    const admin = await import('firebase-admin');
    if (!admin.apps?.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(credsJson)),
      });
    }
    _fcmInit = admin.messaging();
    return _fcmInit;
  } catch (err) {
    console.warn('[fcm init]', err.message);
    _fcmInit = false;
    return false;
  }
}

async function sendFcmBatch(tokens, payload) {
  if (!tokens?.length) return [];
  const fcm = await getFcm();
  if (!fcm) return []; // Sin firebase-admin no enviamos (graceful)

  try {
    // FCM moderno: sendEachForMulticast soporta hasta 500 tokens por call
    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title || 'Destino TV',
        body: payload.body || '',
      },
      data: {
        url: payload.url || '/',
        ...(payload.data || {}),
      },
      // iOS: APNs payload
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: payload.badge || 1,
          },
        },
      },
      android: {
        notification: {
          channelId: 'destino-default',
          icon: 'ic_notification',
          color: '#e040fb',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    });

    // Retorna los tokens que SÍ se entregaron
    const okTokens = [];
    res.responses.forEach((r, i) => {
      if (r.success) okTokens.push(tokens[i]);
    });
    return okTokens;
  } catch (err) {
    console.error('[fcm send]', err.message);
    return [];
  }
}
