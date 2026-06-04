import { useEffect, useState } from 'react';
import { FiAward, FiUsers, FiRefreshCw, FiClock } from 'react-icons/fi';
import api from '../../lib/api.js';

// Stats avanzados para el CreatorDashboard: top tippers, viewers únicos,
// retention, earnings por hora del día. Se monta como sección del tab
// Analytics. Selector de rango (7/30/90 días).
export default function AdvancedStats() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api.get(`/api/creator/advanced-stats?days=${days}`)
      .then(({ data }) => { if (!cancel) setData(data); })
      .catch(() => { if (!cancel) setData(null); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [days]);

  const maxHourAmount = Math.max(1, ...(data?.earnings_by_hour || []).map(h => h.amount));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-sm">Stats avanzados</h3>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="bg-dark-700 border border-white/10 text-white text-xs rounded-lg px-2 py-1 outline-none"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-gray-500 text-xs text-center py-4">Sin datos</p>
      ) : (
        <>
          {/* Counters arriba */}
          <div className="grid grid-cols-2 gap-2">
            <Counter
              icon={<FiUsers className="text-brand-400" size={14} />}
              label="Viewers únicos"
              value={data.unique_viewers}
            />
            <Counter
              icon={<FiRefreshCw className="text-yellow-400" size={14} />}
              label="Retention"
              value={`${data.retention_pct}%`}
              sub={`${data.returning_viewers} repiten`}
            />
          </div>

          {/* Top tippers */}
          <div className="bg-dark-800 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <FiAward className="text-yellow-400" size={14} />
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">Top tippers</h4>
            </div>
            {data.top_tippers.length === 0 ? (
              <p className="text-gray-500 text-xs py-3 text-center">Aún sin tips en este periodo</p>
            ) : (
              <ul className="space-y-2">
                {data.top_tippers.map((t, i) => (
                  <li key={t.user.id} className="flex items-center gap-2">
                    <span
                      className="text-xs font-black w-5 shrink-0 text-center"
                      style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#9CA3AF' }}
                    >
                      {i + 1}
                    </span>
                    {t.user.avatar_url ? (
                      <img src={t.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-[10px] text-white shrink-0">
                        {(t.user.full_name || '?')[0]}
                      </div>
                    )}
                    <span className="text-white text-xs flex-1 truncate">{t.user.full_name}</span>
                    {t.user.premium_tier === 'vip' && (
                      <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">VIP</span>
                    )}
                    <span className="text-yellow-400 text-xs font-bold tabular-nums shrink-0">⚡{t.coins_total.toLocaleString()}</span>
                    <span className="text-gray-500 text-[10px] shrink-0">${t.usd_total}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Earnings por hora del día */}
          <div className="bg-dark-800 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <FiClock className="text-pink-400" size={14} />
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">Earnings por hora</h4>
            </div>
            <p className="text-gray-500 text-[10px] mb-3">
              Las horas en que más ganas. Útil para programar shows.
            </p>
            <div className="flex items-end gap-0.5 h-32">
              {data.earnings_by_hour.map(({ hour, amount }) => (
                <div key={hour} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                  <div
                    className="w-full bg-gradient-to-t from-pink-600 to-pink-400 rounded-t transition-all hover:brightness-125"
                    style={{ height: `${(amount / maxHourAmount) * 100}%`, minHeight: amount > 0 ? '4px' : '0' }}
                    title={`${hour}:00 → $${amount.toFixed(2)}`}
                  />
                  <span className="text-[8px] text-gray-600 tabular-nums" style={{ writingMode: 'horizontal-tb' }}>
                    {hour % 3 === 0 ? hour : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Counter({ icon, label, value, sub }) {
  return (
    <div className="bg-dark-800 rounded-2xl p-3 border border-white/5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-white text-xl font-black tabular-nums">{value}</p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}
