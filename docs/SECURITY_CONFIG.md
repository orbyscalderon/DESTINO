# Security Config Checklist

Configuración recomendada para Supabase / Railway / Vercel / Cloudflare.

## Supabase Dashboard → Settings → Authentication

### JWT
- **JWT expiry**: `3600` segundos (1 h). Más corto = menor ventana de abuso si se filtra; más largo = menos pressure sobre el endpoint de refresh.
- **JWT secret**: rotar **cada 90 días** y siempre tras una contratación / partida de un colaborador con acceso al dashboard.

### Refresh tokens
- **Enable refresh token rotation**: ✅ ON. Si un atacante intercepta un refresh token usado, el siguiente refresh fallará y la sesión se invalida.
- **Refresh token reuse interval**: `10` segundos. Tolerancia para race conditions al refrescar desde varias pestañas.
- **Refresh token expiry**: `2592000` segundos (30 días). Después de ese tiempo el user debe volver a loguearse.

### Sessions
- **Inactivity timeout**: `28800` segundos (8 h). Cierra la sesión si no hubo refresh en ese tiempo.
- **Session timebox**: `2592000` segundos (30 días). Máximo absoluto de una sesión.

### Sign-in / Sign-up
- **Confirm email**: ✅ ON.
- **Secure email change**: ✅ ON (requiere confirmar desde el email viejo).
- **Secure password change**: ✅ ON (requiere reauth).
- **Password requirements**: min 12 chars, requerir mayúscula + minúscula + número + símbolo.

### Bot & abuse
- **Captcha provider**: hCaptcha o Turnstile (ya tenemos `VITE_TURNSTILE_SITE_KEY` previsto).
- **Rate limits**:
  - Sign-up: 5 / hora / IP
  - Sign-in: 10 / hora / IP
  - Password reset: 3 / hora / IP
  - Magic link: 5 / hora / IP

## Backend (.env / Railway env vars)

Variables que deben existir y NO estar en el repo:

- `SUPABASE_URL` — URL del proyecto
- `SUPABASE_SERVICE_KEY` — service_role key (NO la anon)
- `STRIPE_SECRET_KEY` — sk_live_…
- `STRIPE_WEBHOOK_SECRET` — whsec_…
- `CCBILL_DATALINK_USER` / `CCBILL_DATALINK_PASS`
- `JWT_SECRET` (si usamos JWT propio) — random 64 chars
- `TURNSTILE_SECRET_KEY` — server-side validation
- `ALLOWED_IMAGE_HOSTS` — CSV de hosts adicionales para `urlValidation.js` (opcional)

## Frontend (.env.local / Vercel env vars)

- `VITE_SAFE_REDIRECT_HOSTS` — CSV de hosts adicionales para `safeRedirect.js` (opcional). Por defecto Stripe + CCBill + el propio dominio están allowlisted.

## Cloudflare (frontend dominio)

- **WAF managed rules**: ON (OWASP core)
- **Bot fight mode**: ON
- **Always use HTTPS**: ON
- **Min TLS version**: 1.2
- **HSTS**: max-age=31536000, includeSubDomains, preload
- **Page Rules / Transform Rules**: bloquear hot-linking de `/api/*` desde dominios externos.

## Railway (backend)

- **Replicas**: 2+ por región (HA)
- **Private networking**: ✅ entre backend y Postgres
- **Egress**: solo permitir Stripe / Supabase / B2 / CCBill (allowlist saliente si Railway lo permite)
- **Auto-restart on crash**: ON

## CI/CD (GitHub Actions)

- `npm audit --audit-level=high` en cada PR
- `npm audit fix` solo manual, NUNCA auto-merge
- Dependabot ON para vulnerabilities (severity ≥ moderate)

## Operational

- Backups de DB: diarios, retención 30 días (Supabase Pro lo hace automático).
- Logs de auth: monitorear `failed sign-in attempts > 5 from same IP en 10 min` → bloqueo automático IP.
- Rotación de admin emails / passwords cada 90 días.
- Sin acceso compartido a admin tools — cada admin tiene su propia cuenta.

## Próximos hardenings (no implementados todavía)

- Device fingerprinting para detectar logins desde dispositivos nuevos.
- 2FA obligatorio para creators con >$100/mes de earnings.
- Webhook signatures verificadas con timing-safe comparison (ya está en HMAC, validar).
