# Push notifications nativas (FCM/APNs) + AdMob

El código frontend y backend ya están preparados. Faltan **configuraciones
externas** que requieren cuentas y archivos sensibles (no se versionan).

---

## 1. FCM — push notifications Android

### En Firebase Console

1. Crea un proyecto Firebase: https://console.firebase.google.com
   - Project name: `destino-tv` (o el que prefieras)
2. **Agrega una app Android** al proyecto:
   - Package name: `com.destino.app` (debe coincidir con `appId` de `capacitor.config.ts`)
   - App nickname: `Destino Android`
   - SHA-1 cert: opcional, solo si vas a usar Google Sign-In nativo (no es nuestro caso — usamos OAuth web).
3. Descarga el archivo **`google-services.json`** que te ofrece.
4. Cópialo a:
   ```
   frontend/android/app/google-services.json
   ```
   ⚠️ NO lo commitees. Agrégalo a `.gitignore` de `frontend/android/app/`.

### En el proyecto Android

`google-services.json` ya es leído automáticamente por el plugin de Google Services.
Lo que falta es agregar el plugin Gradle.

Edita `frontend/android/build.gradle` (raíz):
```gradle
buildscript {
    dependencies {
        // ... existentes ...
        classpath 'com.google.gms:google-services:4.4.2'
    }
}
```

Edita `frontend/android/app/build.gradle` (final del archivo):
```gradle
apply plugin: 'com.google.gms.google-services'
```

Rebuild en Android Studio. El plugin `@capacitor/push-notifications` (ya
instalado) usará FCM automáticamente.

### En el backend

Para que el backend envíe push reales a los tokens FCM, necesitarás:

1. **Service Account** en Firebase Console → Project Settings → Service Accounts → "Generate new private key".
2. Guardar el JSON resultante como secret en Railway, ej. `FIREBASE_ADMIN_SDK_JSON`.
3. Instalar `firebase-admin` en `backend/` y usar `admin.messaging().send()`
   leyendo los tokens de `mobile_push_tokens` (migration v46).

Esto último todavía NO está implementado — solo persistimos los tokens.
Cuando quieras activarlo, dímelo y monto el sender.

### Migration en Supabase

Aplica `database/migration_v46_mobile_push_tokens.sql` en el SQL editor de Supabase.

---

## 2. APNs — push notifications iOS

1. **Apple Developer Account** ($99/año) configurado.
2. Crea una **Push Notifications certificate** en Apple Developer:
   - Identifiers → tu App ID `com.destino.app` → Edita → marca Push Notifications.
   - Keys → "+" → "Apple Push Notifications service (APNs)" → descarga el `.p8` y anota Key ID + Team ID.
3. En Firebase Console → tu proyecto → Project Settings → Cloud Messaging → "APNs Authentication Key" → sube el `.p8` con Key ID y Team ID. Esto le permite a Firebase enviar a APNs.
4. En Xcode (Mac), abre `frontend/ios/App/App.xcworkspace`:
   - Capabilities → "+" → Push Notifications.
   - Capabilities → "+" → Background Modes → marca "Remote notifications".

El plugin `@capacitor/push-notifications` usa APNs automáticamente en iOS y
Firebase reenvía los mensajes.

---

## 3. AdMob

### IDs reales en Vercel

Las variables `VITE_ADMOB_*` ya están en `.env`. En Vercel también deben estar
configuradas como variables de entorno para que el build de producción las inyecte.

Las IDs actuales son las reales tuyas — comprueba que estén en Vercel:
- `VITE_ADMOB_APP_ID`
- `VITE_ADMOB_BANNER_ID`
- `VITE_ADMOB_INTERSTITIAL_ID`
- `VITE_ADMOB_REWARDED_ID`

### AndroidManifest

Edita `frontend/android/app/src/main/AndroidManifest.xml` y verifica que está la `meta-data` de AdMob (ya está):
```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-3523962097410269~9945263651"/>
```
✓ Ya configurado.

### iOS Info.plist

Agrega a `frontend/ios/App/App/Info.plist`:
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-3523962097410269~9945263651</string>
```
(Sustituye por tu APP_ID real de AdMob iOS si es distinto del Android.)

### Plugin

`@capacitor-community/admob` ya está instalado. `frontend/src/lib/admob.js`
lo importa dinámicamente. Las funciones disponibles:
- `initAdMob()` — llamada en `App.jsx` al montar.
- `showBanner()` / `hideBanner()` / `removeBanner()`
- `showInterstitial()`
- `showRewardedAd()` — devuelve `{ amount, type }` si el user vio el ad completo.

Cuando hagas testing usa `initializeForTesting: true` (ya está activado cuando
las env vars de producción están vacías).

---

## Resumen — qué te falta hacer para que TODO funcione

| Plataforma | Push nativas | AdMob |
|---|---|---|
| Android | (1) Crear proyecto Firebase + descargar `google-services.json` → guardarlo en `frontend/android/app/`. (2) Agregar Gradle plugin. | ✓ Ya listo (manifest tiene APP_ID). |
| iOS | Push cert Apple Developer + .p8 a Firebase Cloud Messaging + Capabilities en Xcode. | Agregar `GADApplicationIdentifier` en `Info.plist`. |
| Backend | Aplicar migration v46. (Opcional) Configurar `firebase-admin` cuando quieras enviar push reales. | — |
| Vercel | — | Asegurar que las `VITE_ADMOB_*` vars existen en el build de producción. |
