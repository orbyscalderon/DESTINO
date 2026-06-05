# iOS App Store — Submit Checklist

Guía paso a paso para publicar **Destino TV** en App Store. Asume macOS + Xcode 15+ y cuenta Apple Developer activa ($99/año).

> **Importante**: Apple **prohíbe contenido adulto explícito** (App Store Review Guideline 1.1.4). La build para App Store debe ser la **versión "general"** de Destino TV — sin la sección adulta visible, sin links a CCBill, sin shows clasificados como 18+. La adult section sigue funcionando en web (PWA) y Android (sideload o stores alternativas), pero NO en iOS.

## 1. Preparación una sola vez

### Apple Developer Program
- [ ] Inscribirse en https://developer.apple.com/programs/ ($99/año, persona física o empresa)
- [ ] En App Store Connect (https://appstoreconnect.apple.com) crear el equipo y aceptar los Paid Apps Agreement (necesario para apps con IAP)

### Certificados y provisioning
- [ ] En Xcode: Settings → Accounts → añadir Apple ID
- [ ] Xcode → Signing & Capabilities → seleccionar Team. Xcode crea los certs automáticamente
- [ ] Bundle ID: `com.destino.app` (debe coincidir con `capacitor.config.ts`)
- [ ] Capabilities a habilitar: Push Notifications, Sign in with Apple, Associated Domains

### App Store Connect
- [ ] Crear app nueva → Platform: iOS → Bundle ID `com.destino.app` → SKU `destino-tv-ios-001`
- [ ] Primary language: Spanish (Mexico) → secondary: English (US), Portuguese (Brazil)

## 2. Configuración técnica

### Info.plist
Ya está en [ios/App/App/Info.plist](ios/App/App/Info.plist) con las keys mínimas. Si añades features nuevas, recuerda:
- [ ] `NSCameraUsageDescription` ✅
- [ ] `NSMicrophoneUsageDescription` ✅
- [ ] `NSPhotoLibraryUsageDescription` ✅
- [ ] `NSUserTrackingUsageDescription` ✅ (PostHog/AdMob lo requieren)
- [ ] `NSLocationWhenInUseUsageDescription` ✅
- [ ] `UIBackgroundModes`: remote-notification, audio, voip ✅
- [ ] `ITSAppUsesNonExemptEncryption: false` ✅ (evita el export compliance review en cada upload)

### Sign in with Apple (obligatorio si tienes Google Sign-In)
App Store Review Guideline 4.8 exige Apple Sign-In si ofreces social login. **Ya lo tenemos** ([Login.jsx](src/pages/Login.jsx) y [Register.jsx](src/pages/Register.jsx)).

Falta tu lado:
- [ ] En Apple Developer Console → Identifiers → tu bundle ID → habilitar "Sign in with Apple"
- [ ] Generar la Service ID `com.destino.app.signin` con domain `destino.app` (o el que sea) y return URL `https://<tu-supabase>.supabase.co/auth/v1/callback`
- [ ] En Supabase Dashboard → Authentication → Apple provider → pegar Service ID + Team ID + Key ID + private key generada en Apple Developer
- [ ] Probar el flujo: en iOS la app debe abrir el sheet nativo, no el redirect web

### Push notifications (APNs)
- [ ] En Apple Developer → Certificates → APNs Authentication Key → generar `AuthKey_XXXXX.p8`
- [ ] Subir a Firebase Console → Cloud Messaging → Apple app config → APNs auth key
- [ ] En el código (ya está): `pushNotifications.requestPermissions()` → `addListener('registration', ...)` registra el FCM token en la tabla `mobile_push_tokens` (migración v46)

### Build production
```bash
cd frontend
npm run build:mobile    # vite build + npx cap sync
npx cap open ios        # abre Xcode
```

En Xcode:
1. Product → Scheme → Edit Scheme → Build Configuration: **Release**
2. Product → Archive (tarda ~5 min en M1, ~15 en Intel)
3. Window → Organizer → Distribute App → App Store Connect → Upload

## 3. App Store listing (lo que el reviewer ve)

### Metadata
- [ ] **App name**: "Destino TV" (max 30 chars)
- [ ] **Subtitle**: "Citas, lives y matches" (max 30 chars)
- [ ] **Promotional text** (cambia sin requerir review): destacar feature actual
- [ ] **Description**: ~3000 chars. Mencionar matches, video chat, reels, shows en vivo. NO mencionar contenido adulto
- [ ] **Keywords**: 100 chars sep por coma: `citas,match,reels,live,streaming,dating,videos,chat`
- [ ] **Support URL**: `https://destino.app/help` (o `https://destino-sigma.vercel.app/#/help` si aún no tienes dominio)
- [ ] **Marketing URL** (opcional)
- [ ] **Privacy Policy URL**: obligatorio → `https://destino.app/privacy`

### Categoría y age rating
- [ ] Primary category: **Social Networking**
- [ ] Secondary: **Lifestyle**
- [ ] Age rating wizard: 17+ por
  - Frequent/intense mature/suggestive themes (citas)
  - Infrequent/mild sexual content or nudity (incluso sin adult section, hay suggestive)
  - User-generated content (reels)

### Screenshots
Necesitas 1-3 screenshots por dispositivo. Mínimo:
- [ ] iPhone 6.7" (1290 × 2796) — iPhone 15 Pro Max
- [ ] iPhone 6.5" (1242 × 2688) — iPhone 11 Pro Max
- [ ] iPad Pro 12.9" 6th gen (2048 × 2732) — solo si soportas iPad

Ya tienes capturas en `prod-*.png` en la raíz del repo. Para App Store conviene:
1. Pantalla principal con el feed de matches
2. Reels en acción
3. Show en vivo con chat
4. Match modal
5. Perfil con verified badge

### App preview (video, opcional pero +20% conversion)
- 15-30s, mismo aspect ratio que las screenshots, sin audio narrado

## 4. App Review Information

- [ ] **Sign-in info**: dar al reviewer credenciales de un **seed user** con perfil completo, fotos aprobadas, al menos 1 match.
  - Email: `apple-review@destino.app` (créalo en Supabase y bórralo después del review)
  - Password: algo simple pero único
- [ ] **Contact email**: tu email real (no soporte genérico)
- [ ] **Demo notes**: explicar cómo llegar a las features clave en 2-3 pasos cada una:
  ```
  Para ver un show en vivo:
  1. Tap el icono de TV en la barra inferior
  2. Tap cualquier show "En vivo"

  Para enviar un mensaje a un match:
  1. Tap el icono de corazón
  2. Seleccionar un match → tap el avatar
  ```

## 5. Compliance específico (las trampas)

### Cuentas y monetización
- [ ] **Subscriptions VIP**: si vendes membresías recurrentes, Apple **OBLIGA** que las ofrezcas vía StoreKit IAP (no Stripe). Cobra 15% año 1, 30% después. O las quitas en iOS y ofreces el "lite" gratis con compras a través de web (link **externo** permitido bajo Guideline 3.1.3(a) si te declaras "Reader app").
- [ ] **Coins y tips**: son moneda virtual consumible → DEBEN ir por IAP (no Stripe). 30% Apple tax.
- [ ] **Stripe Connect payouts a creators**: OK, no es purchase del usuario.
- [ ] **CCBill (adult)**: ❌ remover completamente del build iOS. Apple rechaza si detecta `ccbill.com` en el código o en strings.

### Contenido adulto
- [ ] Build iOS debe filtrar la sección `/adult/*` antes del bundle. La forma más limpia:
  ```js
  // En vite.config.js o un build flag
  const IS_IOS_BUILD = process.env.IOS_BUILD === '1';
  // Excluir AdultCreators.jsx, /adult/* del router
  ```
- [ ] El reviewer **siempre** verifica que no haya nudity ni "OnlyFans-style" content. Si lo encuentra, rechazo automático.

### Privacy nutrition labels
- [ ] App Store Connect → App Privacy → declarar qué data colectas:
  - **Contact info**: Email, Name (linked to user)
  - **User content**: Photos, Videos, Audio data, Other (linked, used for app functionality)
  - **Identifiers**: User ID (linked)
  - **Usage data**: Product Interaction (linked, used for analytics)
  - **Location**: Coarse Location (linked, used for app functionality si activamos matches por proximidad)

### Data deletion (Guideline 5.1.1(v))
- [ ] La app debe ofrecer borrar cuenta desde dentro (Settings → Eliminar cuenta) ✅ ya está

## 6. Build numbers y versionado

- `CFBundleShortVersionString` (Marketing Version) = versión visible: `1.0.0`
- `CFBundleVersion` (Build) = entero monotónicamente creciente: `1`, `2`, `3`...

Apple rechaza si subes un Build con número menor o igual al previo. Después de un reject + fix, súbelo como Build `+1`.

## 7. Test antes de submit

### TestFlight (recomendado)
1. Archive → Upload → en App Store Connect → TestFlight → añadir build a un grupo interno (hasta 100 testers sin review) o externo (hasta 10000 con mini-review de 24h)
2. Probar en **dispositivos reales** (los emuladores no testean push, IAP, ni notch correctamente)
3. Atención especial:
   - [ ] OAuth Google y Apple Sign-In funcionan con el redirect correcto (no abren browser y se quedan colgados)
   - [ ] Push notifications llegan con la app cerrada
   - [ ] Cámara/mic permisos se piden con el strings correcto (los del Info.plist)
   - [ ] Splash screen no tarda más de 3s
   - [ ] El logo se ve bien en el LaunchScreen (no es un cuadrado blanco como pasó en Android)

## 8. Submit for Review

- [ ] App Store Connect → tu app → Version → Add for Review
- [ ] Tiempo de review: 24-48h típicamente; primera vez puede ser 1 semana
- [ ] Si rechazan, leer el reject detalladamente — el reviewer suele dar screenshot del problema. Responder con "Resolution Center" explicando el fix o pidiendo aclaración

## 9. Después de la primera versión

- [ ] Cada update sigue el mismo flujo: bump version → Archive → Upload → TestFlight → Submit
- [ ] Hotfixes urgentes (security): pedir **Expedited Review** desde Contact Us → suelen aprobar en 4-12h si la justificación es válida

## Resumen "ruta crítica" (el orden mínimo)

1. Apple Developer ($99) ✓
2. Configurar Apple Sign-In en Supabase ✓ (ya tienes el código)
3. Quitar adult section y CCBill del bundle iOS ⚠ TÚ debes hacerlo
4. Reemplazar coins/subs por IAP StoreKit (~3 días de trabajo) ⚠ NO está hecho aún
5. Generar 5 screenshots ✓ (las tienes)
6. Escribir descripción y keywords
7. Crear cuenta demo para reviewer
8. Archive desde Xcode + Upload
9. Submit for Review
10. Esperar veredicto

**Si solo quieres una primera versión "lite" para validar el funnel sin IAP**: quita las menciones a coins/subs/tips de la build iOS, déjalo solo como app de matches + chat + reels público. Esa puede pasar review en una semana. Las features de monetización pueden venir en una v2.
