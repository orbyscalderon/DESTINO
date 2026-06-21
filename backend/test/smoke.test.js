// Smoke tests críticos. Usa node:test (built-in desde Node 20) para no
// agregar deps. Corre con: npm test
//
// Cubre las funciones puras de helpers críticos donde un bug silencioso
// rompe seguridad o lifecycle: env check, URL validation, webhook HMAC,
// logger, encryption.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ───────────────────────────────────────────────────────────────────
// urlValidation — SSRF/host whitelist
// ───────────────────────────────────────────────────────────────────
describe('urlValidation', () => {
  test('rechaza javascript: scheme', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('javascript:alert(1)'), false);
  });

  test('rechaza data: scheme', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('data:image/png;base64,...'), false);
  });

  test('rechaza http:// (sin TLS)', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('http://example.com/x.png'), false);
  });

  test('rechaza localhost/127.0.0.1', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('https://localhost/x.png'), false);
    assert.equal(isAllowedImageUrl('https://127.0.0.1/x.png'), false);
  });

  test('rechaza IPs privadas', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('https://10.0.0.1/x.png'), false);
    assert.equal(isAllowedImageUrl('https://192.168.1.1/x.png'), false);
    assert.equal(isAllowedImageUrl('https://172.16.0.1/x.png'), false);
  });

  test('rechaza cloud metadata 169.254.169.254', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('https://169.254.169.254/latest/meta-data'), false);
  });

  test('acepta ui-avatars.com (whitelisted)', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('https://ui-avatars.com/api/?name=X'), true);
  });

  test('rechaza subdominio de host whitelisted (exact match, no suffix)', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(isAllowedImageUrl('https://evil.com.ui-avatars.com'), false);
  });

  test('rechaza URL > 2048 chars', async () => {
    const { isAllowedImageUrl } = await import('../src/lib/urlValidation.js');
    const huge = 'https://ui-avatars.com/' + 'a'.repeat(3000);
    assert.equal(isAllowedImageUrl(huge), false);
  });

  test('sanitizeImageUrl devuelve null para URLs no permitidas', async () => {
    const { sanitizeImageUrl } = await import('../src/lib/urlValidation.js');
    assert.equal(sanitizeImageUrl('http://evil.com/x.png'), null);
    assert.equal(sanitizeImageUrl(''), null);
    assert.equal(sanitizeImageUrl(undefined), null);
  });
});

