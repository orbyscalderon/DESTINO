import { useEffect } from 'react';

// Hook para actualizar <title> y meta tags al navegar entre rutas.
// SPA con HashRouter no permite SSR de meta tags, así que inyectamos en runtime.
// Buenos para preview en messengers y para que Googlebot (que sí ejecuta JS desde
// 2019) los lea.
//
// Uso:
//   useMetaTags({
//     title: `${user.name} en Destino TV`,
//     description: user.bio,
//     image: user.avatar_url,
//     url: window.location.href,
//   });
//
// Cuando el componente se desmonta, restauramos los tags default.

const DEFAULTS = {
  title: 'Destino TV — Conecta con personas reales',
  description: 'Matches, videollamadas, shows en vivo y mucho más. Únete a Destino TV hoy.',
  image: '/icon-512.png',
  url: typeof window !== 'undefined' ? window.location.href : '',
};

function setMetaContent(selector, content) {
  if (!content) return;
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

export function useMetaTags({ title, description, image, url, type = 'website' } = {}) {
  useEffect(() => {
    const prev = {
      title: document.title,
      description: document.head.querySelector('meta[name="description"]')?.content,
      ogTitle: document.head.querySelector('meta[property="og:title"]')?.content,
      ogDesc: document.head.querySelector('meta[property="og:description"]')?.content,
      ogImage: document.head.querySelector('meta[property="og:image"]')?.content,
      ogUrl: document.head.querySelector('meta[property="og:url"]')?.content,
      ogType: document.head.querySelector('meta[property="og:type"]')?.content,
    };

    if (title) document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:image"]', image);
    setMetaContent('meta[property="og:url"]', url);
    setMetaContent('meta[property="og:type"]', type);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
    setMetaContent('meta[name="twitter:image"]', image);

    return () => {
      // Restaurar al desmontar — evita que un perfil deje su título mientras
      // el user navega a otra ruta antes de que esa otra ruta setee el suyo.
      if (prev.title) document.title = prev.title;
      setMetaContent('meta[name="description"]', prev.description || DEFAULTS.description);
      setMetaContent('meta[property="og:title"]', prev.ogTitle || DEFAULTS.title);
      setMetaContent('meta[property="og:description"]', prev.ogDesc || DEFAULTS.description);
      setMetaContent('meta[property="og:image"]', prev.ogImage || DEFAULTS.image);
      setMetaContent('meta[property="og:url"]', prev.ogUrl || DEFAULTS.url);
      setMetaContent('meta[property="og:type"]', prev.ogType || 'website');
    };
  }, [title, description, image, url, type]);
}
