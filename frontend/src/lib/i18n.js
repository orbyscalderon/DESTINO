import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from '../locales/es.json';
import en from '../locales/en.json';
import pt from '../locales/pt.json';

// Bootstrap de i18n. Por defecto detecta idioma del browser; si el user
// elige uno en Settings se guarda en localStorage y persiste.
//
// Namespaces disponibles: common, auth, nav, home, reels, studio, live,
// viewer, dashboard, settings, stories, errors. Patrón de uso en
// frontend/I18N.md.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      pt: { translation: pt },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en', 'pt'],
    interpolation: { escapeValue: false }, // React ya escapa
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'destino-lang',
    },
  });

export default i18n;