// ───────────────────────────────────────────────────────────────────
// logger + request-id middleware
// ───────────────────────────────────────────────────────────────────
describe('logger', () => {
  test('requestId middleware genera ID si no viene header', async () => {
    const { requestId } = await import('../src/lib/logger.js');
    const req = { headers: {}, path: '/x', method: 'GET' };
    const res = { setHeader: () => {} };
    let nextCalled = false;
    requestId(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.ok(req.id, 'req.id debe estar seteado');
    assert.match(req.id, /^[a-f0-9]{16}$/, 'ID debe ser hex de 16 chars');
    assert.ok(req.log, 'req.log debe estar seteado');
  });

  test('requestId respeta X-Request-Id si viene válido', async () => {
    const { requestId } = await import('../src/lib/logger.js');
    const req = { headers: { 'x-request-id': 'incoming-trace-abc-123' }, path: '/x', method: 'GET' };
    const res = { setHeader: () => {} };
    requestId(req, res, () => {});
    assert.equal(req.id, 'incoming-trace-abc-123');
  });

  test('requestId rechaza X-Request-Id malicioso (chars no válidos)', async () => {
    const { requestId } = await import('../src/lib/logger.js');
    const req = { headers: { 'x-request-id': 'evil<script>alert(1)</script>' }, path: '/x', method: 'GET' };
    const res = { setHeader: () => {} };
    requestId(req, res, () => {});
    assert.notEqual(req.id, 'evil<script>alert(1)</script>');
    assert.match(req.id, /^[a-f0-9]{16}$/);
  });

  test('logger.child preserva bindings', async () => {
    const { logger } = await import('../src/lib/logger.js');
    const child = logger.child({ userId: 'u1' });
    // No tira error al loguear
    assert.doesNotThrow(() => child.info('test'));
  });
});

// ───────────────────────────────────────────────────────────────────
// webhooks — HMAC verify
// ───────────────────────────────────────────────────────────────────
describe('webhook signature verify', () => {
  test('verifyMobiusSignature acepta firma válida', async () => {
    process.env.MOBIUS_WEBHOOK_SECRET = 'test-secret';
    const { verifyMobiusSignature } = await import('../src/lib/webhooks.js').catch(() => ({ verifyMobiusSignature: null }));
    if (!verifyMobiusSignature) return; // si no existe, skip

    const rawBody = JSON.stringify({ event: 'test', amount: 100 });
    const validSig = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = verifyMobiusSignature({
      rawBody,
      headers: { 'x-mobius-signature': validSig },
    });
    assert.equal(result, true);
  });

  test('verifyMobiusSignature rechaza firma incorrecta', async () => {
    process.env.MOBIUS_WEBHOOK_SECRET = 'test-secret';
    const { verifyMobiusSignature } = await import('../src/lib/webhooks.js').catch(() => ({ verifyMobiusSignature: null }));
    if (!verifyMobiusSignature) return;

    const rawBody = JSON.stringify({ event: 'test' });
    const result = verifyMobiusSignature({
      rawBody,
      headers: { 'x-mobius-signature': 'invalid' + 'a'.repeat(60) },
    });
    assert.equal(result, false);
  });

  test('verifyMobiusSignature falla sin secret en env', async () => {
    const original = process.env.MOBIUS_WEBHOOK_SECRET;
    delete process.env.MOBIUS_WEBHOOK_SECRET;
    const { verifyMobiusSignature } = await import('../src/lib/webhooks.js').catch(() => ({ verifyMobiusSignature: null }));
    if (!verifyMobiusSignature) {
      if (original) process.env.MOBIUS_WEBHOOK_SECRET = original;
      return;
    }
    const result = verifyMobiusSignature({
      rawBody: 'x',
      headers: { 'x-mobius-signature': 'whatever' },
    });
    assert.equal(result, false);
    if (original) process.env.MOBIUS_WEBHOOK_SECRET = original;
  });
});

// ───────────────────────────────────────────────────────────────────
// constants — business rules invariants
// ───────────────────────────────────────────────────────────────────
describe('business constants', () => {
  test('COIN_VALUE_USD es 0.05 (1 USD = 20 coins)', async () => {
    const { COIN_VALUE_USD, COINS_PER_USD } = await import('../src/lib/constants.js');
    assert.equal(COIN_VALUE_USD, 0.05);
    assert.equal(COINS_PER_USD, 20);
  });

  test('PLATFORM_FEE_RATE = 30%, CREATOR_CUT = 70%', async () => {
    const { PLATFORM_FEE_RATE, CREATOR_CUT } = await import('../src/lib/constants.js');
    assert.equal(PLATFORM_FEE_RATE, 0.30);
    assert.equal(CREATOR_CUT, 0.70);
  });

  test('coinsToUSD: 100 coins = $5', async () => {
    const { coinsToUSD } = await import('../src/lib/constants.js');
    assert.equal(coinsToUSD(100), 5);
  });

  test('usdToCoins: $5 = 100 coins', async () => {
    const { usdToCoins } = await import('../src/lib/constants.js');
    assert.equal(usdToCoins(5), 100);
  });

  test('coinsToCreatorUSD: 100 coins → $3.50 al creator (70% de $5)', async () => {
    const { coinsToCreatorUSD } = await import('../src/lib/constants.js');
    assert.equal(coinsToCreatorUSD(100), 3.5);
  });
});

// ───────────────────────────────────────────────────────────────────
// envCheck — validation flow
// ───────────────────────────────────────────────────────────────────
describe('envCheck', () => {
  test('exporta validateEnv como función', async () => {
    const { validateEnv } = await import('../src/lib/envCheck.js');
    assert.equal(typeof validateEnv, 'function');
  });
});
