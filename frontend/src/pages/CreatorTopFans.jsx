import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import AnimatedCounter from '../components/ui/AnimatedCounter.jsx';
import { EmptyHeart } from '../components/ui/illustrations/index.js';
import { SkeletonStatRow, SkeletonList } from '../components/ui/skeletons/index.jsx';

const BADGE_META = {
  bronze_supporter:   { emoji: '🥉', label: 'Bronze',   color: 'text-amber-600 border-amber-600/30 bg-amber-600/5' },
  silver_supporter:   { emoji: '🥈', label: 'Silver',   color: 'text-gray-300 border-gray-300/30 bg-gray-300/5' },
  gold_supporter:     { emoji: '🥇', label: 'Gold',     color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5' },
  diamond_supporter:  { emoji: '💎', label: 'Diamond',  color: 'text-cyan-300 border-cyan-300/30 bg-cyan-300/5' },
  loyal_6m:           { emoji: '💝', label: '6 meses',  color: 'text-rose-300 border-rose-300/30 bg-rose-300/5' },
  anniversary_1y:     { emoji: '🎂', label: '1 año',    color: 'text-fuchsia-300 border-fuchsia-300/30 bg-fuchsia-300/5' },
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
    <PageShell
      icon={FiHeart}
      title="Top Fans"
      subtitle="Tus 50 fans con más gasto total. Los badges se desbloquean automáticamente por loyalty."
      backTo="/creator/monetization"
      maxWidth="3xl"
    >
      {loading ? (
        <div className="space-y-2">
          <SkeletonList count={6} Component={SkeletonStatRow} />
        </div>
      ) : fans.length === 0 ? (
        <EmptyState
          illustration={<EmptyHeart size={140} />}
          title="Todavía no tenés fans pagantes"
          desc="Compartí tu perfil — apenas alguien envía un tip, hace una compra o se suscribe, aparece acá."
        />
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="space-y-2"
        >
          <AnimatePresence>
            {fans.map((f, i) => (
              <motion.div
                key={f.fan_id}
                layout
                variants={{
                  hidden: { opacity: 0, x: -16 },
                  show:   { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
                }}
                className={`card-interactive p-4 flex items-center gap-3 ${i < 3 ? 'border-brand-500/20' : ''}`}
              >
                {/* Ranking number */}
                <div className={`w-10 shrink-0 text-center font-black tabular-nums
                                ${i === 0 ? 'text-2xl gradient-text' :
                                  i === 1 ? 'text-xl text-gray-300'  :
                                  i === 2 ? 'text-xl text-amber-600' :
                                            'text-base text-gray-600'}`}>
                  #{i + 1}
                </div>

                {/* Avatar */}
                {f.profiles?.avatar_url ? (
                  <img
                    src={f.profiles.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/10">
                    {f.profiles?.full_name?.[0] || '?'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{f.profiles?.full_name || 'Fan'}</p>
                  <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                    {f.tips_count} tips · {f.ppv_purchases} PPV · {f.subscription_months}m sub
                  </p>
                  {f.badges?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {f.badges.map(b => {
                        const m = BADGE_META[b];
                        if (!m) return null;
                        return (
                          <span key={b}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${m.color}`}>
                            {m.emoji} {m.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-lg font-black tabular-nums
                                ${i < 3 ? 'gradient-text' : 'text-white'}`}>
                    <AnimatedCounter value={f.total_spent_coins} duration={1400 + i * 100} />
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">coins</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </PageShell>
  );
}
