import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api from '../../lib/api.js';

// Gráfico de revenue diario: coin_sales (100%) + commission (30% de tx).
// Usa recharts que ya está en el bundle separado del Dashboard.

export default function AdminRevenueChart({ days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/admin/revenue-daily?days=${days}`)
      .then(({ data }) => setData(data.series || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <div className="skeleton h-64" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-500 text-sm">
        Sin datos suficientes para el gráfico
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.total, 0);
  const max = Math.max(...data.map(d => d.total));
  const avg = total / data.length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white">Revenue por día ({days}d)</h3>
        <div className="flex gap-3 text-[10px]">
          <span className="text-gray-500">Total <span className="text-white font-bold">${total.toFixed(2)}</span></span>
          <span className="text-gray-500">Promedio <span className="text-white font-bold">${avg.toFixed(2)}</span></span>
          <span className="text-gray-500">Máx <span className="text-white font-bold">${max.toFixed(2)}</span></span>
        </div>
      </div>
      <div className="h-56 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="coinSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#facc15" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="commission" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickFormatter={(d) => {
                const [y, m, dd] = d.split('-');
                return `${dd}/${m}`;
              }}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: '#0d0d1a',
                border: '1px solid #27272a',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(v) => `$${Number(v).toFixed(2)}`}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
            <Area
              type="monotone"
              dataKey="coin_sales"
              name="Venta de coins"
              stroke="#facc15"
              strokeWidth={2}
              fill="url(#coinSales)"
            />
            <Area
              type="monotone"
              dataKey="commission"
              name="Comisión (30%)"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#commission)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
