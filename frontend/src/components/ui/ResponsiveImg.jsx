// Image responsive con srcset + lazy + fallback.
// Drop-in replacement de <img> que usa Supabase Image Transformation
// (o Bunny Optimizer si la URL es de Bunny CDN) para servir variantes.
//
// Uso típico:
//   <ResponsiveImg src={user.avatar_url} alt="" variant="avatar" />
//   <ResponsiveImg src={show.cover_url} alt={show.title} variant="card" />
//   <ResponsiveImg src={photo.url} alt="" variant="fullwidth" priority />
//
// variant determina widths + sizes preset. Para casos custom, pasar
// `widths={[200, 400]}` y `sizes="..."` directamente.

import { thumbSrcset, coverSrcset, thumbUrl, coverUrl, IMG_SIZES } from '../../lib/imageUrl.js';

const VARIANT_PRESETS = {
  avatar:     { widths: [64, 128, 256],    sizes: IMG_SIZES.avatar,    aspect: 'square' },
  avatarLg:   { widths: [128, 256, 512],   sizes: IMG_SIZES.avatarLg,  aspect: 'square' },
  card:       { widths: [200, 400, 600],   sizes: IMG_SIZES.card,      aspect: 'cover'  },
  thumb:      { widths: [200, 400],        sizes: IMG_SIZES.thumb,     aspect: 'cover'  },
  fullwidth:  { widths: [400, 800, 1200],  sizes: IMG_SIZES.fullwidth, aspect: 'cover'  },
  hero:       { widths: [800, 1200, 1920], sizes: IMG_SIZES.hero,      aspect: 'cover'  },
};

export default function ResponsiveImg({
  src,
  alt = '',
  variant = 'thumb',
  widths,                  // override del preset
  sizes,                   // override del preset
  priority = false,        // si true, eager + fetchpriority="high" (above-the-fold)
  className,
  onError,
  onClick,
  fallback,                // ReactNode opcional cuando !src
  ...rest
}) {
  if (!src) return fallback || null;

  const preset = VARIANT_PRESETS[variant] || VARIANT_PRESETS.thumb;
  const finalWidths = widths || preset.widths;
  const finalSizes = sizes || preset.sizes;
  const isAvatar = preset.aspect === 'square';

  // src "principal" (sin srcset) — el más grande para que el browser
  // haga el right-pick en navegadores viejos.
  const fallbackUrl = isAvatar
    ? thumbUrl(src, finalWidths[finalWidths.length - 1])
    : coverUrl(src, finalWidths[finalWidths.length - 1]);

  const srcSet = isAvatar
    ? thumbSrcset(src, finalWidths)
    : coverSrcset(src, finalWidths);

  return (
    <img
      src={fallbackUrl}
      srcSet={srcSet}
      sizes={finalSizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      className={className}
      onError={onError}
      onClick={onClick}
      {...rest}
    />
  );
}
