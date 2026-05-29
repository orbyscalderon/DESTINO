import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiZap, FiMove, FiMinimize2 } from 'react-icons/fi';

const MIN_W = 180;
const MAX_W = 500;
const DEFAULT_W = 280;

export default function DraggableTipGoal({ collected = 0, goal = 0, containerRef }) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_W);
  const resizeRef = useRef(null);
  const startRef = useRef(null);

  const pct = goal > 0 ? Math.min(100, (collected / goal) * 100) : 0;
  const reached = collected >= goal && goal > 0;

  // Resize via mouse/touch drag on handle
  const onResizeStart = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    startRef.current = { startX, startW: width };

    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const delta = cx - startRef.current.startX;
      setWidth(Math.max(MIN_W, Math.min(MAX_W, startRef.current.startW + delta)));
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [width]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={containerRef}
      dragElastic={0}
      style={{ width, touchAction: 'none' }}
      className="absolute top-16 left-4 z-30 select-none"
    >
      <div className="bg-black/75 backdrop-blur-md rounded-xl border border-yellow-500/30 overflow-hidden shadow-lg">
        {/* Header — drag handle */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 cursor-grab active:cursor-grabbing">
          <FiMove size={10} className="text-yellow-600 shrink-0" />
          <span className="text-yellow-400 text-[11px] font-bold flex items-center gap-1 flex-1">
            <FiZap size={10} /> Meta de propinas
          </span>
          <span className="text-yellow-300 text-[11px] font-bold tabular-nums shrink-0">
            {collected.toLocaleString()} / {goal.toLocaleString()}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }}
            className="text-yellow-700 hover:text-yellow-400 transition-colors shrink-0 ml-1"
          >
            <FiMinimize2 size={10} />
          </button>
        </div>

        {/* Barra de progreso */}
        {!collapsed && (
          <div className="px-3 py-2">
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${reached ? 'bg-gradient-to-r from-yellow-400 to-green-400' : 'bg-gradient-to-r from-yellow-500 to-yellow-300'}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-yellow-600 text-[9px]">{pct.toFixed(0)}%</span>
              {reached
                ? <span className="text-green-400 text-[10px] font-bold">🎉 ¡Meta alcanzada!</span>
                : <span className="text-yellow-600 text-[9px]">{(goal - collected).toLocaleString()} coins restantes</span>
              }
            </div>
          </div>
        )}

        {/* Resize handle — esquina inferior derecha */}
        <div
          ref={resizeRef}
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end pr-0.5 pb-0.5"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M8 0L0 8" stroke="rgba(234,179,8,0.4)" strokeWidth="1.5" />
            <path d="M8 4L4 8" stroke="rgba(234,179,8,0.4)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
