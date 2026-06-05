// Helper para servir imágenes con resize on-the-fly. Reduce bandwidth
// ~80% — un avatar 4MB original servido como 128px ocupa ~15KB.
//
// Funciona con:
//   · Supabase Storage: agrega `?width=N&height=N&resize=cover&quality=80`
//   · BunnyCDN: si la URL incluye `b-cdn.net`, usa `?width=N`
//   · UI-avatars: ya hace resize por param `size`
//   · Otros (Google avatars, etc.): devuelve URL tal cual
//
// Uso:
//   import { thumbUrl } from '../lib/imageUrl';
//   <img src={thumbUrl(user.avatar_url, 64)} />
//
// Tamaños recomendados:
//    32px — listas chicas (chat sidebar)
//    64px — avatars en feed, navbar
//   128px — perfil pequeño
//   256px — perfil principal
//   512px — cover full screen

export function thumbUrl(url, size = 128) {
  if (!url || typeof url !== 'string') return url;

  try {
    // Supabase Storage transforms (image render API).
    // https://<project>.supabase.co/storage/v1/object/public/...
    // → https://<project>.supabase.co/storage/v1/render/image/public/...?width=N
    if (url.includes('/storage/v1/object/public/')) {
      const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const sep = transformed.includes('?') ? '&' : '?';
      return `${transformed}${sep}width=${size}&height=${size}&resize=cover&quality=80`;
    }

    // BunnyCDN optimizer (si está activado)
    if (url.includes('b-cdn.net')) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}width=${size}&aspect_ratio=1:1`;
    }

    // ui-avatars.com — ya soporta param size
    if (url.includes('ui-avatars.com')) {
      try {
        const u = new URL(url);
        u.searchParams.set('size', String(size));
        return u.toString();
      } catch {
        return url;
      }
    }

    // Para el resto (Google avatars =s96-c, etc.) devolvemos tal cual.
    // Los avatares de Google ya vienen pequeños por default.
    return url;
  } catch {
    return url;
  }
}

// Variante para covers/banners (ratio rectangular, no cuadrado)
export function coverUrl(url, width = 800) {
  if (!url || typeof url !== 'string') return url;
  try {
    if (url.includes('/storage/v1/object/public/')) {
      const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const sep = transformed.includes('?') ? '&' : '?';
      return `${transformed}${sep}width=${width}&quality=80`;
    }
    if (url.includes('b-cdn.net')) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}width=${width}`;
    }
    return url;
  } catch {
    return url;
  }
}
