import { useEffect, useRef, useState } from 'react';

// Hook para pull-to-refresh nativo-feeling en mobile.
// Detecta drag desde top + scroll === 0 y dispara onRefresh cuando supera threshold.
//
// Uso:
//   const { pulling, progress, refreshing, bind } = usePullToRefresh({
//     onRefresh: async () => { await loadData(); },
//     threshold: 70,
//   });
//
//   return (
//     <div {...bind}>
//       <PullIndicator progress={progress} refreshing={refreshing} />
//       ... contenido ...
//     </div>
//   );

export function usePullToRefresh({ onRefresh, threshold = 70, maxPull = 120 }) {
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  const onTouchStart = (e) => {
    if (refreshing) return;
    // Solo si estamos en el top del scroll
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  };

  const onTouchMove = (e) => {
    if (!pulling || refreshing) return;
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    if (delta > 0) {
      const clamped = Math.min(delta, maxPull);
      setProgress(clamped / threshold);
    } else {
      setProgress(0);
    }
  };

  const onTouchEnd = async () => {
    if (!pulling || refreshing) { setPulling(false); return; }
    setPulling(false);
    if (progress >= 1 && onRefresh) {
      setRefreshing(true);
      try { await onRefresh(); }
      catch {}
      finally {
        setRefreshing(false);
        setProgress(0);
      }
    } else {
      setProgress(0);
    }
  };

  return {
    pulling,
    progress: Math.min(progress, 1.4),
    refreshing,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

// Componente visual del indicador (usar con el hook arriba)
export function PullIndicator({ progress, refreshing }) {
  if (!refreshing && progress === 0) return null;
  const rotation = progress * 360;
  const scale = Math.min(progress, 1);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-2 z-30 pointer-events-none transition-opacity duration-200"
      style={{
        opacity: refreshing ? 1 : Math.min(1, progress),
        transform: `translate(-50%, ${refreshing ? '0' : `${(progress - 1) * 30}px`})`,
      }}
    >
      <div
        className={`w-10 h-10 rounded-full glass-strong flex items-center justify-center shadow-glow-sm
                    ${refreshing ? 'animate-spin' : ''}`}
        style={{
          transform: refreshing ? '' : `scale(${scale})`,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: refreshing ? '' : `rotate(${rotation}deg)` }}>
          <path
            d="M4 12 A 8 8 0 1 1 12 20"
            stroke="#f43f5e"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M12 20 L9 17 M12 20 L15 17"
            stroke="#f43f5e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
