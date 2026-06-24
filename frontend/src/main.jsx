import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx';
import './lib/i18n.js'; // bootstrap i18next (lee idioma de localStorage)
import './styles/globals.css';

// Mount React de inmediato — NO blockear con Sentry/SW.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);

// Sentry: import dinámico DESPUÉS de mount. Ahorra ~273KB en el JS crítico.
// El init asincrónico no pierde errores porque Sentry hookea window.onerror
// al primer init — los errores antes del init quedan sin reportar (aceptable
// porque la app aún no renderizó nada).
if (import.meta.env.VITE_SENTRY_DSN) {
  // Deferred init — no bloquea First Contentful Paint
  requestIdleCallback?.(() => loadSentry(), { timeout: 2000 })
    || setTimeout(loadSentry, 1500);
}

async function loadSentry() {
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1, // bajado de 0.2 — menos overhead
      replaysOnErrorSampleRate: 0.5, // bajado de 1.0
      replaysSessionSampleRate: 0, // NO grabar todas las sesiones — muy caro
      integrations: [
        Sentry.browserTracingIntegration(),
        // replayIntegration solo en errors, no en sesión completa
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: true, // no grabar video — explota memoria
        }),
      ],
    });
  } catch (e) {
    console.warn('Sentry failed to load', e);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Deep linking: cuando el user abre destino.app/profile/X desde un link
// externo (WhatsApp, etc.) en la app instalada, Capacitor emite appUrlOpen.
// Navegamos al path correcto manteniendo el hash router (#/profile/X).
if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        // HashRouter usa /#/<path>; si viene https://destino.app/profile/X,
        // navegamos a #/profile/X
        const path = url.pathname + url.search;
        if (path && path !== '/') {
          window.location.hash = path;
        }
      } catch {}
    });
  }).catch(() => {});
}
