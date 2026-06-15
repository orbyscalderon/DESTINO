// Billing — webhooks de processors + endpoint para generar checkout URL.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authPublisher } from '../lib/auth.js';
import { sendMail, templates } from '../lib/email.js';
import { verifyVerotelSignature, verifyMobiusSignature, verifySegPaySignature } from '../lib/webhooks.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// Tiers (USD/mes). Configurar en env si querés.
const TIERS = {
  standard: { price: 0,  days: 30, description: 'Anuncio básico, 30 días' },
  premium:  { price: 19, days: 30, description: 'Resaltado, prioridad media' },
  vip:      { price: 39, days: 30, description: 'Top de categoría' },
  top:      { price: 79, days: 30, description: 'Top de país, banner destacado' },
};

router.get('/tiers', (_req, res) => res.json({ tiers: TIERS }));

// GET /api/billing/checkout-url?tier=premium&listing_id=...
// Devuelve la URL del processor (Verotel/MobiusPay) donde el publisher paga.
router.post('/checkout-url', authPublisher, async (req, res) => {
  try {
    const { tier, listing_id } = req.body || {};
    if (!TIERS[tier]) return res.status(400).json({ error: 'Tier inválido' });
    if (tier === 'standard') return res.json({ url: null, free: true });

    const { data: listing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', listing_id).maybeSingle();
    if (!listing || listing.publisher_id !== req.publisher.id) {
      return res.status(403).json({ error: 'No es tu listing' });
    }

    // Generación de URL específica por processor:
    const processor = process.env.PRIMARY_PROCESSOR || 'verotel';
    let url;
    if (processor === 'verotel') {
      // Verotel Flexpay — flexible URL con custom params
      const merchantId = process.env.VEROTEL_MERCHANT_ID;
      const shopId = process.env.VEROTEL_SHOP_ID;
      const price = TIERS[tier].price;
      url = `https://secure.verotel.com/startorder` +
        `?version=3&type=subscription&merchantId=${merchantId}&shopId=${shopId}` +
        `&priceAmount=${price}&priceCurrency=USD&period=P${TIERS[tier].days}D` +
        `&custom1=${listing_id}&custom2=${tier}&custom3=${req.publisher.id}`;
    } else if (processor === 'mobiuspay') {
      const merchantId = process.env.MOBIUS_MERCHANT_ID;
      url = `https://payment.mobiuspayments.com/checkout` +
        `?merchant=${merchantId}&amount=${TIERS[tier].price}&currency=USD` +
        `&custom1=${listing_id}&custom2=${tier}&custom3=${req.publisher.id}`;
    } else {
      return res.status(500).json({ error: 'Processor no configurado' });
    }

    res.json({ url, tier, price: TIERS[tier].price });
  } catch (err) {
    res.status(500).json({ error: 'Error generando checkout' });
  }
});

// ── WEBHOOKS ────────────────────────────────────────────────────────────
// Cada processor manda su POST. Verificamos signature, registramos pago,
// actualizamos subscription, notificamos al publisher.
// Para HMAC con rawBody necesitamos express.raw — el server.js lo wireá específicamente.

router.post('/webhook/verotel', async (req, res) => {
  try {
    const ok = verifyVerotelSignature(req.body || req.query);
    if (!ok) return res.status(401).send('Invalid signature');
    const body = req.body || req.query;
    await handleProcessorEvent({
      processor: 'verotel',
      event_type: mapVerotelEvent(body.event),
      processor_txn_id: body.referenceID || body.saleID,
      amount: parseFloat(body.priceAmount || 0),
      listing_id: body.custom1,
      tier: body.custom2,
      publisher_id: body.custom3,
      raw: body,
      ip: req.ip,
    });
    res.send('OK');
  } catch (err) {
    console.error('[verotel:webhook]', err.message);
    res.status(500).send('error');
  }
});

router.post('/webhook/mobiuspay', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawBody = req.body;
    const ok = verifyMobiusSignature({ rawBody: rawBody.toString('utf8'), headers: req.headers });
    if (!ok) return res.status(401).send('Invalid signature');
    const body = JSON.parse(rawBody.toString('utf8'));
    await handleProcessorEvent({
      processor: 'mobiuspay',
      event_type: body.event_type,
      processor_txn_id: body.transaction_id,
      amount: parseFloat(body.amount || 0),
      listing_id: body.custom1,
      tier: body.custom2,
      publisher_id: body.custom3,
      raw: body,
      ip: req.ip,
    });
    res.send('OK');
  } catch (err) {
    res.status(500).send('error');
  }
});

