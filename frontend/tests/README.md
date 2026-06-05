# Tests — Destino TV

**44 tests Playwright** repartidos en dos suites:

- **smoke.spec.js** (30 tests) — corren siempre, sin auth
- **auth.spec.js** (14 tests) — corren si hay seed user configurado, si no se saltan

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

## Tests autenticados (auth.spec.js)

Cubren login, persistencia de sesión, navegación a Settings/Dashboard, logout y visibilidad del bloque 2FA. Para correrlos, define dos env vars:

```bash
export TEST_USER_EMAIL=test+playwright@destino.app
export TEST_USER_PASSWORD=<password>
npm test
```

Sin esas vars, los 14 tests se saltan con `test.describe.skip` — los smoke tests siguen corriendo. Esto permite que un CI sin credenciales pase verde.

**Crear el seed user**: una vez, hacer signup manual en el environment objetivo (Vercel preview o local), confirmar email, completar perfil mínimo (edad ≥ 18, bio, una foto). Guardar credenciales en GitHub Actions secrets o `.env.test` (gitignored).

El seed user **no debe** tener 2FA activado ni ser admin — el flujo es de un usuario "normal".

## Qué NO cubren todavía

- Flow privado/exclusive end-to-end (requiere 2 cuentas live simultáneas)
- Battles entre creators (requiere 2 cuentas live)
- Pagos reales (Stripe test cards en sandbox)
- Push notifications (requiere Firebase setup)
- Stories upload (cuando exista la feature)

Para esos, plan futuro: spin up de Playwright con `browser.newContext()` ×2 en paralelo + sandbox de Stripe.
