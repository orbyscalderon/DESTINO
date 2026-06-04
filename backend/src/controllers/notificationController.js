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
export const subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'subscription requerida' });

    await supabase.from('push_subscriptions').upsert({
      user_id: req.user.id,
      subscription,
    }, { onConflict: 'user_id' });

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

// Función interna — enviar push a un usuario
export const sendPushToUser = async (userId, payload) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const { data: row } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId)
    .single();

  if (!row) return;

  try {
    await webpush.sendNotification(row.subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Suscripción expirada — eliminar
      await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    }
  }
};