router.post('/webhook/segpay', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawBody = req.body;
    const ok = verifySegPaySignature({ rawBody: rawBody.toString('utf8'), headers: req.headers });
    if (!ok) return res.status(401).send('Invalid signature');
    const body = JSON.parse(rawBody.toString('utf8'));
    await handleProcessorEvent({
      processor: 'segpay',
      event_type: body.eventType,
      processor_txn_id: body.transactionId,
      amount: parseFloat(body.amount || 0),
      listing_id: body.custom1,
      tier: body.custom2,
      publisher_id: body.custom3,
      raw: body,
      ip: req.ip,
    });
    res.send('OK');
  } catch (err) {
    res.status(500).send('error');
  }
});

function mapVerotelEvent(e) {
  const map = { initial: 'initial', rebill: 'rebill', cancel: 'cancellation',
                refund: 'refund', chargeback: 'chargeback' };
  return map[e] || 'unknown';
}

async function handleProcessorEvent({ processor, event_type, processor_txn_id,
                                       amount, listing_id, tier, publisher_id, raw, ip }) {
  if (!processor_txn_id) throw new Error('Missing txn_id');

  // Idempotency — UNIQUE constraint en (processor, processor_txn_id, event_type) hace el resto.
  const { error } = await supabase.from('encuentros_payments').insert({
    publisher_id, listing_id, processor, processor_txn_id, event_type,
    amount_usd: amount, status: ['initial','rebill'].includes(event_type) ? 'succeeded' : 'refunded',
    raw_webhook: raw, ip,
  });
  if (error && !error.message.includes('duplicate')) throw error;

  // Update subscription
  if (['initial', 'rebill'].includes(event_type)) {
    const days = (TIERS[tier]?.days) || 30;
    const periodEnd = new Date(Date.now() + days * 86400 * 1000);
    // Upsert subscription
    await supabase.from('encuentros_subscriptions').upsert({
      listing_id, publisher_email: '', tier, price_usd: amount,
      processor, processor_sub_id: processor_txn_id,
      current_period_end: periodEnd.toISOString(), status: 'active',
    }, { onConflict: 'processor_sub_id' });

    // Extender expires_at del listing + bump tier
    await supabase.from('encuentros_listings').update({
      tier, tier_expires_at: periodEnd.toISOString(),
      expires_at: periodEnd.toISOString(),
      status: 'active',  // payment confirma que está activo
    }).eq('id', listing_id);

    // Notify
    const { data: pub } = await supabase
      .from('encuentros_publishers').select('email').eq('id', publisher_id).maybeSingle();
    if (pub?.email) {
      const tpl = templates.payment_received({ tier, amount });
      sendMail({ to: pub.email, template: 'payment_received', subject: tpl.subject, html: tpl.html,
                 metadata: { listing_id, processor_txn_id } }).catch(() => {});
    }
  } else if (event_type === 'cancellation') {
    await supabase.from('encuentros_subscriptions')
      .update({ status: 'cancelled', auto_renew: false })
      .eq('processor_sub_id', processor_txn_id);
  } else if (['refund', 'chargeback'].includes(event_type)) {
    await supabase.from('encuentros_listings')
      .update({ status: 'paused' })
      .eq('id', listing_id);
    await logAudit({
      actor_type: 'system', action: `payment.${event_type}`,
      target_type: 'listing', target_id: listing_id,
    });
  }
}

export default router;
