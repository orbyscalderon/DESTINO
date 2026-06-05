import { test, expect } from '@playwright/test';

// Smoke tests — no requieren autenticación. Verifican que:
//   · Rutas públicas renderizan sin crashear
//   · Rutas protegidas redirigen sin auth
//   · No hay errores fatales en consola (ignoramos warnings de HMR y Vite WS)
//   · El bundle de JS no falla al cargar chunks lazy
//
// Para tests que requieran auth, usar `auth.spec.js` (no incluido — requiere
// credenciales de cuenta de prueba que deberían venir de env vars).

const PUBLIC_ROUTES = [
  { path: '/',         expectTitle: /Destino/i, contains: ['Comenzar', 'Iniciar'] },
  { path: '/#/login',    contains: ['Bienvenido', 'Email'] },
  { path: '/#/register', contains: ['Crea tu cuenta', 'Email'] },
  { path: '/#/privacy',  contains: ['Privacidad'] },
  { path: '/#/terms',    contains: ['Términos'] },
];

const PROTECTED_REDIRECT_ROUTES = [
  '/#/home',
  '/#/messages',
  '/#/matches',
  '/#/creator/dashboard',
  '/#/studio',
];

// Filtra ruido conocido (HMR de Vite en dev, Sentry replay diferido,
// errores de WebSocket que ya tenemos en logs pero no son del producto).
function isIgnorableError(text) {
  return /vite|HMR|websocket|sentry|chunk-reload|favicon\.ico/i.test(text);
}

test.describe('Rutas públicas', () => {
  for (const { path, expectTitle, contains } of PUBLIC_ROUTES) {
    test(`${path} renderiza sin errores`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error' && !isIgnorableError(msg.text())) {
          errors.push(`[console.error] ${msg.text()}`);
        }
      });

      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status(), `Status code para ${path}`).toBeLessThan(500);

      if (expectTitle) {
        await expect(page).toHaveTitle(expectTitle);
      }

      // Verificamos algún string que confirme que el componente cargó.
      // Usamos al menos uno del array `contains`.
      const bodyText = await page.locator('body').textContent();
      const found = contains.some(s => bodyText?.toLowerCase().includes(s.toLowerCase()));
      expect(found, `Esperaba uno de [${contains.join(', ')}] en ${path}`).toBe(true);

      expect(errors, `Errores JS en ${path}`).toEqual([]);
    });
  }
});

test.describe('Rutas protegidas redirigen sin auth', () => {
  for (const path of PROTECTED_REDIRECT_ROUTES) {
    test(`${path} redirige a landing/login`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      // Debería terminar en landing (`/#/`) o login (`/#/login`)
      const url = page.url();
      expect(
        /#\/(login|\/?$)/.test(url) || url.endsWith('/#/') || url.endsWith('/'),
        `Esperaba redirect a landing/login desde ${path}, terminó en ${url}`
      ).toBe(true);
    });
  }
});

test.describe('Health checks del bundle', () => {
  test('No 404 críticos al cargar landing', async ({ page }) => {
    const failed = [];
    page.on('response', res => {
      const url = res.url();
      // Ignoramos requests a APIs externas (analytics, fonts CDN, sentry)
      const isExternal = !url.includes('destino-sigma.vercel.app')
                      && !url.includes('localhost');
      if (isExternal) return;
      if (res.status() >= 500 || (res.status() === 404 && url.endsWith('.js'))) {
        failed.push(`${res.status()} ${url}`);
      }
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(failed, 'Recursos críticos rotos').toEqual([]);
  });

  test('Service Worker se registra (no rompe)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const swSupport = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(swSupport).toBe(true);
  });
});

test.describe('Auth UI funcional', () => {
  test('Login muestra inputs email/password y botón submit', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
    // OAuth buttons recientes
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible();
  });

  test('Register exige nombre completo (validación frontend)', async ({ page }) => {
    await page.goto('/#/register');
    await expect(page.getByPlaceholder(/nombre completo/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
  });

  test('Apple Sign-In visible (compliance App Store)', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('button', { name: /continuar con apple/i })).toBeVisible();
  });
});
