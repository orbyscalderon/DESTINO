import { useState } from 'react';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import { isSoundsEnabled, setSoundsEnabled, playClick } from '../../lib/sounds.js';
import Toggle from './Toggle.jsx';

// Mini-componente para Settings: toggle de sounds opt-in.
// El estado es localStorage-persistente (lo maneja sounds.js).

export default function SoundsToggle() {
  const [enabled, setEnabled] = useState(isSoundsEnabled());

  const handleToggle = () => {
    const next = !enabled;
    setSoundsEnabled(next);
    setEnabled(next);
    if (next) {
      // Tocar un sonido de confirmación para que el user lo escuche al activar.
      // Por timing, hacemos play justo después del set (ahora isSoundsEnabled = true).
      setTimeout(() => playClick(), 0);
    }
  };

  return (
    <div className="card-form flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? 'bg-brand-500/15 border border-brand-500/30 text-brand-300' : 'bg-white/5 border border-white/10 text-gray-500'} transition-colors duration-300`}>
          {enabled ? <FiVolume2 size={16} /> : <FiVolumeX size={16} />}
        </div>
        <div>
          <p className="font-bold text-white">Sonidos en la app</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Whooshes en swipe, pop en match, ding en tip. Sutil — off por defecto.
          </p>
        </div>
      </div>
      <Toggle on={enabled} onChange={handleToggle} ariaLabel="Activar sonidos" />
    </div>
  );
}
