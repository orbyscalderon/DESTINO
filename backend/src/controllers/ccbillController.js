import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { safeErrorMessage } from '../lib/helpers.js';
import { createNotification } from './inAppNotifController.js';
import { sendPushToUser } from './notificationController.js';

// ════════════════════════════════════════════════════════════════════════════
// CCBill integration
//
// Modelo:
//   1) Creator se registra en CCBill (manual / aprobación) → recibe
//      sub_account_id + recurring_form_id. Los guardamos en profiles.
//   2) Cuando un fan quiere suscribirse, generamos una URL al "FlexForms"
//      hosted de CCBill (CCBill maneja card data, PCI burden suyo).
//   3) CCBill cobra al fan → envía webhook a /api/payments/ccbill/webhook
//      con la firma HMAC. Lo procesamos para crear/actualizar la sub.
//   4) Renovaciones / cancelaciones / chargebacks llegan por el mismo
//      webhook.
//
// Variables de entorno necesarias en producción:
//   CCBILL_ACCOUNT_NUMBER         — tu cuenta master (6 dígitos)
//   CCBILL_DATALINK_USERNAME      — para DataLink API (gestión recurring)
//   CCBILL_DATALINK_PASSWORD
//   CCBILL_WEBHOOK_HMAC_SECRET    — para verificar firma de webhooks
//   CCBILL_FLEXFORMS_DOMAIN       — typically "api.ccbill.com"
//
// Notas importantes:
//   - CCBill requiere aprobación previa (background check, KYC del operador)
//   - Cada creator tiene su sub-account que se crea en el dashboard de
//     CCBill manualmente o vía soporte (no hay API self-service para crear
//     sub-accounts como Stripe Connect).
//   - El flow hosted no necesita tarjeta en nuestro side, solo redirect.
// ════════════════════════════════════════════════════════════════════════════

const CCBILL_FORM_BASE = process.env.CCBILL_FLEXFORMS_DOMAIN || 'https://api.ccbill.com';
const HMAC_SECRET = process.env.CCBILL_WEBHOOK_HMAC_SECRET || '';

