import { FiZap } from 'react-icons/fi';

export default function MessageLimitBanner({ remaining, limit, onUpgrade }) {
  const pct = (remaining / limit) * 100;
  const color = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-brand-500';

  if (remaining <= 0) {
    return (
      <div className="bg-gradient-to-r from-brand-500/15 to-accent-500/10 border border-brand-500/30 mx-4 mt-3 rounded-xl p-3 flex items-center justify-between gap-3">
        <span className="text-sm text-brand-300 font-medium">Has alcanzado tu límite diario de mensajes</span>
        <button onClick={onUpgrade} className="shrink-0 text-xs bg-gradient-to-r from-brand-500 to-brand-600 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 shadow-glow-sm hover:shadow-glow hover:-translate-y-0.5 transition-all duration-200 ease-out-expo active:scale-95">
          <FiZap size={12} /> Premium
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{remaining} mensajes restantes hoy</span>
        <button onClick={onUpgrade} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
          <FiZap size={10} /> Ilimitados
        </button>
      </div>
      <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
