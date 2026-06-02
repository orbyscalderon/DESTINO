import { useEffect, useState, memo } from 'react';
import { useAuthStore } from '../../store/authStore.js';

// Capa de watermark NO removible vía DOM (los elementos se reposicionan cada
// 4 segundos, lo que disuade screen-recordings de quitar el overlay con CSS).
//
// Identificador mostrado: @{viewer_username} + últimos 6 chars del user_id.
// Sirve como "huella" — si un fan filtra el contenido, las screenshots
// muestran QUIÉN era el viewer en ese momento.
//
// Props:
//   variant?: 'subtle' (default — esquina rotando) | 'visible' (centro + esquinas, recomendado para paid/PPV)
//   className?: clases extra del wrapper
//
// IMPORTANTE: NO es protección 100% — un screen-recording con OCR puede
// ignorarlo. Es DISUASIÓN. Si un usuario sabe que su nombre aparece, se lo
// piensa antes de subir el video a un sitio pirata.
function WatermarkLayer({ variant = 'subtle', className = '' }) {
  const { user, profile } = useAuthStore();
  const [tick, setTick] = useState(0);

  // Reposicionar el watermark cada 4s para que un user no pueda "tapar"
  // siempre la misma zona con CSS.
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 4000);
    return () => clearInterval(t);
  }, []);

  if (!user?.id) return null;

  // Identificador: @nombre + 6 chars del UUID (para que el creador o el
  // operador pueda triangular si recibe un screenshot pirata).
  const idSuffix = user.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  const username = profile?.full_name || user.email?.split('@')[0] || 'user';
  const wmText = `@${username} · ${idSuffix}`;

  // Posiciones rotando para subtle. Cuatro esquinas que cambian cada tick.
  const corner = tick % 4;
  const positions = [
    'top-2 left-2',
    'top-2 right-2',
    'bottom-12 left-2',
    'bottom-12 right-2',
  ];

  if (variant === 'visible') {
    // Para PPV / contenido más sensible: 4 esquinas + centro semi-transparente
    return (
      <div className={`pointer-events-none absolute inset-0 z-30 select-none ${className}`} aria-hidden="true">
        {/* 4 esquinas */}
        {['top-2 left-2', 'top-2 right-2', 'bottom-16 left-2', 'bottom-16 right-2'].map((pos, i) => (
          <span
            key={i}
            className={`absolute ${pos} text-white/40 text-[10px] font-mono font-bold drop-shadow-md tracking-wide`}
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
          >
            {wmText}
          </span>
        ))}
        {/* Centro grande y muy sutil */}
        <span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/10 text-2xl font-mono font-bold uppercase tracking-widest rotate-[-25deg] whitespace-nowrap"
        >
          {wmText}
        </span>
      </div>
    );
  }

  // subtle: una sola etiqueta que rota de esquina
  return (
    <div className={`pointer-events-none absolute inset-0 z-30 select-none ${className}`} aria-hidden="true">
      <span
        className={`absolute ${positions[corner]} text-white/35 text-[10px] font-mono font-bold transition-opacity duration-1000`}
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}
      >
        {wmText}
      </span>
    </div>
  );
}

export default memo(WatermarkLayer);
