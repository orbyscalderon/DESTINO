# Smoke Tests — Destino TV

30 tests Playwright que verifican lo crítico **sin requerir autenticación**.

## Qué cubren

| Suite | Tests | Qué valida |
|---|---|---|
| Rutas públicas | 5 × 2 viewports | Landing, login, register, privacy, terms renderizan sin errores de consola, status < 500, contienen el texto esperado |
| Rutas protegidas | 5 × 2 viewports | `/home`, `/messages`, `/matches`, `/creator/dashboard`, `/studio` redirigen a landing/login sin sesión |
| Health del bundle | 2 × 2 viewports | No hay 404 críticos al cargar chunks, Service Worker se registra |
| Auth UI funcional | 3 × 2 viewports | Inputs visibles, botones Google y Apple presentes |

## Cómo correr

```bash
# Instalar browsers (primera vez)
npx playwright install --with-deps chromium

# Contra producción Vercel (default)
npm test

# Contra dev local (levanta el server primero con `npm run dev`)
npm run test:local

# Modo UI interactivo (debug)
npm run test:ui

# Con browser visible
npm run test:headed
```

## URL base

Default: `https://destino-sigma.vercel.app`

Cambiar con env var:
```bash
PLAYWRIGHT_BASE_URL=https://staging.destino.tv npm test
```

## Viewports testeados

- **chromium-desktop** — 1440×900
- **mobile-iphone** — iPhone 13 (390×844, dpr=3)

Cada test corre en ambos automáticamente.

## CI/CD

Para Vercel preview/production: añadir en `package.json` un workflow GitHub Actions:

```yaml
- run: npx playwright install --with-deps
- run: PLAYWRIGHT_BASE_URL=${{ env.VERCEL_URL }} npm test
```

Variables: `forbidOnly` y `retries: 2` ya activos cuando `CI=true`.

## Qué NO cubren (TODO futuro)

- Flujo autenticado (requiere cuenta de prueba con credenciales en env)
- Flow privado/exclusive end-to-end (requiere 2 cuentas live)
- Battles entre creators (requiere 2 cuentas live)
- Pagos (Stripe test cards en sandbox)
- Push notifications (requiere Firebase setup)

Para esos, planificar tests separados con `playwright.config.js` apuntando a un environment con seed data conocida.
