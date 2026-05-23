# Destino — Checklist de Producción

## 1. BASE DE DATOS (Supabase) ✅ Hacer primero

### 1a. Ejecutar migraciones SQL
En **Supabase → SQL Editor**, ejecutar en este orden:

1. `supabase/migrations/20260521_missing_tables.sql`
2. `supabase/migrations/20260521_features.sql`
3. `supabase/migrations/20260521_stripe_identity.sql`
4. `supabase/migrations/20260523_complete_schema.sql`
5. `supabase/migrations/20260523_schema_fixes.sql`
6. `supabase/migrations/20260523_storage_policies.sql`

### 1b. Crear bucket de Storage
El script `20260523_storage_policies.sql` crea el bucket automáticamente.
Si falla, crear manualmente:
- Supabase → Storage → New Bucket → Nombre: `DESTINO` → Public: ✓

### 1c. Habilitar Realtime
Supabase → Database → Replication → asegurarse de que estén habilitadas:
- `messages`
- `matches`
- `in_app_notifications`

### 1d. Configurar Auth (email custom)
Supabase → Auth → Email Templates:
- **Confirm signup** → pegar contenido de `supabase/email-templates/confirmation.html`
- **Reset password** → pegar contenido de `supabase/email-templates/reset-password.html`
- **Magic link** → pegar contenido de `supabase/email-templates/magic-link.html`

Supabase → Auth → URL Configuration:
- Site URL: `https://destino-sigma.vercel.app`
- Redirect URLs: `https://destino-sigma.vercel.app/#/auth/callback`

---

## 2. STRIPE — Pasar a modo LIVE

### 2a. Activar cuenta live en Stripe
1. Stripe Dashboard → completar verificación de cuenta
2. Stripe Dashboard → Switch to live mode

### 2b. Crear producto Premium en modo live
1. Stripe → Products → Create → "Destino Premium"
2. Crear precio: $9.99/mes recurrente
3. Copiar el Price ID (empieza con `price_live_...`)

### 2c. Configurar Webhook en Stripe (live)
1. Stripe → Developers → Webhooks → Add endpoint
2. URL: `https://destino-production.up.railway.app/api/payments/webhook`
3. Eventos a escuchar:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.succeeded`
4. Copiar el **Signing secret** (empieza con `whsec_live_...`)

### 2d. Actualizar Railway env vars
En Railway → Destino Backend → Variables:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...
```

---

## 3. RAILWAY — Variables de entorno

Verificar que estas variables están en Railway → Destino Backend → Variables:

```
SUPABASE_URL=https://hdanhncalsbouedeodcm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<del dashboard de Supabase → Project Settings → API>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...
VAPID_PUBLIC_KEY=BOZiVDDDmKXsRbBZ3lIjVMzZW3N-q7Uh20Esceq3ro6e8aANHUMImcDwwgjQBA_WKNgAP9V8Nzvg9wN6krDthcU
VAPID_PRIVATE_KEY=<del .env local>
AGORA_APP_ID=56fae777ffc046759e1aa93df452545a
AGORA_APP_CERTIFICATE=<del .env local>
ADMIN_USER_IDS=orbys85@gmail.com
FRONTEND_URL=https://destino-sigma.vercel.app
SUPPORT_EMAIL=soporte@destino.app
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=40099
NODE_ENV=production
```

---

## 4. VERCEL — Variables de entorno del frontend

En Vercel → Destino → Settings → Environment Variables:
```
VITE_SUPABASE_URL=https://hdanhncalsbouedeodcm.supabase.co
VITE_SUPABASE_ANON_KEY=<del dashboard de Supabase → Project Settings → API → anon key>
VITE_API_URL=https://destino-production.up.railway.app
VITE_VAPID_PUBLIC_KEY=BOZiVDDDmKXsRbBZ3lIjVMzZW3N-q7Uh20Esceq3ro6e8aANHUMImcDwwgjQBA_WKNgAP9V8Nzvg9wN6krDthcU
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

---

## 5. ANDROID — Build y firma

### 5a. Generar keystore (solo la primera vez)
```bash
keytool -genkey -v -keystore destino-release.keystore \
  -alias destino -keyalg RSA -keysize 2048 -validity 10000
```
⚠️ Guardar el keystore y las contraseñas en un lugar seguro. Sin esto no puedes actualizar la app.

### 5b. Build del frontend y sync
```bash
cd frontend
npm run build:mobile
```

### 5c. Build APK firmado en Android Studio
1. `npm run cap:android` → abre Android Studio
2. Build → Generate Signed Bundle/APK
3. Seleccionar: Android App Bundle (.aab) para Google Play
4. Usar el keystore de 5a
5. Build variant: release

### 5d. Subir a Google Play Console
1. Crear app en Google Play Console
2. Subir el `.aab`
3. Completar listing: descripción, capturas, política de privacidad

---

## 6. iOS — Build (requiere Mac + Xcode)

### 6a. Agregar iOS a Capacitor
```bash
cd frontend
npx cap add ios
npm run build:mobile
```

### 6b. Abrir en Xcode
```bash
npm run cap:ios
```

### 6c. Configurar signing en Xcode
1. Xcode → Signing & Capabilities → seleccionar tu Team
2. Bundle ID: `com.destino.app`
3. Crear App ID en Apple Developer Portal

### 6d. Archivar y subir a App Store Connect
1. Xcode → Product → Archive
2. Validate App → Distribute App → App Store Connect
3. Completar metadata en App Store Connect

---

## 7. STRIPE IDENTITY (verificación de edad)

1. Stripe → Dashboard → Identity → Enable
2. Crear webhook para eventos de Identity:
   - `identity.verification_session.verified`
   - `identity.verification_session.requires_input`
3. En Railway agregar: `STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_...`

---

## Estado actual

| Item | Estado |
|------|--------|
| Backend Railway | ✅ Desplegado |
| Frontend Vercel | ✅ Desplegado |
| SQL Migrations | ⏳ Pendiente ejecutar |
| Storage bucket | ⏳ Pendiente ejecutar SQL |
| Stripe live | ⏳ Pendiente |
| Push notifications (VAPID) | ✅ Configurado localmente |
| Android APK | ⏳ Pendiente firmar |
| iOS | ⏳ Requiere Mac |
| Email templates | ⏳ Pendiente pegar en Supabase |
| Realtime habilitado | ⏳ Verificar en Supabase |
