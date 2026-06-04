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
          // LiveKit es enorme (~600 KB) — sólo se usa en ShowStudio y LiveShow
          if (id.includes('livekit-client')) return 'livekit';

          // Supabase
          if (id.includes('@supabase')) return 'supabase';

          // Framer Motion
          if (id.includes('framer-motion')) return 'framer';

          // Sentry — sólo para monitoreo, no bloquea UI
          if (id.includes('@sentry')) return 'sentry';

          // Stripe — sólo se carga en páginas de pago
          if (id.includes('@stripe')) return 'stripe';

          // Íconos
          if (id.includes('react-icons')) return 'icons';

          // Resto de node_modules como vendor general (incluye react, react-dom, react-router)
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
