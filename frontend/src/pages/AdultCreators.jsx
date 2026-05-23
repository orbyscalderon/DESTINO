import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSearch, FiStar, FiUsers, FiArrowLeft } from 'react-icons/fi';
import api from '../lib/api.js';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';

export default function AdultCreators() {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(isAgeVerified);
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = { current: null };

  const load = useCallback(async (q = '', p = 0, append = false) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/creator/discover?q=${encodeURIComponent(q)}&page=${p}`);
      setCreators(prev => append ? [...prev, ...(data.creators || [])] : (data.creators || []));
      setHasMore(data.hasMore || false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (verified) load('', 0);
  }, [verified]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      load(q, 0);
    }, 400);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(query, next, true);
  };

  if (!verified) {
    return <AgeGate onVerified={() => setVerified(true)} />;
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-dark-900/90 backdrop-blur-md border-b border-white/5 px-4 pt-8 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white">Creadores Adultos</h1>
          <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">18+</span>
        </div>
        <div className="relative">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={handleSearch}
            placeholder="Buscar creadores..."
            className="input-field pl-9 py-2.5 text-sm w-full"
          />
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading && creators.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : creators.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-5xl mb-4">🔍</p>
            <p>No se encontraron creadores</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {creators.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/profile/${c.id}`)}
                  className="card overflow-hidden text-left hover:border-brand-500/30 transition-colors"
                >
                  <div className="relative h-36 bg-dark-700">
                    <img
                      src={c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || 'C')}&size=300&background=1a1a2e&color=f43f5e`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent" />
                    {c.is_verified && (
                      <div className="absolute top-2 right-2">
                        <VerifiedBadge size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    <p className="text-white font-semibold text-sm truncate">{c.full_name}</p>
                    {c.creator_bio && (
                      <p className="text-gray-500 text-[11px] line-clamp-2">{c.creator_bio}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-600 flex items-center gap-1">
                        <FiUsers size={9} /> {c.subscribers_count || 0}
                      </span>
                      {c.creator_subscription_price ? (
                        <span className="bg-brand-500/20 text-brand-400 font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <FiStar size={8} /> ${parseFloat(c.creator_subscription_price).toFixed(2)}/mes
                        </span>
                      ) : (
                        <span className="text-gray-600">Gratis</span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="btn-secondary text-sm px-6 py-2.5 disabled:opacity-50"
                >
                  {loading ? 'Cargando...' : 'Ver más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
