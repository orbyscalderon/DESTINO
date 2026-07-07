import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.destino.app',
  appName: 'Destino',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
    // Deep linking — allowedNavigation permite que links externos a destino.app
    // se manejen dentro de la app (en vez de abrir browser).
    // Requiere también assetlinks.json (Android) + apple-app-site-association (iOS)
    // en public/.well-known/ servidos como application/json.
    allowNavigation: [
      'destino.app',
      '*.destino.app',
      // Payment processor domains — se abren dentro del WebView (evitar
      // navegación externa que rompe callbacks de Stripe/CCBill en mobile)
      'checkout.stripe.com',
      'js.stripe.com',
      'api.ccbill.com',
      '*.ccbill.com',
      // OAuth
      'accounts.google.com',
      'appleid.apple.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0d0d1a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0d0d1a',
    },
    // App plugin escucha appUrlOpen para deep links (universal/app links).
    // El handler debe registrarse en main.jsx con App.addListener.
  },
  android: {
    backgroundColor: '#0d0d1a',
    // Para App Links real, hay que generar SHA-256 fingerprint del cert de
    // signing y meterlo en public/.well-known/assetlinks.json.
  },
  ios: {
    contentInset: 'automatic',
    // Universal Links require: enabled "Associated Domains" capability en
    // Xcode con valor "applinks:destino.app" + apple-app-site-association
    // archivo en /.well-known/.
  },
};

export default config;
