/**
 * Comprime una imagen en el navegador antes de subirla.
 * Reduce el tamaño de archivo hasta un 80% sin pérdida visual notable.
 */
export async function compressImage(file, {
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.82,
} = {}) {
  // Si el archivo ya es pequeño, no comprimimos
  if (file.size < 200 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback: subir original
    };

    img.src = url;
  });
}

/** Versión para avatares: cuadrada, más pequeña */
export const compressAvatar = (file) =>
  compressImage(file, { maxWidth: 600, maxHeight: 600, quality: 0.85 });

/** Versión para fotos de chat: moderada */
export const compressChatImage = (file) =>
  compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.8 });
