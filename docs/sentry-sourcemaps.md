# Sentry sourcemaps

Sin sourcemaps, los stack traces de Sentry en producción se ven así:

```
at o (https://destino-sigma.vercel.app/assets/vendor-duajloNp.js:38:1294)
```

Inútiles para debugging. Con sourcemaps suben así:

```
at SubscribeButton (frontend/src/components/ui/SubscribeButton.jsx:42:18)
```

## Cómo activarlo (~5 minutos)

1. **Genera un Auth Token en Sentry**
   - Ve a https://sentry.io → tu organización → **Settings** → **Auth Tokens** → **Create New Token**
   - Scopes mínimos: `project:releases` + `project:read` + `org:read`
   - Copia el token (empieza con `sntrys_…`)

2. **Encuentra el slug de tu org y tu proyecto**
   - Sentry → **Settings** → **General Settings** → "Organization Slug" (ej. `destino`)
   - Sentry → tu proyecto → **Settings** → "Project Name" en la URL (ej. `destino-web`)

3. **Agrega las 3 variables en Vercel**
   - Vercel → Project Settings → **Environment Variables**
   - `SENTRY_AUTH_TOKEN` = el token del paso 1
   - `SENTRY_ORG` = slug del paso 2
   - `SENTRY_PROJECT` = slug del paso 2
   - Marca los 3 como **Production** + **Preview** (no Development)

4. **Redeploy**
   - Vercel auto-redeploys al cambiar env vars, o haz un push trivial
   - En el build log debes ver mensajes de `@sentry/vite-plugin` subiendo sourcemaps

## Cómo funciona

`vite.config.js` carga `@sentry/vite-plugin` **sólo si** las 3 vars están presentes.
Cuando se activa:
- Pone `build.sourcemap = true` para que Rollup genere los `.map`
- Tras el build sube los `.map` a Sentry asociados al `release`
- **Borra los `.map` del `dist/`** antes de servir — así no se filtran al público
- El release se nombra con `VERCEL_GIT_COMMIT_SHA` si está disponible,
  si no con timestamp

Es seguro hacer commits y deploys sin las vars: el plugin simplemente se omite
y el build sigue normal.
