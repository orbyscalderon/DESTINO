import { defineConfig, devices } from '@playwright/test';

// Smoke tests del frontend Destino TV. Cubre lo crítico:
// renderizado, navegación, redirects de rutas protegidas, ausencia de
// errores fatales en consola.
//
// Cómo correr:
//   npm test                  → todos los proyectos (chrome desktop + mobile)
//   npm run test:headed       → con browser visible para debug
//   npm run test:ui           → modo UI interactivo
//
// Por defecto golpea la URL definida en BASE_URL (env) o vercel prod.
// En CI conviene levantar el dev server y apuntar a localhost:5173.
//
// El servidor dev NO se levanta automáticamente — si quieres que sí,
// añade `webServer` con `command: 'npm run dev'`.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://destino-sigma.vercel.app';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
