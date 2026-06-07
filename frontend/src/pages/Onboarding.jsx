import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCamera, FiChevronRight, FiChevronLeft, FiSearch } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { COUNTRIES, LANGUAGES } from '../lib/geodata.js';
import { compressAvatar } from '../lib/imageCompressor.js';

const STEP_LABELS = ['Foto', 'Sobre ti', 'Ubicación', 'Bio', 'Intereses'];

const ALL_INTERESTS = [
  '🎵 Música', '✈️ Viajes', '💪 Fitness', '🎮 Gaming',
  '📸 Fotografía', '🍷 Vinos', '🎬 Cine', '📚 Libros',
  '🍕 Gastronomía', '🎨 Arte', '🐾 Mascotas', '⚽ Deportes',
  '🌿 Naturaleza', '💃 Baile', '🧘 Yoga', '🎤 Música en vivo',
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, fetchProfile } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [form, setForm] = useState({
    username: '', fullName: '', age: '', gender: '', bio: '',
    country: '', language: 'es', interests: [],
  });

  const handlePhotoChange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const compressed = await compressAvatar(f);
    setFile(compressed);
    setPreview(URL.createObjectURL(compressed));
  };

  const goNext = () => {
    if (step === 1) {
      if (!form.username.trim()) return toast.error('El username es requerido');
      if (!/^[a-z0-9_]{3,20}$/.test(form.username)) return toast.error('Username: 3-20 caracteres, solo letras, números y _');
      if (!form.age || parseInt(form.age) < 18 || parseInt(form.age) > 100) return toast.error('Ingresa una edad válida (18-100)');
      if (!form.gender) return toast.error('Selecciona tu género');
    }
    setStep(s => s + 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      if (file) {
        const fd = new FormData();
        fd.append('avatar', file);
        await api.post('/api/profiles/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      await api.put(`/api/profiles/${user.id}`, {
        username: form.username,
        full_name: form.fullName || form.username,
        age: form.age,
        gender: form.gender,
        bio: form.bio,
        country: form.country || null,
        language: form.language || 'es',
        interests: form.interests,
      });

      await fetchProfile(user.id);

      // Pedir geolocalización (no bloqueante)
      try {
        const { requestAndSaveLocation } = await import('../lib/geolocation.js');
        requestAndSaveLocation().catch(() => {});
      } catch {}

      toast.success('¡Perfil creado!');
      navigate('/home');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar perfil');
    } finally {
      setLoading(false);
    }
  };

  // Auto-detectar país por IP al llegar al paso de ubicación
  useEffect(() => {
    if (step !== 2 || form.country) return;
    api.get('/api/profiles/geoip')
      .then(({ data }) => {
        if (!data.countryCode) return;
        const match = COUNTRIES.find(c => c.code === data.countryCode);
        if (match) {
          setForm(f => ({
            ...f,
            country: match.code,
            language: match.lang || f.language,
          }));
        }
      })
      .catch(() => {});
  }, [step]);

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-accent-500/8 rounded-full blur-3xl pointer-events-none animate-float" style={{ animationDelay: '1.2s' }} />
      <motion.div className="w-full max-w-sm relative z-10">

        {/* Indicador de pasos */}
        <div className="mb-6">
          <div className="flex gap-2 mb-2">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-gradient-to-r from-brand-500 to-accent-500 shadow-glow-sm' : 'bg-white/10'}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600 text-right">
            Paso {step + 1} de {STEP_LABELS.length} · {STEP_LABELS[step]}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* Paso 0: Foto */}
          {step === 0 && (
            <motion.div key="photo" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-2xl font-bold mb-1">Tu foto de perfil</h2>
              <p className="text-gray-400 text-sm mb-6">Una buena foto consigue más matches</p>

              <label className="cursor-pointer block">
                <div className="w-40 h-40 rounded-full mx-auto bg-dark-700 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden hover:border-brand-500 transition-colors">
                  {preview ? (
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-gray-500">
                      <FiCamera size={32} className="mx-auto mb-2" />
                      <span className="text-xs">Subir foto</span>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>

              <p className="text-center text-xs text-gray-600 mt-3">
                {preview ? '✓ Foto seleccionada' : 'Puedes cambiarla después'}
              </p>

              <button onClick={() => setStep(1)} className="btn-primary w-full mt-8 flex items-center justify-center gap-2">
                {preview ? 'Continuar' : 'Omitir por ahora'} <FiChevronRight />
              </button>
            </motion.div>
          )}

          {/* Paso 1: Info básica */}
          {step === 1 && (
            <motion.div key="info" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-2xl font-bold mb-1">Cuéntanos sobre ti</h2>
              <p className="text-gray-400 text-sm mb-6">Esta información aparecerá en tu perfil</p>

              <div className="space-y-3">
                <div>
                  <input
                    className="input-field"
                    placeholder="Nombre de usuario (único) *"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                  />
                  {form.username.length > 0 && !/^[a-z0-9_]{3,20}$/.test(form.username) && (
                    <p className="text-xs text-brand-400 mt-1">3-20 caracteres, sin espacios ni mayúsculas</p>
                  )}
                </div>
                <input
                  className="input-field"
                  placeholder="Nombre completo"
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                />
                <input
                  className="input-field"
                  type="number"
                  placeholder="Edad *"
                  min={18}
                  max={100}
                  value={form.age}
                  onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                />
                <div>
                  <p className="text-xs text-gray-500 mb-2">Género *</p>
                  <div className="grid grid-cols-3 gap-2">
                    {['male', 'female', 'other'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, gender: g }))}
                        className={`py-3 rounded-xl text-sm font-medium transition-all duration-200 ease-out-expo active:scale-95 ${
                          form.gender === g
                            ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow-sm'
                            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        {g === 'male' ? 'Hombre' : g === 'female' ? 'Mujer' : 'Otro'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(0)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-95 shrink-0">
                  <FiChevronLeft />
                </button>
                <button onClick={goNext} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Continuar <FiChevronRight />
                </button>
              </div>
            </motion.div>
          )}

          {/* Paso 2: País e idioma */}
          {step === 2 && (
            <motion.div key="location" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-2xl font-bold mb-1">¿De dónde eres?</h2>
              <p className="text-gray-400 text-sm mb-5">Conecta con personas de tu región o idioma</p>

              {/* País */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-2">
                  País
                  {!form.country && (
                    <span className="text-[10px] text-brand-400 flex items-center gap-1 normal-case">
                      <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
                      Detectando ubicación…
                    </span>
                  )}
                </p>
                {form.country ? (
                  <div className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2.5 mb-1">
                    <span className="text-sm text-white">
                      {COUNTRIES.find(c => c.code === form.country)?.flag}{' '}
                      {COUNTRIES.find(c => c.code === form.country)?.name}
                    </span>
                    <button
                      onClick={() => setForm(f => ({ ...f, country: '' }))}
                      className="text-gray-500 hover:text-white ml-2 text-xs"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative mb-2">
                      <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        className="input-field pl-8 py-2 text-sm"
                        placeholder="Buscar país..."
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                      />
                    </div>
                    {countrySearch && (
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-white/5 bg-dark-800 divide-y divide-white/5">
                        {filteredCountries.map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setForm(f => ({ ...f, country: c.code, language: c.lang }));
                              setCountrySearch('');
                            }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-300 hover:bg-dark-700 transition-colors"
                          >
                            <span>{c.flag}</span>
                            <span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Idioma */}
              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Idioma principal</p>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, language: l.code }))}
                      className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all text-left ${
                        form.language === l.code
                          ? 'bg-brand-500 text-white'
                          : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-95 shrink-0">
                  <FiChevronLeft />
                </button>
                <button onClick={() => setStep(3)} className="btn-secondary flex-1 py-2.5 text-sm">
                  Omitir
                </button>
                <button onClick={() => setStep(3)} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 shadow-glow">
                  Continuar <FiChevronRight />
                </button>
              </div>
            </motion.div>
          )}

          {/* Paso 3: Bio */}
          {step === 3 && (
            <motion.div key="bio" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-2xl font-bold mb-1">Sobre ti</h2>
              <p className="text-gray-400 text-sm mb-6">Escribe algo que te haga interesante</p>

              <textarea
                className="input-field min-h-[120px] resize-none"
                placeholder="Hola, me llamo... me gusta..."
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                maxLength={300}
              />
              <p className="text-gray-600 text-xs mt-1 text-right">{form.bio.length}/300</p>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-95 shrink-0">
                  <FiChevronLeft />
                </button>
                <button onClick={() => setStep(4)} className="btn-primary flex-1 flex items-center justify-center gap-2 shadow-glow">
                  Continuar <FiChevronRight />
                </button>
              </div>
            </motion.div>
          )}

          {/* Paso 4: Intereses */}
          {step === 4 && (
            <motion.div key="interests" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-2xl font-bold mb-1">¿Qué te apasiona?</h2>
              <p className="text-gray-400 text-sm mb-1">Elige hasta 8 intereses para encontrar personas afines</p>
              <p className="text-gray-600 text-xs mb-5">Puedes cambiarlos después en tu perfil</p>

              <div className="flex flex-wrap gap-2 mb-6">
                {ALL_INTERESTS.map(tag => {
                  const selected = form.interests.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        interests: selected
                          ? f.interests.filter(t => t !== tag)
                          : f.interests.length < 8 ? [...f.interests, tag] : f.interests,
                      }))}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ease-out-expo active:scale-95 ${
                        selected
                          ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow-sm'
                          : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <p className="text-gray-600 text-xs mb-4 text-right">{form.interests.length}/8 seleccionados</p>

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 ease-out-expo active:scale-95 shrink-0">
                  <FiChevronLeft />
                </button>
                <button onClick={handleFinish} disabled={loading} className="btn-primary flex-1 shadow-glow hover:shadow-glow-lg">
                  {loading ? 'Guardando...' : '¡Empezar a conectar!'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
