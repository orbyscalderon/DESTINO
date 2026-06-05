import { useState, useEffect } from 'react';
import { FiTrendingDown, FiArrowDown } from 'react-icons/fi';
import api from '../../lib/api.js';

// Vista de funnel para admin: muestra steps con counts + % conversión
// vs el primer paso y vs el paso anterior. El paso con mayor drop-off
// es el cuello de botella a optimizar.

const STEP_LABELS = {
  signup_completed:       { label: 'Signup',                 emoji: '📝' },
  onboarding_started:     { label: 'Onboarding iniciado',    emoji: '🚀' },
  onboarding_completed:   { label: 'Onboarding completado',  emoji: '✅' },
  first_like:             { label: 'Primer like',            emoji: '❤️' },
  first_match:            { label: 'Primer match',           emoji: '💞' },
  first_message:          { label: 'Primer mensaje',         emoji: '💬' },
  first_purchase:         { label: 'Primera compra coins',   emoji: '⚡' },
  first_tip:              { label: 'Primer tip enviado',     emoji: '💸' },
  first_subscription:     { label: 'Primera suscripción',    emoji: '⭐' },
  became_creator:         { label: 'Se hizo creador',        emoji: '🎬' },
  first_live_show:        { label: 'Primer show en vivo',    emoji: '🔴' },
};

export default function AdminFunnel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/admin/funnel?days=${days}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FiTrendingDown size={16} /> Funnel de conversión
        </h2>
        <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                days === d ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : !data?.steps?.length ? (
        <div className="card p-8 text-center text-gray-500 text-sm">
          Sin datos. Si las migraciones v56 están aplicadas, los eventos empezarán a registrarse según los users interactúen.
        </div>
      ) : (
        <div className="space-y-1">
          {data.steps.map((s, i) => {
            const meta = STEP_LABELS[s.step] || { label: s.step, emoji: '•' };
            const dropOff = i > 0 ? 100 - s.pct_of_prev : 0;
            const isDropConcern = dropOff > 40;
            return (
              <div key={s.step}>
                <div className={`card p-3 flex items-center gap-3 ${isDropConcern ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                  <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center shrink-0 text-lg">
                    {meta.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{meta.label}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-gray-500">{s.pct_of_top}% del top</span>
                      {i > 0 && (
                        <span className={`text-[10px] font-bold ${s.pct_of_prev < 60 ? 'text-red-400' : s.pct_of_prev < 80 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {s.pct_of_prev}% del paso anterior
                        </span>
                      )}
                    </div>
                    {/* Barra visual */}
                    <div className="w-full h-1 bg-dark-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-pink-500"
                        style={{ width: `${Math.min(100, s.pct_of_top)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-white tabular-nums">{s.count.toLocaleString()}</p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">users</p>
                  </div>
                </div>
                {/* Drop-off entre pasos */}
                {i < data.steps.length - 1 && dropOff > 0 && (
                  <div className="flex items-center justify-center gap-1 py-1">
                    <FiArrowDown size={9} className="text-gray-600" />
                    <span className={`text-[9px] font-bold ${dropOff > 50 ? 'text-red-400' : 'text-gray-500'}`}>
                      −{dropOff.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-600 mt-4 leading-relaxed">
        Steps con drop-off &gt;40% destacados en rojo — son los que requieren atención. Cada user solo cuenta una vez por step.
      </p>
    </div>
  );
}
