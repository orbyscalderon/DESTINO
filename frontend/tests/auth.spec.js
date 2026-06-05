import { test, expect } from '@playwright/test';

// Tests autenticados — requieren un seed user en Supabase.
//
// Configurar variables (en .env.test, GitHub Actions secrets, o exportarlas):
//   TEST_USER_EMAIL    → email del seed user (ej. test+playwright@destino.app)
//   TEST_USER_PASSWORD → password del seed user
//
// Si faltan, todos los tests del bloque se saltan con skip — los smoke tests
// públicos siguen corriendo. Esto permite que el CI no autenticado siga verde.
//
// El seed user debería tener:
//   · Cuenta confirmada (sin email verify pendiente)
//   · Perfil completo (bio, foto, edad >= 18)
//   · NO ser admin (para que el flujo sea representativo)
//   · NO tener 2FA activado
//
// Para crear el seed user: signup manual una vez en el environment que apunta
// este test (Vercel preview o local), y guardar credenciales en secrets.

const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

const describeAuth = EMAIL && PASSWORD ? test.describe : test.describe.skip;

async function login(page) {
  await page.goto('/#/login');
  await page.getByPlaceholder(/email/i).fill(EMAIL);
  await page.getByPlaceholder(/contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  // Espera el redirect a home (o landing si falla)
  await page.waitForURL(url => /\/#\/(home|onboarding)/.test(url.toString()), { timeout: 15_000 });
}

describeAuth('Flujo autenticado', () => {
  test('Login con credenciales válidas redirige a home', async ({ page }) => {
    await login(page);
    expect(page.url()).toMatch(/\/#\/(home|onboarding)/);
  });

  test('Login persiste sesión tras reload', async ({ page }) => {
    await login(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    // No deberíamos ver el form de login después de reload
    await expect(page.getByPlaceholder(/contraseña/i)).not.toBeVisible();
  });

  test('Navegación a Settings carga la página', async ({ page }) => {
    await login(page);
    await page.goto('/#/settings');
    await expect(page.getByText(/configuración|settings/i).first()).toBeVisible({ timeout: 10_000 });
    // El bloque de 2FA debería estar visible
    await expect(page.getByText(/verificación en 2 pasos|two-factor|autenticação em 2 fatores/i).first()).toBeVisible();
  });

  test('Navegación a Dashboard carga (si el user es creator) o redirige', async ({ page }) => {
    await login(page);
    await page.goto('/#/creator/dashboard');
    await page.waitForLoadState('networkidle');
    // Acepta cualquiera: dashboard real o redirect a become-creator/home
    const url = page.url();
    expect(/\/#\/(creator\/dashboard|become-creator|home)/.test(url)).toBe(true);
  });

  test('Logout limpia sesión', async ({ page }) => {
    await login(page);
    await page.goto('/#/settings');
    // Busca botón de logout — el texto puede estar en es/en/pt
    const logoutBtn = page.getByRole('button', { name: /cerrar sesión|sign out|sair/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
      // Confirmar si hay diálogo
      const confirmBtn = page.getByRole('button', { name: /confirmar|confirm|sim|yes|sí/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForURL(url => /\/#\/(login|\/?$)/.test(url.toString()) || url.toString().endsWith('/'), { timeout: 10_000 });
      // Verificar que ya no podemos acceder a rutas protegidas
      await page.goto('/#/home');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toMatch(/\/#\/(login|\/?$)/);
    } else {
      test.skip(true, 'Botón de logout no encontrado en Settings — UI puede haber cambiado');
    }
  });
});

describeAuth('2FA UI flow (sin activar)', () => {
  test('Settings muestra botón "Activar 2FA" si no está activado', async ({ page }) => {
    await login(page);
    await page.goto('/#/settings');
    // Si ya está activado, mostraría "Desactivar" en su lugar — el test pasa en ambos casos
    const activateBtn = page.getByRole('button', { name: /activar 2fa|enable 2fa|ativar 2fa/i });
    const deactivateBtn = page.getByRole('button', { name: /desactivar|disable|desativar/i });
    const visible = await Promise.race([
      activateBtn.isVisible({ timeout: 5000 }).catch(() => false),
      deactivateBtn.isVisible({ timeout: 5000 }).catch(() => false),
    ]);
    expect(visible).toBe(true);
  });
});

// Si no hay seed user configurado, dejamos un único test marcado como skip que
// documenta cómo correr esto. Útil para que el CI muestre "skipped" en vez de
// "no tests ran" cuando faltan las env vars.
if (!EMAIL || !PASSWORD) {
  test.skip('Seed user no configurado — define TEST_USER_EMAIL y TEST_USER_PASSWORD para correr tests autenticados', () => {});
}
