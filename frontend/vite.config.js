import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
