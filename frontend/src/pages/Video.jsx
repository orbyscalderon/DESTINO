import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiSearch, FiVideo } from 'react-icons/fi';
import VideoRoom from '../components/ui/VideoRoom.jsx';
import PremiumModal from '../components/ui/PremiumModal.jsx';
import { useAuthStore } from '../store/authStore.js';
import { COUNTRIES } from '../lib/geodata.js';
import api from '../lib/api.js';

const GENDER_OPTIONS = [
  { value: 'any',    label: 'Cualquiera' },
  { value: 'male',   label: 'Hombres' },
  { value: 'female', label: 'Mujeres' },
  { value: 'other',  label: 'Otro' },
];

export default function Video() {
  const { profile } = useAuthStore();
  const [genderFilter, setGenderFilter] = useState('any');
  const [countryFilter, setCountryFilter] = useState('any');
  const [countrySearch, setCountrySearch] = useState('');
  const [videoUsage, setVideoUsage] = useState({ count: 0, remaining: 5, limit: 5, is_premium: false });
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    api.get('/api/video/usage/today')
      .then(({ data }) => setVideoUsage(data))
      .catch(() => {});
  }, []);

  const selectedCountry = COUNTRIES.find(c => c.code === countryFilter);
  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-6 lg:px-10 lg:pt-10">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Video Aleatorio</h1>
        <p className="text-gray-400 text-sm mt-1">Conecta por video con alguien nuevo</p>
      </div>

      {/* Banner de límite de llamadas */}
      {!videoUsage.is_premium && videoUsage.remaining !== null && (
        <div className={`mb-5 flex items-center justify-between px-4 py-2.5 rounded-xl border ${
          videoUsage.remaining <= 1
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-dark-800 border-white/5'
        }`}>
          <div className="flex items-center gap-2">
            <FiVideo size={14} className={videoUsage.remaining <= 1 ? 'text-red-400' : 'text-gray-400'} />
            <span className="text-sm text-gray-400">
              Llamadas hoy:{' '}
              <span className={`font-semibold ${videoUsage.remaining === 0 ? 'text-red-400' : videoUsage.remaining <= 2 ? 'text-yellow-400' : 'text-white'}`}>
                {videoUsage.remaining}
              </span>
              <span className="text-gray-600"> / {videoUsage.limit}</span>
            </span>
          </div>
          <Link to="/premium" className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">
            Ir Premium →
          </Link>
        </div>
      )}

      {/* Layout: columna en móvil, 2 columnas en desktop */}
      <div className="max-w-5xl mx-auto lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start">

        {/* Panel izquierdo: filtros */}
        <div className="mb-4 lg:mb-0 space-y-4">

          {/* Filtro de género */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Filtro de género</h3>
              {!profile?.is_premium && (
                <Link to="/premium" className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300">
                  <FiLock size={10} /> Premium
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => profile?.is_premium && setGenderFilter(value)}
                  disabled={!profile?.is_premium && value !== 'any'}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                    genderFilter === value
                      ? 'bg-brand-500 text-white'
                      : !profile?.is_premium && value !== 'any'
                      ? 'bg-dark-700 text-gray-600 cursor-not-allowed'
                      : 'bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!profile?.is_premium && (
              <p className="text-gray-600 text-xs mt-3 text-center">
                Hazte Premium para elegir el género
              </p>
            )}
          </div>

          {/* Filtro de país */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Filtro de país</h3>

            {/* Selección actual */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setCountryFilter('any'); setCountrySearch(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  countryFilter === 'any' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                }`}
              >
                Cualquier país
              </button>
              {countryFilter !== 'any' && selectedCountry && (
                <div className="flex-1 py-2 rounded-xl text-sm font-medium bg-brand-500/20 text-brand-300 flex items-center justify-center gap-1.5">
                  <span>{selectedCountry.flag}</span>
                  <span className="truncate">{selectedCountry.name}</span>
                </div>
              )}
            </div>

            {/* Buscador */}
            <div className="relative mb-1">
              <FiSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input-field pl-8 py-2 text-sm"
                placeholder="Buscar país..."
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
              />
            </div>
            {countrySearch && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-white/5 bg-dark-800 divide-y divide-white/5">
                {filteredCountries.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setCountryFilter(c.code); setCountrySearch(''); }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-dark-700 transition-colors ${
                      countryFilter === c.code ? 'text-brand-300' : 'text-gray-300'
                    }`}
                  >
                    <span>{c.flag}</span><span>{c.name}</span>
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <p className="text-gray-500 text-xs px-3 py-2">Sin resultados</p>
                )}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="card p-4 bg-dark-700/40">
            <p className="text-gray-500 text-xs leading-relaxed">
              Las videollamadas son anónimas y aleatorias. Sé respetuoso y diviértete conociendo gente nueva.
            </p>
          </div>

          {profile?.is_premium && (
            <div className="card p-4 border-yellow-500/20 bg-yellow-500/5">
              <p className="text-yellow-400 text-xs font-medium">⚡ Premium activo</p>
              <p className="text-gray-500 text-xs mt-1">Filtros de género y país habilitados</p>
            </div>
          )}
        </div>

        {/* Panel derecho: sala de video */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-[500px] lg:h-[600px]"
        >
          <VideoRoom
            genderFilter={genderFilter}
            countryFilter={countryFilter}
            videoCallsRemaining={videoUsage.is_premium ? Infinity : (videoUsage.remaining ?? 5)}
            onLimitReached={() => setShowPremiumModal(true)}
            onCallStarted={() => setVideoUsage(v => ({ ...v, remaining: Math.max(0, (v.remaining ?? 1) - 1), count: v.count + 1 }))}
          />
        </motion.div>
      </div>

      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
