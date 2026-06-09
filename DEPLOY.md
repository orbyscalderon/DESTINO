# Destino TV — Production Deploy Guide

**Versión actual: v71 (post-launch hardening)**
**Entidad operadora: OC Moon Group LLC**

---

## 0. Pre-requisitos

- [ ] Cuenta Supabase Pro (plan recomendado por compliance + RLS)
- [ ] Cuenta Stripe en modo Live + verificación completa
- [ ] Cuenta CCBill aprobada (para adult)
- [ ] LiveKit Cloud o VPS Vultr para self-hosted
- [ ] Cuenta Railway (backend) + Cloudflare Pages (frontend) o Vercel
- [ ] Dominio configurado en Cloudflare (DNS + WAF)
- [ ] Resend / AWS SES para email
- [ ] Google Firebase project (FCM Android)
- [ ] Sentry project

---

## 1. Base de datos (Supabase)

### 1a. Aplicar TODAS las migraciones en orden

En **Supabase → SQL Editor**, ejecutar **en este orden estricto**:

```
# Legacy / bootstrap (si la base es nueva)
supabase/migrations/20260521_missing_tables.sql
supabase/migrations/20260521_features.sql
supabase/migrations/20260521_stripe_identity.sql
supabase/migrations/20260523_complete_schema.sql
supabase/migrations/20260523_schema_fixes.sql
supabase/migrations/20260523_storage_policies.sql

# Versionadas v1..v66 (legacy — si la base es nueva, correr todas en orden)
database/migration_v1_*.sql ... database/migration_v66_ai_usage.sql

# Compliance stack (v67-v69)
database/migration_v67_compliance.sql           # entidad, DPO, agent, custodian, consents, transparency
database/migration_v68_compliance_v2.sql        # DSA notices, welcome msgs, mass DM, watermark queue, 2257 expiration
database/migration_v69_compliance_v3.sql        # subprocessors, breaches, processing activities, statement of reasons, cookies, Art. 9

# Adult monetization (v70)
database/migration_v70_adult_revenue.sql        # sexting, vault, collections, scheduling, geo per content, promos, spy, autoreply, AI persona, fan badges, VR

# Pre-launch hardening (v71)
database/migration_v71_pre_launch_hardening.sql # RLS faltante, índices, RPCs atómicos, launch flags
```

> Las migraciones son **idempotentes** — usan `IF NOT EXISTS` + `ON CONFLICT DO NOTHING`. Se pueden re-correr sin riesgo.

### 1b. Bucket de Storage

Verificar que existan los buckets:
- `Destino TV` (público — para avatars, fotos perfil)
- `Destino TV-PPV` (privado — para PPV media)
- `vault` (privado — para content vault de creators) — **crear si no existe**
- `2257-archive` (privado — para records archivados) — **crear si no existe**
- `watermarked` (privado) — **crear si no existe**

Aplicar policies en `supabase/migrations/20260523_storage_policies.sql`.

### 1c. Realtime habilitado

Supabase → Database → Replication. Habilitar para:
- `messages`
- `matches`
- `in_app_notifications`
- `live_shows`
- `show_chat_user_state`

### 1d. Auth config

Supabase → Auth → URL Configuration:
- Site URL: `https://destino.app`
- Redirect URLs: `https://destino.app/#/auth/callback`, `com.destino.app://auth/callback` (Capacitor deep link)

Email templates: pegar contenidos de `supabase/email-templates/*.html`.

### 1e. Actualizar compliance_config con datos reales

Después de aplicar v67-v71, actualizar via SQL:

```sql
UPDATE compliance_config SET value = 'Delaware, USA' WHERE key = 'entity_jurisdiction';
UPDATE compliance_config SET value = '<dirección real>' WHERE key = 'entity_address';
UPDATE compliance_config SET value = '<EIN real>' WHERE key = 'entity_tax_id';
UPDATE compliance_config SET value = 'beta-latam' WHERE key = 'launch_phase';
-- Etc.
```

---

## 2. Stripe (modo LIVE)

1. Stripe Dashboard → completar verificación (KYB de OC Moon Group LLC)
2. Switch to **live mode**
3. Products → Create "Destino Premium" → precio $9.99/mes recurrente
4. Copiar Price ID `price_live_...` → env var `STRIPE_PRICE_ID`
5. Developers → Webhooks → Add endpoint:
   - URL: `https://api.destino.app/api/payments/webhook`
   - Events: `payment_intent.succeeded`, `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`
   - Copiar webhook signing secret → env var `STRIPE_WEBHOOK_SECRET`
6. Tax → activar Stripe Tax (recomendado para sales tax USA)

---

## 3. CCBill (adult)

1. Aplicar para CCBill sub-account adult-approved
2. Configurar Flexforms con descriptor `DT-MEDIA INTL` (NO mencionar marca real ni "adult")
3. Webhook URL: `https://api.destino.app/api/payments/ccbill/webhook`
4. Configurar Background Post events
5. Copiar `Account Number` y `HMAC Secret` a env vars

---

## 4. LiveKit

### Cloud (Fase 1)
1. cloud.livekit.io → crear proyecto
2. Settings → Ingress → activar RTMP (para shows con OBS)
3. Copiar URL + API Key + Secret a env vars

### Self-hosted (futuro Vultr)
Ver `docs/RTMP_SETUP.md` para guía completa.

