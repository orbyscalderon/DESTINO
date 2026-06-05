# Sentry — setup y source maps

Sentry ya está integrado en frontend y backend. Lo único que falta es activar source maps en CI para que los stack traces sean legibles.

## Estado actual

Sin source maps subidos a Sentry, ves esto en cada error:
```
TypeError: Cannot read property 'x' of undefined
  at o (chunk-DI4p9Itj.js:1:42342)
  at e (chunk-DI4p9Itj.js:1:43891)
```

Con source maps:
```
TypeError: Cannot read property 'host' of undefined
  at LiveShow.handleResumePublicShow (LiveShow.jsx:2847:18)
  at onClick (LiveShow.jsx:2920:14)
```

La segunda es procesable. La primera no.

## Activación (5 minutos en Vercel)

1. **Crear token en Sentry**: https://sentry.io → Settings → Account → API → Auth Tokens → Create New Token. Scopes mínimos: `project:releases` y `project:read`.

2. **Sacar org y project slug**:
   - Org: la parte después de `sentry.io/` en la URL (ej. `destino-tv`)
   - Project: Settings → Projects → tu proyecto → Project Settings (ej. `destino-web`)

3. **Añadir en Vercel** → tu proyecto → Settings → Environment Variables:

   | Variable | Valor | Environments |
   |---|---|---|
   | `SENTRY_AUTH_TOKEN` | el token del paso 1 | Production, Preview |
   | `SENTRY_ORG` | el slug org | Production, Preview |
   | `SENTRY_PROJECT` | el slug project | Production, Preview |

4. **Redeploy** → Vercel hace el siguiente build con source maps.

[vite.config.js](vite.config.js#L13-L31) detecta las 3 vars y activa el `sentryVitePlugin`, que:
- Genera source maps al compilar (`sourcemap: true`)
- Los sube a Sentry asociados al release `VERCEL_GIT_COMMIT_SHA`
- Los **borra** del `dist/` antes de servir (no quedan públicos)

## Verificar que funciona

Después del deploy, en Sentry → Releases debería aparecer un nuevo release con el commit SHA. Click → "Source Maps" → debe listar los `.map` subidos. Si está vacío, revisa los Vercel build logs por errores del plugin (`Error: 401` = token inválido).

Para forzar un error de prueba y ver el stack mapeado, en cualquier página añade temporalmente:
```js
<button onClick={() => { throw new Error('test sentry') }}>test</button>
```

## Backend (Node Sentry)

Backend ya inicializa Sentry en [server.js:18-24](server.js#L18-L24) cuando `SENTRY_DSN` está presente. No requiere source maps porque Node corre el código sin transpilar. Solo falta confirmar que `SENTRY_DSN` está en Railway.

## Coste

Sampling rate actual en frontend (`main.jsx`): 10% transactions, 5% session replays. Para una app con 1k DAU eso son ~6k events/mes, dentro del Developer plan gratuito de Sentry (5k events/mes con room para spike). Si creces, sube a Team plan ($26/mes para 50k events) antes de bajar el rate.
