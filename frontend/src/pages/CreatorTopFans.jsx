import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiHeart } from 'react-icons/fi';
import api from '../lib/api.js';

const BADGE_META = {
  bronze_supporter:   { emoji: '🥉', label: 'Bronze' },
  silver_supporter:   { emoji: '🥈', label: 'Silver' },
  gold_supporter:     { emoji: '🥇', label: 'Gold' },
  diamond_supporter:  { emoji: '💎', label: 'Diamond' },
  loyal_6m:           { emoji: '💝', label: '6 months' },
  anniversary_1y:     { emoji: '🎂', label: '1 year' },
};

export default function CreatorTopFans() {
  const [fans, setFans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/creator-monetization/top-fans')
      .then(r => setFans(r.data?.fans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <h1 className="text-3xl font-black gradient-text flex items-center gap-2 mb-2"><FiHeart /> Top Fans</h1>
        <p className="text-gray-500 text-sm mb-8">Tus 50 fans con más gasto total. Badges automáticos por loyalty.</p>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Cargando…</div>
        ) : fans.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Todavía no tenés fans pagantes. Comparte tu perfil 💕</div>
        ) : (
          <div className="space-y-2">
            {fans.map((f, i) => (
              <div key={f.fan_id} className="glass-strong rounded-xl p-4 border border-white/5 flex items-center gap-3">
                <span className="text-2xl font-black text-gray-600 w-10 text-center">#{i + 1}</span>
                {f.profiles?.avatar_url ? (
                  <img src={f.profiles.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
                    {f.profiles?.full_name?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{f.profiles?.full_name || 'Fan'}</p>
                  <p className="text-xs text-gray-500">
                    {f.tips_count} tips · {f.ppv_purchases} PPV · {f.subscription_months}m sub
                  </p>
                  {f.badges?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {f.badges.map(b => (
                        <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">
                          {BADGE_META[b]?.emoji} {BADGE_META[b]?.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black gradient-text">{f.total_spent_coins.toLocaleString('es')}</p>
                  <p className="text-[10px] text-gray-500 uppercase">coins</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
