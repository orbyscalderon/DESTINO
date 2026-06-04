import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from '../locales/es.json';
import en from '../locales/en.json';
import pt from '../locales/pt.json';

// Bootstrap de i18n. Por defecto detecta idioma del browser; si el user
// elige uno en Settings se guarda en localStorage y persiste.
//
// Cobertura actual: strings de auth (login/register), nav, header viewer.
// El resto del UI sigue en español hasta que se haga un sweep completo.
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