function isCCBillConfigured() {
  return !!process.env.CCBILL_ACCOUNT_NUMBER
      && !!process.env.CCBILL_WEBHOOK_HMAC_SECRET;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/payments/ccbill/subscribe-link
// Genera la URL al FlexForms hosted de CCBill para suscribirse a un tier.
// Body: { creatorId, tierId }
// ════════════════════════════════════════════════════════════════════════════
export const generateSubscribeLink = async (req, res) => {
  try {
    if (!isCCBillConfigured()) {
      return res.status(503).json({
        error: 'CCBill no configurado en este servidor',
        code: 'CCBILL_NOT_CONFIGURED',
      });
    }

    const subscriberId = req.user.id;
    const { creatorId, tierId } = req.body || {};
    if (!creatorId || !tierId) {
      return res.status(400).json({ error: 'creatorId y tierId requeridos' });
    }
    if (creatorId === subscriberId) {
      return res.status(400).json({ error: 'No puedes suscribirte a ti mismo' });
    }

    // Validar creator + su CCBill sub-account
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, full_name, is_adult_creator, ccbill_sub_account_id, ccbill_recurring_form_id, ccbill_account_status, preferred_processor')
      .eq('id', creatorId)
      .single();

    if (!creator?.is_adult_creator) {
      return res.status(400).json({ error: 'Solo creadores adultos usan CCBill' });
    }
    if (!creator.ccbill_sub_account_id || !creator.ccbill_recurring_form_id || creator.ccbill_account_status !== 'active') {
      return res.status(400).json({
        error: 'Este creador aún no tiene configurada su cuenta CCBill',
        code: 'CCBILL_CREATOR_NOT_READY',
      });
    }

    // Validar tier
    const { data: tier } = await supabase
      .from('creator_tiers')
      .select('id, price, name')
      .eq('id', tierId)
      .eq('creator_id', creatorId)
      .eq('is_active', true)
      .single();
    if (!tier) return res.status(404).json({ error: 'Tier no válido' });

    // Ya suscrito activamente?
    const { data: existing } = await supabase
      .from('ccbill_subscriptions')
      .select('id, status')
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId)
      .maybeSingle();
    if (existing?.status === 'active') {
      return res.status(400).json({ error: 'Ya estás suscrito' });
    }

    // FlexForms URL.
    // CCBill espera parámetros como clientAccnum, clientSubacc, formName.
    // Custom fields se pasan como "customField1", "customField2", etc.,
    // y se reciben de vuelta en los webhooks para trazabilidad.
    const params = new URLSearchParams({
      clientAccnum: process.env.CCBILL_ACCOUNT_NUMBER,
      clientSubacc: creator.ccbill_sub_account_id,
      formName: creator.ccbill_recurring_form_id,
      currencyCode: '840', // USD = 840 según ISO 4217
      formPrice: parseFloat(tier.price).toFixed(2),
      formPeriod: '30',
      formRecurringPrice: parseFloat(tier.price).toFixed(2),
      formRecurringPeriod: '30',
      // Custom fields para identificar la suscripción en el webhook
      customField1: subscriberId,
      customField2: creatorId,
      customField3: tierId,
    });

    const formUrl = `${CCBILL_FORM_BASE}/jpost/signup.cgi?${params}`;

    res.json({
      url: formUrl,
      processor: 'ccbill',
      amount_usd: parseFloat(tier.price),
      tier_name: tier.name,
    });
  } catch (err) {
    console.error('[generateSubscribeLink] error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/payments/ccbill/webhook
// CCBill envía POSTs aquí para eventos: NewSaleSuccess, Renewal,
// Cancellation, Chargeback, Refund. Verificamos HMAC + procesamos.
// ════════════════════════════════════════════════════════════════════════════
export const handleCCBillWebhook = async (req, res) => {
  try {
    if (!isCCBillConfigured()) {
      console.warn('[CCBill webhook] recibido pero el processor no está configurado');
      return res.status(503).end();
    }

    // Sec audit #13: req.body es Buffer (raw) gracias a express.raw() en
    // server.js. NO usar JSON.stringify(req.body) — eso re-serializa y
    // puede reformatear, rompiendo HMAC. Verificamos con bytes originales
    // y solo después parseamos a object.
    const rawBody = Buffer.isBuffer(req.body) ? req.body
                  : typeof req.body === 'string' ? Buffer.from(req.body, 'utf8')
                  : Buffer.from(JSON.stringify(req.body), 'utf8');

    // Verificar firma HMAC sobre bytes originales
    const signature = req.headers['x-ccbill-signature'] || req.headers['ccbill-signature'];
    if (!signature) {
      console.warn('[CCBill webhook] firma ausente');
      return res.status(400).end();
    }

    const expected = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf      = Buffer.from(String(signature), 'utf8');
    if (expectedBuf.length !== sigBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
      console.warn('[CCBill webhook] firma inválida');
      return res.status(401).end();
    }

    // Después de HMAC OK, parsear payload para acceder a campos
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // CCBill puede mandar form-urlencoded — fallback parse
      const params = new URLSearchParams(rawBody.toString('utf8'));
      payload = Object.fromEntries(params);
    }
    const eventType = payload.eventType || payload.event_type;
    const eventId   = payload.X_subscriptionId || payload.subscriptionId || `evt-${Date.now()}-${Math.random()}`;

    // Sec audit #34: replay protection — rechazar webhooks viejos.
    // CCBill incluye timestamp; si el evento es de hace > 10 minutos,
    // probable replay attack o relay malicioso.
    const eventTs = payload.timestamp || payload.eventTimestamp;
    if (eventTs) {
      const eventTime = new Date(eventTs).getTime();
      if (!isNaN(eventTime) && Math.abs(Date.now() - eventTime) > 10 * 60 * 1000) {
        console.warn('[CCBill webhook] evento expirado/futuro, replay sospechoso:', eventTs);
        return res.status(400).end();
      }
    }

    // Idempotency
    const { error: idemErr } = await supabase
      .from('ccbill_events')
      .insert({ event_id: eventId, event_type: eventType, payload });
    if (idemErr?.code === '23505') {
      // Ya procesado
      return res.json({ received: true, skipped: true });
    }
    if (idemErr) {
      console.error('[CCBill webhook] idempotency check failed:', idemErr.message);
      return res.status(500).end();
    }

    // Extraer fields esperados del webhook
    const subscriberId = payload.customField1;
    const creatorId    = payload.customField2;
    const tierId       = payload.customField3;
    const ccbillSubId  = payload.X_subscriptionId || payload.subscriptionId;
    const subAccount   = payload.clientSubacc;
    const amountUsd    = parseFloat(payload.accountingAmount || payload.billedAmount || 0);

    // ── Spotlight billing: customField1='spotlight', customField2=userId ──
    // Servicio de la plataforma, NO suscripción entre usuarios. Routing
    // separado al activar/extender publisher en profiles.
    if (subscriberId === 'spotlight' && creatorId) {
      const userId = creatorId;
      if (eventType === 'NewSaleSuccess' || eventType === 'Renewal') {
        const { activateSpotlightFromWebhook } = await import('./fucknowController.js');
        await activateSpotlightFromWebhook(userId, eventType);
        return res.json({ received: true, type: 'spotlight_activated' });
      }
      if (eventType === 'Cancellation' || eventType === 'Expiration') {
        // No tocamos publisher al cancelar — solo evita renovación.
        // El cron de expiry hará el cleanup cuando llegue la fecha.
        return res.json({ received: true, type: 'spotlight_cancelled' });
      }
      return res.json({ received: true, type: 'spotlight_unhandled', eventType });
    }

    if (!subscriberId || !creatorId || !ccbillSubId) {
      console.warn('[CCBill webhook] custom fields incompletos, skip');
      return res.json({ received: true, skipped: 'incomplete_fields' });
    }

    // Routing por event type
    switch (eventType) {
      case 'NewSaleSuccess': {
        const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        await supabase.from('ccbill_subscriptions').upsert({
          subscriber_id: subscriberId,
          creator_id: creatorId,
          tier_id: tierId || null,
          ccbill_subscription_id: ccbillSubId,
          ccbill_sub_account_id: subAccount,
          amount_usd: amountUsd,
          status: 'active',
          current_period_end: periodEnd,
          last_renewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'subscriber_id,creator_id' });

        // Mirror en creator_subscriptions para que el resto del código lo vea
        await supabase.from('creator_subscriptions').upsert({
          subscriber_id: subscriberId,
          creator_id: creatorId,
          tier_id: tierId || null,
          subscription_price: amountUsd,
          status: 'active',
          current_period_end: periodEnd,
          auto_renew: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'subscriber_id,creator_id' });

        createNotification(creatorId, 'subscription',
          '¡Nuevo suscriptor!', `Vía CCBill · $${amountUsd.toFixed(2)}`,
          { subscriber_id: subscriberId, processor: 'ccbill' }
        ).catch(() => {});
        sendPushToUser(creatorId, {
          title: '¡Nuevo suscriptor!',
          body: `Vía CCBill · $${amountUsd.toFixed(2)}`,
        }).catch(() => {});

        // v68 welcome message automation
        import('./welcomeMessageController.js').then(({ sendWelcomeMessageOnSubscribe }) =>
          sendWelcomeMessageOnSubscribe(creatorId, subscriberId).catch(() => {})
        ).catch(() => {});

        // v71: fan_stats
        const coinsEquiv = Math.round(amountUsd * 100);
        import('./creatorAdvancedController.js').then(({ incrementFanStats }) =>
          incrementFanStats({ fanId: subscriberId, creatorId, coins: coinsEquiv, kind: 'sub' }).catch(() => {})
        ).catch(() => {});
        break;
      }

      case 'Renewal': {
        const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        await supabase.from('ccbill_subscriptions').update({
          status: 'active',
          current_period_end: periodEnd,
          last_renewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('ccbill_subscription_id', ccbillSubId);

        await supabase.from('creator_subscriptions').update({
          status: 'active',
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }).eq('subscriber_id', subscriberId).eq('creator_id', creatorId);
        break;
      }

      case 'Cancellation':
      case 'Expiration': {
        await supabase.from('ccbill_subscriptions').update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('ccbill_subscription_id', ccbillSubId);

        await supabase.from('creator_subscriptions').update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          auto_renew: false,
          updated_at: new Date().toISOString(),
        }).eq('subscriber_id', subscriberId).eq('creator_id', creatorId);

        createNotification(subscriberId, 'sub_canceled',
          'Suscripción cancelada', 'Mantienes acceso hasta el final del periodo',
          { creator_id: creatorId, processor: 'ccbill' }
        ).catch(() => {});
        break;
      }

      case 'Chargeback':
      case 'Refund': {
        await supabase.from('ccbill_subscriptions').update({
          status: 'chargeback',
          updated_at: new Date().toISOString(),
        }).eq('ccbill_subscription_id', ccbillSubId);

        await supabase.from('creator_subscriptions').update({
          status: 'canceled',
          auto_renew: false,
          updated_at: new Date().toISOString(),
        }).eq('subscriber_id', subscriberId).eq('creator_id', creatorId);

        console.warn(`[CCBill] chargeback en sub ${ccbillSubId} — revisar`);
        break;
      }

      default:
        console.log(`[CCBill webhook] tipo no manejado: ${eventType}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[CCBill webhook] error:', err.message);
    res.status(500).end();
  }
};

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/payments/ccbill/my-account
// Permite al creator setear sus credenciales CCBill (sub_account + form_id).
// Body: { sub_account_id, recurring_form_id }
// ════════════════════════════════════════════════════════════════════════════
export const setMyCCBillAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sub_account_id, recurring_form_id } = req.body || {};

    if (!sub_account_id || !recurring_form_id) {
      return res.status(400).json({ error: 'sub_account_id y recurring_form_id requeridos' });
    }

    const { data: profile } = await supabase
      .from('profiles').select('is_adult_creator').eq('id', userId).single();
    if (!profile?.is_adult_creator) {
      return res.status(403).json({ error: 'Solo creadores adultos pueden configurar CCBill' });
    }

    await supabase
      .from('profiles')
      .update({
        ccbill_sub_account_id: String(sub_account_id).slice(0, 32),
        ccbill_recurring_form_id: String(recurring_form_id).slice(0, 32),
        ccbill_account_status: 'pending',  // hasta validación manual del admin
        preferred_processor: 'ccbill',
      })
      .eq('id', userId);

    res.json({ success: true, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/payments/ccbill/my-account — status actual
// ════════════════════════════════════════════════════════════════════════════
export const getMyCCBillAccount = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('ccbill_sub_account_id, ccbill_recurring_form_id, ccbill_account_status, preferred_processor')
      .eq('id', req.user.id)
      .single();
    res.json({
      configured: !!profile?.ccbill_sub_account_id && !!profile?.ccbill_recurring_form_id,
      status: profile?.ccbill_account_status || null,
      sub_account_id: profile?.ccbill_sub_account_id || null,
      recurring_form_id: profile?.ccbill_recurring_form_id || null,
      preferred_processor: profile?.preferred_processor || 'stripe',
      ccbill_enabled_globally: isCCBillConfigured(),
    });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
};
