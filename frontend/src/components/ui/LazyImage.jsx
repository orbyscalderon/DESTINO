import { useState } from 'react';

// Image con blur-up effect — placeholder borroso mientras carga la imagen
// real. Se nota como un detalle premium en feeds de imágenes pesadas.
//
// Props:
//   src         — URL final
//   placeholder — URL del thumbnail tiny (32x32 o similar). Opcional.
//   alt, className, onClick, etc. — pasan al <img>

export default function LazyImage({ src, placeholder, alt = '', className = '', ...rest }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {placeholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover blur-xl scale-110 transition-opacity duration-500 ${loaded ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`relative w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...rest}
      />
    </div>
  );
}
