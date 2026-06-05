import { test, expect } from '@playwright/test';

// E2E de flujos complejos de shows: battle entre 2 creators y private show
// con compra de ticket.
//
// REQUIERE 2 cuentas de creator en el environment target. Ambas deben tener:
// · Perfil completo, edad ≥18
// · is_creator=true (no necesita is_verified, pero ayuda)
// · Saldo de coins suficiente para tickets (~500 c/u)
//
// Sin las env vars, todo este archivo se salta. Esto es deliberadamente
// más costoso que los smoke tests — solo correr en pre-release, no en cada commit.
//
// Para activar:
//   E2E_CREATOR1_EMAIL=creator1@destino.app
//   E2E_CREATOR1_PASSWORD=...
//   E2E_CREATOR2_EMAIL=creator2@destino.app
//   E2E_CREATOR2_PASSWORD=...
//   E2E_VIEWER_EMAIL=viewer@destino.app
//   E2E_VIEWER_PASSWORD=...

const C1_EMAIL  = process.env.E2E_CREATOR1_EMAIL;
const C1_PASS   = process.env.E2E_CREATOR1_PASSWORD;
const C2_EMAIL  = process.env.E2E_CREATOR2_EMAIL;
const C2_PASS   = process.env.E2E_CREATOR2_PASSWORD;
const V_EMAIL   = process.env.E2E_VIEWER_EMAIL;
const V_PASS    = process.env.E2E_VIEWER_PASSWORD;

const hasCreds = C1_EMAIL && C1_PASS && C2_EMAIL && C2_PASS;
const describeShows = hasCreds ? test.describe : test.describe.skip;

async function login(page, email, password) {
  await page.goto('/#/login');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/contraseña/i).fill(password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.waitForURL(url => /\/#\/(home|onboarding)/.test(url.toString()), { timeout: 20_000 });
}

describeShows('Battle entre 2 creators', () => {
  test('Creator A inicia show + invita a Creator B + battle se acepta', async ({ browser }) => {
    // 2 contextos en paralelo — 1 por creator
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Paso 1: ambos hacen login
      await Promise.all([
        login(pageA, C1_EMAIL, C1_PASS),
        login(pageB, C2_EMAIL, C2_PASS),
      ]);

      // Paso 2: A entra a Studio y arranca show
      await pageA.goto('/#/studio');
      await pageA.waitForLoadState('networkidle');
      // Buscar botón "Ir en vivo" o equivalente — el texto puede variar
      const goLiveBtn = pageA.getByRole('button', { name: /ir en vivo|go live|iniciar show/i }).first();
      // En el environment de test puede fallar el getUserMedia → marcar como expected
      const goLiveExists = await goLiveBtn.isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!goLiveExists, 'Studio UI cambió o getUserMedia no disponible en headless');

      // Paso 3: B busca a A en la lista de shows
      await pageB.goto('/#/shows');
      await pageB.waitForLoadState('networkidle');

      // El test real necesitaría:
      // 1. A da click en "Invitar a battle" → modal lista creators online
      // 2. A busca a B y le invita
      // 3. B recibe el modal `battle_invite_received` y acepta
      // 4. Ambos ven el opponent tile en su preview
      //
      // Como esto depende de getUserMedia + LiveKit (que no funcionan en CI
      // headless sin --use-fake-device-for-media-stream), marcamos el test
      // como "documentación del flow esperado" más que validación real.

      test.skip(true, 'E2E completo de battle requiere browser flags --use-fake-device-for-media-stream y un environment con LiveKit accesible');
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

describeShows('Private show con compra de ticket', () => {
  test('Viewer compra ticket + creator acepta + viewer reconecta a room privado', async ({ browser }) => {
    test.skip(!V_EMAIL || !V_PASS, 'Falta E2E_VIEWER_EMAIL/PASSWORD para este flow');

    const ctxC = await browser.newContext();
    const ctxV = await browser.newContext();
    const pageC = await ctxC.newPage();
    const pageV = await ctxV.newPage();

    try {
      await Promise.all([
        login(pageC, C1_EMAIL, C1_PASS),
        login(pageV, V_EMAIL, V_PASS),
      ]);

      // El flow real (cuando el environment soporta media):
      // 1. C arranca show desde /studio
      // 2. V busca el show de C y entra
      // 3. V tap "Show privado" → modal de tickets
      // 4. V tap "Comprar (X coins)"
      // 5. Backend descuenta coins, marca pending_private_request
      // 6. C ve el panel de solicitud + "Aceptar"
      // 7. C tap "Aceptar privado" → backend cambia session.type='private',
      //    spawn new room, deja allowed_viewers=[V.id]
      // 8. Ambos reconectan al nuevo room
      // 9. V ve la nueva pantalla "Show privado en curso"
      // 10. min_ends_at se enforcement — C no puede terminar antes
      // 11. C tap "Volver a broadcast" cuando min_ends_at expira

      test.skip(true, 'E2E completo de private show requiere LiveKit + flujo de pago real');
    } finally {
      await ctxC.close();
      await ctxV.close();
    }
  });
});

// Test que SÍ puede correr en headless: verificación de API contracts
describeShows('API contracts de shows (sin video)', () => {
  test('Endpoints públicos de shows responden con shape esperada', async ({ request }) => {
    // Sin auth — endpoints públicos de shows. El listado de shows en vivo es público.
    const res = await request.get('/api/shows?status=live');
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('shows');
      expect(Array.isArray(data.shows)).toBe(true);
    }
  });

  test('Sitemap responde XML válido', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<?xml');
    expect(body).toContain('<urlset');
  });

  test('Public stats endpoint responde con users/creators/live_now', async ({ request }) => {
    const res = await request.get('/api/seo/public-stats');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('users');
    expect(data).toHaveProperty('creators');
    expect(data).toHaveProperty('live_now');
  });
});

if (!hasCreds) {
  test.skip('E2E creators no configurados — define E2E_CREATOR1/2_EMAIL/PASSWORD', () => {});
}
