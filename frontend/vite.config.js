import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Sentry plugin: solo en build (no en dev) y solo si tenemos las credenciales.
// Sube los sourcemaps al proyecto Sentry tras cada build → stack traces legibles.
//
// Requiere variables de entorno en el host de CI/CD (Vercel):
//   SENTRY_AUTH_TOKEN  (Sentry → Settings → Auth Tokens, scope project:releases + project:read)
//   SENTRY_ORG         (slug de la org, ej. "destino")
//   SENTRY_PROJECT     (slug del proyecto, ej. "destino-web")
//   VITE_APP_VERSION   (opcional — git sha o tag; si falta usamos timestamp)
const sentryEnabled = !!process.env.SENTRY_AUTH_TOKEN
                   && !!process.env.SENTRY_ORG
                   && !!process.env.SENTRY_PROJECT;

const release = process.env.VITE_APP_VERSION
             || process.env.VERCEL_GIT_COMMIT_SHA
             || `local-${Date.now()}`;

export default defineConfig({
  plugins: [
    react(),
    sentryEnabled && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: release, inject: true },
      sourcemaps: { assets: './dist/**', filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ].filter(Boolean),
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    // Sentry necesita sourcemaps para mapear los stack traces minificados al
    // código original. `filesToDeleteAfterUpload` arriba borra los .map del
    // dist tras subirlos para que no se sirvan públicamente.
    sourcemap: sentryEnabled ? true : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // LiveKit es enorme (~600 KB) — sólo se usa en ShowStudio/LiveShow
          if (id.includes('livekit-client')) return 'livekit';

          // Recharts: solo se usa en CreatorDashboard analytics — chunk aparte
          if (id.includes('recharts') || id.includes('d3-')
              || id.includes('victory-vendor')) return 'recharts';

          // i18next + react-i18next — pequeños pero podemos aislarlos
          if (id.includes('i18next')) return 'i18n';

          // Supabase
          if (id.includes('@supabase')) return 'supabase';

          // Framer Motion
          if (id.includes('framer-motion')) return 'framer';

          // Sentry (cargado dinámicamente desde main.jsx)
          if (id.includes('@sentry')) return 'sentry';

          // Stripe — sólo se carga en páginas de pago
          if (id.includes('@stripe')) return 'stripe';

          // Íconos
          if (id.includes('react-icons')) return 'icons';

          // PostHog — solo si hay analytics — pesado
          if (id.includes('posthog')) return 'posthog';

          // MediaPipe (face detection) — solo se necesita en VideoCall/Verify
          if (id.includes('@mediapipe')) return 'mediapipe';

          // Resto de node_modules como vendor general
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