---

## 5. Servicios externos

### OpenAI
- Crear API key en platform.openai.com
- Configurar usage limits ($100-500/mo según tráfico esperado)

### Sightengine
- Crear cuenta en sightengine.com
- Activar modelos: `nudity-2.1`, `wad`, `offensive`, `gore`, `minor`
- Copiar API User + Secret

### Resend
- Verificar dominio destino.app → DKIM + SPF
- API Key

### Firebase (FCM Android)
- Console → crear proyecto destino-tv
- Cloud Messaging → habilitar
- Service Account → Generate JSON key
- Pegar JSON en env var (toda en una línea, escapado)

### VAPID Web Push
- Generar: `npx web-push generate-vapid-keys`
- Configurar public en frontend + backend, private en backend solo

### Sentry
- Crear proyecto Node.js (backend) + React (frontend)
- DSNs separados

### Cloudflare Turnstile
- challenges.cloudflare.com → site
- Sitekey (frontend) + Secret (backend)

---

## 6. Geo-blocking

### Cloudflare WAF (defensa en profundidad)
Crear rule:
```
Block from: countries that match (US, GB, CA, AU, IN, ...) AND path matches /api/(profile-videos|posts).*adult.*
```

El middleware `geoBlockAdult` ya lo hace a nivel de aplicación, pero Cloudflare ahorra requests al backend.

### Tabla `geo_blocks` ya pre-seeded por v67/v68 (60+ países/regiones bloqueados adult)

---

## 7. Backend (Railway)

### 7a. Crear proyecto Railway
- Conectar repo GitHub `orbyscalderon/DESTINO-TV`
- Branch: `main`
- Root directory: `backend`
- Start command: `npm start`

### 7b. Variables de entorno
Pegar TODAS las del `backend/.env.example` (rellenadas con valores reales).

### 7c. Domain
Railway → Settings → Public Networking → Generate or assign `api.destino.app`

### 7d. (Opcional) Watermark worker como servicio aparte
Si activás FFmpeg watermarking:
- Crear servicio Railway separado apuntando al mismo repo
- Start command: `node src/workers/watermarkWorker.js`
- Añadir `nixpacks.toml` con `nixPkgs = ["ffmpeg"]`
- `npm i fluent-ffmpeg` en el backend
- Env var `WATERMARK_WORKER_ENABLED=true`

### 7e. Health check
Railway healthcheck path: `/healthz`

---

## 8. Frontend (Cloudflare Pages)

### 8a. Crear proyecto
- Connect to Git
- Production branch: `main`
- Build command: `cd frontend && npm install && npm run build`
- Build output: `frontend/dist`
- Env vars: pegar `frontend/.env.example` rellenado

### 8b. Custom domain
- `destino.app` apuntando al proyecto
- DNS administrado por Cloudflare

### 8c. Edge settings
- Workers / Functions: ninguna por ahora
- Security level: Medium
- Bot Fight Mode: ON
- Caching: standard

---

## 9. Mobile (Capacitor)

### iOS
```bash
cd frontend
VITE_IOS_BUILD=1 npm run build
npx cap sync ios
npx cap open ios
# Build + Archive en Xcode
# Upload a TestFlight
```

Ver `iOS_SUBMIT.md` para checklist específico de App Store review.

### Android
```bash
cd frontend
npm run build
npx cap sync android
npx cap open android
# Build → Generate Signed Bundle → Upload a Play Console
```

---

## 10. Compliance external setup

| Acción | Responsable | Costo |
|---|---|---|
| Registrar DMCA Agent en copyright.gov | OC Moon Group LLC | $6 una vez |
| Crear inboxes: dpo@, legal@, dmca@, records@, breach@ | Google Workspace | $6/usuario/mes |
| Designar persona del DPO interno | Tú (Orbys) | $0 |
| Cuando abras USA adult: contratar Custodian of Records | CustodianOfRecords.com | ~$300/año |
| Cuando abras EU: contratar DPO certificado + EU Representative | PrivacyEngine u otro | ~$200-500/mes |
| Firmar DPAs con: Supabase, Stripe, OpenAI, Sightengine, Sentry, PostHog | Tú | $0 |

---

## 11. Post-launch checklist

- [ ] Smoke test: registro → onboarding → swipe → match → mensaje
- [ ] Smoke test: compra de coins (Stripe live)
- [ ] Smoke test: live show con 2 viewers + tip + chat
- [ ] Verificar `/healthz` retorna 200
- [ ] Verificar Sentry recibe errores test
- [ ] Verificar PostHog recibe eventos
- [ ] Probar app desde IP USA (debe ver mensaje de geo-block para adult)
- [ ] Verificar `geo_blocks` table aplicada
- [ ] Aplicar updates de `compliance_config` con datos reales de OC Moon Group LLC
- [ ] Monitorear logs Railway durante primeras 24h
- [ ] Marcar `launch_phase = 'beta-latam'` en compliance_config

---

## 12. Documentación relacionada

- `docs/RTMP_SETUP.md` — setup RTMP para shows OBS
- `iOS_SUBMIT.md` — checklist App Store submission
- `MEDIASOUP_MIGRATION.md` — plan migración legacy (deprecated, usamos LiveKit)
- `linkedin_assets/` — assets para promoción

---

**¿Listo para publicar?** Marcar `signups_open = true` en `compliance_config`.
