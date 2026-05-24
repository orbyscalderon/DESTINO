import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiSearch, FiVideo, FiX, FiGlobe } from 'react-icons/fi';
import VideoRoom from '../components/ui/VideoRoom.jsx';
import PremiumModal from '../components/ui/PremiumModal.jsx';
import { useAuthStore } from '../store/authStore.js';
import { COUNTRIES } from '../lib/geodata.js';
import FlagImg from '../components/ui/FlagImg.jsx';
import api from '../lib/api.js';

const GENDER_OPTIONS = [
  { value: 'any',    label: 'Cualquiera', emoji: '👥' },
  { value: 'male',   label: 'Hombres',    emoji: '👨' },
  { value: 'female', label: 'Mujeres',    emoji: '👩' },
  { value: 'other',  label: 'Otro',       emoji: '✨' },
];

const REGIONS = [
  {
    id: 'latam',  label: 'Latinoamérica',
    codes: ['MX','CO','AR','VE','PE','CL','EC','BO','CU','DO','GT','HN','SV','NI','CR','PA','PR','UY','PY','BR'],
  },
  { id: 'norte',  label: 'Norteamérica', codes: ['US','CA'] },
  { id: 'europa', label: 'Europa',       codes: ['ES','PT','FR','DE','IT','GB','RU'] },
  { id: 'asia',   label: 'Asia / Otros', codes: ['JP','KR','CN','IN','TR','SA','PH','NG','ZA','AU'] },
];

function loadRecent() {
  try { return JSON.parse(localStorage.getItem('videoRecentCountries') || '[]'); } catch { return []; }
}

