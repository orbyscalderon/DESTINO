// Wrapper que combina: obtener email + nombre + verificar prefs + enviar.
// Devuelve true si se envió, false si se skipeó.
import { supabase } from './supabase.js';
import * as emails from './emailService.js';

async function getUserEmailAndProfile(userId) {
  const [auth, prof] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from('profiles').select('full_name, email_prefs').eq('id', userId).single(),
  ]);
  return {
    email: auth?.data?.user?.email,
    name:  prof?.data?.full_name || 'Usuario',
    prefs: prof?.data?.email_prefs || {},
  };
}

function prefAllows(prefs, key) {
  return prefs[key] !== false;
}

// Dispatcher: notifyUser('tip_received', { ... }) → llama el template adecuado
const senders = {
  tip_received:        (e, n, d) => emails.sendTipReceivedEmail(e, n, d.fromName, d.amountUsd, d.coinsAmount),
  gift_received:       (e, n, d) => emails.sendGiftReceivedEmail(e, n, d.fromName, d.giftName, d.amountUsd),
  new_subscriber:      (e, n, d) => emails.sendNewSubscriberEmail(e, n, d.subscriberName, d.priceUsd),
  sub_renewed:         (e, n, d) => emails.sendSubscriptionRenewedEmail(e, n, d.creatorName, d.priceUsd),
  sub_canceled:        (e, n, d) => emails.sendSubscriptionCanceledEmail(e, n, d.creatorName, d.accessUntil),
  payout:              (e, n, d) => emails.sendPayoutSentEmail(e, n, d.amountUsd),
  show_starting:       (e, n, d) => emails.sendShowStartingEmail(e, n, d.creatorName, d.showTitle, d.showId),
  coin_purchase:       (e, n, d) => emails.sendCoinPurchaseEmail(e, n, d.coinsBase, d.coinsBonus || 0, d.priceUsd),
  boost:               (e, n, d) => emails.sendBoostActivatedEmail(e, n, d.durationMin),
  identity:            (e, n, d) => d.approved ? emails.sendIdentityVerifiedEmail(e, n) : emails.sendIdentityRejectedEmail(e, n, d.reason),
  appeal:              (e, n, d) => emails.sendAppealResolvedEmail(e, n, d.status, d.adminMessage),
  dmca:                (e, n, d) => emails.sendDMCAAgainstYouEmail(e, n, d.strikeCount, d.banned),
  subscription_gift_received: (e, n, d) =>
    emails.sendSubscriptionGiftEmail(e, n, d.gifterName, d.creatorName, d.tierName, d.message),
};

export async function notifyUser(userId, category, data = {}) {
  try {
    if (!userId || !senders[category]) return false;
    const { email, name, prefs } = await getUserEmailAndProfile(userId);
    if (!email) return false;
    if (!prefAllows(prefs, category)) return false;
    await senders[category](email, name, data);
    return true;
  } catch (err) {
    console.error(`notifyUser(${category}) error:`, err.message);
    return false;
  }
}
