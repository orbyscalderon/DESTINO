import { useEffect, useMemo, useState } from 'react';
import { FiGlobe, FiX, FiInfo, FiSearch, FiCheck, FiFileText, FiFilm,
  FiVideo, FiImage, FiFolder, FiUser, FiTrash2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuthStore } from '../store/authStore.js';
import PageShell from '../components/layout/PageShell.jsx';
import { COUNTRIES, countryByCode } from '../lib/geodata.js';

// Tipos de contenido bloqueables. Cada uno con su ícono visual.
const CONTENT_TYPES = [
  { id: 'post',       label: 'Post',       icon: FiFileText, desc: 'Publicación de feed' },
  { id: 'reel',       label: 'Reel',       icon: FiFilm,     desc: 'Reel corto vertical' },
  { id: 'video',      label: 'Video',      icon: FiVideo,    desc: 'Video largo (explore)' },
  { id: 'photo',      label: 'Foto',       icon: FiImage,    desc: 'Foto individual del perfil' },
  { id: 'collection', label: 'Colección',  icon: FiFolder,   desc: 'Set de fotos pagas' },
  { id: 'profile',    label: 'Perfil',     icon: FiUser,     desc: 'Tu perfil completo' },
];

export default function CreatorGeoBlock() {
  const { profile } = useAuthStore();
  const [blocks, setBlocks] = useState([]);
  const [contentType, setContentType] = useState('post');
  const [contentId, setContentId] = useState('');
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [saving, setSaving] = useState(false);

  // Para tipo "profile", autocompleta el content_id con su propio ID
  useEffect(() => {
    if (contentType === 'profile' && profile?.id) {
      setContentId(profile.id);
    }
  }, [contentType, profile?.id]);

  const load = () => api
    .get('/api/creator-monetization/content-geo/mine')
    .then(r => setBlocks(r.data?.blocks || []))
    .catch(() => {});

  useEffect(() => { load(); }, []);

  const toggleCountry = (code) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const reset = () => {
    setContentType('post');
    setContentId('');
    setSelectedCountries([]);
    setReason('');
    setSearch('');
    setShowCountries(false);
  };

  const apply = async () => {
    if (!contentId.trim()) {
      return toast.error('Pega el UUID del contenido (o usá "Perfil" para bloquear todo)');
    }
    if (selectedCountries.length === 0) {
      return toast.error('Seleccioná al menos un país a bloquear');
    }
    setSaving(true);
    try {
      await api.put('/api/creator-monetization/content-geo', {
        content_type: contentType,
        content_id: contentId.trim(),
        country_codes: selectedCountries,
        reason: reason.trim() || undefined,
      });
      toast.success('Geo-block aplicado');
      reset();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aplicar');
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (b) => {
    if (!confirm('¿Quitar este geo-block?')) return;
    try {
      await api.delete(`/api/creator-monetization/content-geo/${b.content_type}/${b.content_id}`);
      toast.success('Bloqueo eliminado');
      load();
    } catch {
      toast.error('Error eliminando');
    }
  };

  return (
    <PageShell
      icon={FiGlobe}
      title="Geo Block"
      subtitle="Bloqueá tu contenido por país. Visitantes de esos países verán un mensaje de no disponible."
      backTo="/creator/monetization"
      backLabel="Volver al hub"
      maxWidth="3xl"
    >
      {/* Form panel */}
      <div className="card p-5 mb-6 space-y-5">
        {/* Step 1: tipo de contenido */}
        <Section title="1 · ¿Qué tipo de contenido vas a bloquear?">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CONTENT_TYPES.map(t => {
              const Icon = t.icon;
              const active = contentType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setContentType(t.id); if (t.id !== 'profile') setContentId(''); }}
                  className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'bg-brand-500/15 border-brand-500/40 ring-1 ring-brand-500/40'
                      : 'bg-dark-800 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${active ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-gray-400'}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{t.label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{t.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Step 2: content ID (auto si es profile) */}
        {contentType === 'profile' ? (
          <Section title="2 · Tu perfil">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-500/5 border border-brand-500/20">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
                <FiUser className="text-brand-300" size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-semibold truncate">{profile?.full_name || 'Tu perfil'}</p>
                <p className="text-[10px] text-gray-500 font-mono truncate">{profile?.id}</p>
              </div>
              <span className="text-[10px] text-brand-300 font-bold uppercase">Bloqueo total</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-2 flex items-start gap-1">
              <FiInfo size={11} className="shrink-0 mt-0.5" />
              Si elegís "Perfil", se bloquea TODO tu contenido para los visitantes de esos países, incluyendo búsqueda y discovery.
            </p>
          </Section>
        ) : (
          <Section title={`2 · UUID del ${labelFor(contentType)} a bloquear`}>
            <input
              value={contentId}
              onChange={e => setContentId(e.target.value)}
              placeholder="Ej: 4f374054-acb5-40c2-b01f-bed1fc2b540e"
              className="input-field w-full text-sm font-mono"
            />
            <p className="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1">
              <FiInfo size={11} className="shrink-0 mt-0.5" />
              El UUID lo encontrás en la URL del contenido (al abrirlo). Para bloquear todo tu contenido, usá el tipo "Perfil".
            </p>
          </Section>
        )}

        {/* Step 3: países */}
        <Section title="3 · ¿En qué países?">
          {/* Chips de seleccionados */}
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedCountries.map(code => {
                const c = countryByCode(code);
                return (
                  <span key={code} className="inline-flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold px-2.5 py-1 rounded-full">
                    {c?.flag} {c?.name || code}
                    <button onClick={() => toggleCountry(code)} className="hover:text-rose-100">
                      <FiX size={12} />
                    </button>
                  </span>
                );
              })}
              <button
                onClick={() => setSelectedCountries([])}
                className="text-[11px] text-gray-500 hover:text-white px-2"
              >
                Limpiar todos
              </button>
            </div>
          )}

          {/* Picker */}
          <button
            onClick={() => setShowCountries(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-dark-800 border border-white/10 hover:border-white/20 text-left transition-colors"
          >
            <span className="text-sm text-gray-300">
              {selectedCountries.length === 0
                ? 'Tocá para seleccionar países…'
                : `${selectedCountries.length} país(es) seleccionado(s)`}
            </span>
            <span className="text-gray-500 text-xs">{showCountries ? '▲' : '▼'}</span>
          </button>

          {showCountries && (
            <div className="mt-2 bg-dark-800 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 sticky top-0 bg-dark-800">
                <div className="relative">
                  <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar país…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-dark-900 border border-white/10 rounded-lg text-white outline-none focus:border-brand-500/50"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredCountries.map(c => {
                  const checked = selectedCountries.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      onClick={() => toggleCountry(c.code)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        checked ? 'bg-brand-500/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        checked ? 'bg-brand-500 border-brand-500' : 'border-white/20'
                      }`}>
                        {checked && <FiCheck size={10} className="text-white" />}
                      </div>
                      <span className="text-xl">{c.flag}</span>
                      <span className="text-sm text-white flex-1">{c.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono">{c.code}</span>
                    </button>
                  );
                })}
                {filteredCountries.length === 0 && (
                  <p className="text-center py-6 text-gray-500 text-sm">Sin resultados</p>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Step 4: razón opcional */}
        <Section title="4 · Razón (opcional)">
          <input
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, 200))}
            placeholder="Ej: contenido no disponible legalmente en estos países"
            className="input-field w-full text-sm"
          />
          <p className="text-[10px] text-gray-600 text-right mt-1">{reason.length}/200</p>
        </Section>

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={reset}
            disabled={saving}
            className="bg-dark-700 hover:bg-dark-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
          >
            Limpiar
          </button>
          <button
            onClick={apply}
            disabled={saving || !contentId.trim() || selectedCountries.length === 0}
            className="flex-1 bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-black py-2.5 rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
          >
            {saving ? 'Aplicando…' : `Bloquear en ${selectedCountries.length || 0} país(es)`}
          </button>
        </div>
      </div>

      {/* Lista de bloqueos activos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-sm">Bloqueos activos</h3>
          <span className="text-xs text-gray-500">{blocks.length} {blocks.length === 1 ? 'bloqueo' : 'bloqueos'}</span>
        </div>

        {blocks.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3 opacity-40">🌍</div>
            <p className="text-gray-500 text-sm">Aún no tenés bloqueos activos. Tu contenido está visible en todo el mundo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map(b => {
              const typeInfo = CONTENT_TYPES.find(t => t.id === b.content_type);
              const Icon = typeInfo?.icon || FiFileText;
              return (
                <div key={b.id} className="card p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300 shrink-0">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-white font-bold">{typeInfo?.label || b.content_type}</p>
                      <span className="font-mono text-[10px] text-gray-500 truncate">{b.content_id.slice(0, 8)}…</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {b.country_codes.map(code => {
                        const c = countryByCode(code);
                        return (
                          <span key={code} className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {c?.flag} {c?.code || code}
                          </span>
                        );
                      })}
                    </div>
                    {b.reason && <p className="text-xs text-gray-500 mt-2 italic">"{b.reason}"</p>}
                  </div>
                  <button
                    onClick={() => removeBlock(b)}
                    className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 shrink-0 transition-colors"
                    aria-label="Eliminar bloqueo"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function labelFor(type) {
  return CONTENT_TYPES.find(t => t.id === type)?.label?.toLowerCase() || type;
}