export default function Video() {
  const { profile } = useAuthStore();

  const [genderFilter,    setGenderFilter]    = useState('any');
  const [countryFilter,   setCountryFilter]   = useState('any');
  const [countrySearch,   setCountrySearch]   = useState('');
  const [activeRegion,    setActiveRegion]    = useState('latam');
  const [recentCodes,     setRecentCodes]     = useState(loadRecent);
  const [videoUsage,      setVideoUsage]      = useState({ count: 0, remaining: 5, limit: 5, is_premium: false });
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    api.get('/api/video/usage/today')
      .then(({ data }) => setVideoUsage(data))
      .catch(() => {});
  }, []);

  const selectCountry = (code) => {
    setCountryFilter(code);
    setCountrySearch('');
    if (code !== 'any') {
      const updated = [code, ...recentCodes.filter(c => c !== code)].slice(0, 5);
      setRecentCodes(updated);
      localStorage.setItem('videoRecentCountries', JSON.stringify(updated));
    }
  };

  const displayList = useMemo(() => {
    if (countrySearch) {
      const q = countrySearch.toLowerCase();
      return COUNTRIES.filter(c => c.name.toLowerCase().includes(q));
    }
    const region = REGIONS.find(r => r.id === activeRegion);
    if (!region) return COUNTRIES;
    return region.codes.map(code => COUNTRIES.find(c => c.code === code)).filter(Boolean);
  }, [activeRegion, countrySearch]);

  const selectedCountry = COUNTRIES.find(c => c.code === countryFilter);
  const recentList      = recentCodes.map(code => COUNTRIES.find(c => c.code === code)).filter(Boolean);

  const usedCalls = videoUsage.limit - (videoUsage.remaining ?? 0);
  const usagePct  = videoUsage.is_premium ? 0 : Math.round((usedCalls / videoUsage.limit) * 100);

  return (
    <div className="min-h-screen px-4 pt-8 pb-6 lg:px-10 lg:pt-10">

      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Video Aleatorio</h1>
        <p className="text-gray-400 text-sm mt-1">Conecta por video con alguien nuevo</p>
      </div>

      {/* Banner de llamadas */}
      {!videoUsage.is_premium && videoUsage.remaining !== null && (
        <div className={`mb-5 px-4 py-3 rounded-xl border ${
          videoUsage.remaining === 0
            ? 'bg-red-500/10 border-red-500/20'
            : videoUsage.remaining <= 2
            ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-dark-800 border-white/5'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FiVideo size={13} className={
                videoUsage.remaining === 0 ? 'text-red-400'
                : videoUsage.remaining <= 2 ? 'text-yellow-400'
                : 'text-gray-400'
              } />
              <span className="text-sm text-gray-400">
                Llamadas hoy:{' '}
                <span className={`font-bold ${
                  videoUsage.remaining === 0 ? 'text-red-400'
                  : videoUsage.remaining <= 2 ? 'text-yellow-400'
                  : 'text-white'
                }`}>{usedCalls}</span>
                <span className="text-gray-600"> / {videoUsage.limit}</span>
              </span>
            </div>
            <Link to="/premium" className="text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors">
              Ir Premium →
            </Link>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                videoUsage.remaining === 0 ? 'bg-red-500'
                : videoUsage.remaining <= 2 ? 'bg-yellow-400'
                : 'bg-brand-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${usagePct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Layout */}
      <div className="max-w-5xl mx-auto lg:grid lg:grid-cols-[300px_1fr] lg:gap-8 lg:items-start">

        {/* ── Panel izquierdo: filtros ── */}
        <div className="mb-4 lg:mb-0 space-y-4">

          {/* Filtro de género */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Género</h3>
              {!profile?.is_premium && (
                <button
                  onClick={() => setShowPremiumModal(true)}
                  className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  <FiLock size={10} /> Premium
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map(({ value, label, emoji }) => {
                const locked = !profile?.is_premium && value !== 'any';
                return (
                  <button
                    key={value}
                    onClick={() => locked ? setShowPremiumModal(true) : setGenderFilter(value)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                      genderFilter === value && !locked
                        ? 'bg-brand-500 text-white'
                        : locked
                        ? 'bg-dark-700 text-gray-600'
                        : 'bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-gray-200'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{label}</span>
                    {locked && <FiLock size={9} className="text-yellow-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtro de país */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <FiGlobe size={14} className="text-gray-500" /> País
              </h3>
              {countryFilter !== 'any' && (
                <button
                  onClick={() => selectCountry('any')}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                >
                  <FiX size={11} /> Limpiar
                </button>
              )}
            </div>

            {/* Selección activa */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => selectCountry('any')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  countryFilter === 'any'
                    ? 'bg-brand-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                }`}
              >
                🌍 Cualquier país
              </button>
              {countryFilter !== 'any' && selectedCountry && (
                <div className="flex-1 py-2 rounded-xl text-sm font-medium bg-brand-500/20 border border-brand-500/30 text-brand-300 flex items-center justify-center gap-1.5">
                  <FlagImg code={selectedCountry.code} className="w-5 h-3.5 rounded-sm object-cover" />
                  <span className="text-xs truncate">{selectedCountry.name}</span>
                </div>
              )}
            </div>

            {/* Buscador */}
            <div className="relative mb-3">
              <FiSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                className="input-field pl-8 py-2 text-sm"
                placeholder="Buscar país…"
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
              />
              {countrySearch && (
                <button
                  onClick={() => setCountrySearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <FiX size={12} />
                </button>
              )}
            </div>

            {/* Tabs de región (solo cuando no se busca) */}
            {!countrySearch && (
              <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
                {REGIONS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRegion(r.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
                      activeRegion === r.id
                        ? 'bg-white/15 text-white'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* Recientes */}
            {!countrySearch && recentList.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Recientes</p>
                <div className="flex gap-1.5 flex-wrap">
                  {recentList.map(c => (
                    <button
                      key={c.code}
                      onClick={() => selectCountry(c.code)}
                      title={c.name}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all border ${
                        countryFilter === c.code
                          ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                          : 'bg-dark-700 border-white/5 text-gray-300 hover:bg-dark-600'
                      }`}
                    >
                      <FlagImg code={c.code} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grid de banderas */}
            <div className="max-h-52 overflow-y-auto rounded-xl">
              <div className="grid grid-cols-4 gap-1.5">
                {displayList.map(c => (
                  <button
                    key={c.code}
                    onClick={() => selectCountry(c.code)}
                    title={c.name}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all border text-center ${
                      countryFilter === c.code
                        ? 'bg-brand-500/20 border-brand-500/50 ring-1 ring-brand-500/40'
                        : 'bg-dark-700 border-white/5 hover:bg-dark-600 hover:border-white/10'
                    }`}
                  >
                    <FlagImg code={c.code} className="w-8 h-5 rounded-sm object-cover" />
                    <span className={`text-[10px] leading-tight w-full truncate ${
                      countryFilter === c.code ? 'text-brand-300 font-semibold' : 'text-gray-400'
                    }`}>{c.name}</span>
                  </button>
                ))}
                {displayList.length === 0 && (
                  <p className="col-span-4 text-center text-gray-600 text-xs py-4">Sin resultados</p>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="card p-4 bg-dark-700/40">
            <p className="text-gray-500 text-xs leading-relaxed">
              Las videollamadas son anónimas y aleatorias. Sé respetuoso y diviértete conociendo gente nueva.
            </p>
          </div>

          {profile?.is_premium && (
            <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
              <p className="text-yellow-400 text-xs font-medium">⚡ Premium activo</p>
              <p className="text-gray-500 text-xs mt-1">Filtros de género y país desbloqueados</p>
            </div>
          )}
        </div>

        {/* ── Panel derecho: sala de video ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-[600px] lg:h-[720px]"
        >
          <VideoRoom
            genderFilter={genderFilter}
            countryFilter={countryFilter}
            videoCallsRemaining={videoUsage.is_premium ? Infinity : (videoUsage.remaining ?? 5)}
            onLimitReached={() => setShowPremiumModal(true)}
            onCallStarted={() =>
              setVideoUsage(v => ({
                ...v,
                remaining: Math.max(0, (v.remaining ?? 1) - 1),
                count: v.count + 1,
              }))
            }
          />
        </motion.div>
      </div>

      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
