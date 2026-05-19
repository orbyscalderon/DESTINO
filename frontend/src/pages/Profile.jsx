import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCamera, FiEdit2, FiLogOut, FiStar, FiSettings, FiPlus, FiTrash2, FiSearch, FiShield, FiClock } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { COUNTRIES, LANGUAGES, countryByCode, languageByCode } from '../lib/geodata.js';
import { compressAvatar, compressImage } from '../lib/imageCompressor.js';

export default function Profile() {
  const { user, profile, fetchProfile, logout } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    age: profile?.age || '',
    bio: profile?.bio || '',
    gender: profile?.gender || '',
    country: profile?.country || '',
    language: profile?.language || 'es',
  });
  const [countrySearch, setCountrySearch] = useState('');
  const [verifying, setVerifying] = useState(false);
  const fileRef = useRef(null);
  const photoRef = useRef(null);

  useEffect(() => {
    if (user?.id) loadPhotos();
  }, [user?.id]);

  const loadPhotos = async () => {
    try {
      const { data } = await api.get(`/api/profiles/${user.id}/photos`);
      setPhotos(data.photos || []);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/profiles/${user.id}`, form);
      await fetchProfile(user.id);
      setEditing(false);
      toast.success('Perfil actualizado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressAvatar(file);
    const fd = new FormData();
    fd.append('avatar', compressed);
    try {
      await api.post('/api/profiles/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await fetchProfile(user.id);
      toast.success('Foto actualizada');
    } catch {
      toast.error('Error al subir foto');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploadingPhoto(true);
    const compressed = await compressImage(file);
    const fd = new FormData();
    fd.append('photo', compressed);
    try {
      await api.post('/api/profiles/photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadPhotos();
      toast.success('Foto añadida');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleVerifyIdentity = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post('/api/payments/identity/create-session');
      const stripeInstance = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
      const { error } = await stripeInstance.verifyIdentity(data.clientSecret);
      if (error) {
        toast.error('Verificación cancelada. Inténtalo de nuevo cuando quieras.');
        await fetchProfile(user.id);
      } else {
        toast.success('Verificación enviada. Revisaremos tu identidad pronto.');
        await fetchProfile(user.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar la verificación');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    try {
      await api.delete(`/api/profiles/photos/${photoId}`);
      setPhotos(p => p.filter(ph => ph.id !== photoId));
      toast.success('Foto eliminada');
    } catch {
      toast.error('Error al eliminar foto');
    }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-8 lg:px-10 lg:pt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Mi Perfil</h1>
        <div className="flex gap-2">
          <Link to="/settings" className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <FiSettings size={16} />
          </Link>
          <button onClick={logout} className="w-9 h-9 rounded-xl bg-dark-700 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors">
            <FiLogOut size={16} />
          </button>
        </div>
      </div>

      {/* Layout: columna en móvil, 2 columnas en desktop */}
      <div className="max-w-4xl mx-auto lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start">

        {/* Columna izquierda: avatar + badges */}
        <div className="lg:sticky lg:top-8">
          {/* Avatar */}
          <div className="relative w-28 h-28 lg:w-40 lg:h-40 mx-auto mb-4">
            <img
              src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || 'U')}&size=200&background=1a1a2e&color=f43f5e`}
              alt=""
              className="w-full h-full rounded-full object-cover border-2 border-brand-500/30"
            />
            <button
              onClick={() => fileRef.current.click()}
              className="absolute bottom-0 right-0 w-9 h-9 bg-brand-500 rounded-full flex items-center justify-center hover:bg-brand-600 transition-colors shadow-lg"
            >
              <FiCamera size={14} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </div>

          {/* Nombre */}
          <div className="text-center mb-4 lg:mb-6">
            <p className="text-lg font-bold text-white">{profile?.full_name || '—'}</p>
            <p className="text-gray-500 text-sm">@{profile?.username || '—'}</p>
          </div>

          {/* Badges */}
          <div className="flex justify-center flex-wrap gap-2 mb-6">
            {profile?.is_premium && (
              <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-full border border-yellow-500/30">
                ⚡ Premium
              </span>
            )}
            {profile?.is_verified && (
              <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-500/30">
                ✓ Verificado
              </span>
            )}
          </div>

          {/* CTA Premium */}
          {!profile?.is_premium && (
            <Link to="/premium" className="card p-4 flex items-center gap-3 hover:border-yellow-500/30 transition-colors">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                <FiStar className="text-yellow-400" />
              </div>
              <div>
                <p className="font-medium text-white text-sm">Hazte Premium</p>
                <p className="text-gray-500 text-xs">$20/mes · Cancela cuando quieras</p>
              </div>
            </Link>
          )}

          {/* Verificación de identidad — solo Premium */}
          {profile?.is_premium && !profile?.is_verified && (
            <div className="card p-4">
              {profile?.verification_status === 'pending' ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <FiClock className="text-blue-400" size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">Verificación en proceso</p>
                    <p className="text-gray-500 text-xs">Revisaremos tu identidad pronto</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleVerifyIdentity}
                  disabled={verifying}
                  className="w-full flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <FiShield className="text-blue-400" size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-white text-sm">
                      {verifying ? 'Iniciando verificación…' : 'Verificar identidad'}
                    </p>
                    <p className="text-gray-500 text-xs">Obtén la insignia azul ✓</p>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: info + galería */}
        <div className="mt-6 lg:mt-0 space-y-4">
          {/* Info / Edición */}
          <div className="card p-5 lg:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-300">Información</h3>
              <button
                onClick={() => setEditing(v => !v)}
                className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1"
              >
                <FiEdit2 size={12} /> {editing ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            <div className="space-y-4">
              {editing ? (
                <>
                  <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                    <input
                      className="input-field"
                      placeholder="Nombre"
                      value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    />
                    <input
                      className="input-field"
                      type="number"
                      placeholder="Edad"
                      value={form.age}
                      onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['male', 'female', 'other'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, gender: g }))}
                        className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                          form.gender === g ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                        }`}
                      >
                        {g === 'male' ? 'Hombre' : g === 'female' ? 'Mujer' : 'Otro'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input-field resize-none"
                    rows={4}
                    placeholder="Bio — cuéntale algo a los demás"
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    maxLength={500}
                  />

                  {/* País */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">País</p>
                    <div className="relative mb-1.5">
                      <FiSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        className="input-field pl-8 py-2 text-sm"
                        placeholder="Buscar país..."
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                      />
                    </div>
                    {countrySearch && (
                      <div className="max-h-36 overflow-y-auto rounded-xl border border-white/5 bg-dark-800 divide-y divide-white/5 mb-1.5">
                        {COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => { setForm(f => ({ ...f, country: c.code, language: c.lang })); setCountrySearch(''); }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-300 hover:bg-dark-700"
                          >
                            <span>{c.flag}</span><span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.country && (
                      <p className="text-xs text-brand-400">
                        {countryByCode(form.country)?.flag} {countryByCode(form.country)?.name}
                      </p>
                    )}
                  </div>

                  {/* Idioma */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Idioma principal</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {LANGUAGES.map(l => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, language: l.code }))}
                          className={`py-2 rounded-xl text-xs font-medium transition-all ${
                            form.language === l.code ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSave} disabled={saving} className="btn-primary w-full lg:w-auto lg:px-8">
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </>
              ) : (
                <div className="grid lg:grid-cols-2 gap-4">
                  {[
                    { label: 'Nombre', value: profile?.full_name },
                    { label: 'Username', value: profile?.username ? `@${profile.username}` : null },
                    { label: 'Edad', value: profile?.age },
                    { label: 'Género', value: profile?.gender === 'male' ? 'Hombre' : profile?.gender === 'female' ? 'Mujer' : profile?.gender === 'other' ? 'Otro' : null },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-dark-700/50 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <p className="text-white font-medium">{value || '—'}</p>
                    </div>
                  ))}
                  {profile?.country && (
                    <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 mb-0.5">País</p>
                      <p className="text-white font-medium">
                        {countryByCode(profile.country)?.flag} {countryByCode(profile.country)?.name}
                      </p>
                    </div>
                  )}
                  {profile?.language && (
                    <div className="bg-dark-700/50 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 mb-0.5">Idioma</p>
                      <p className="text-white font-medium">{languageByCode(profile.language)?.name || profile.language}</p>
                    </div>
                  )}
                  {profile?.bio && (
                    <div className="lg:col-span-2 bg-dark-700/50 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 mb-1">Bio</p>
                      <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Galería de fotos */}
          <div className="card p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-300">Fotos del perfil</h3>
                <p className="text-xs text-gray-600 mt-0.5">Las ven las personas en sus matches</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${photos.length >= 20 ? 'bg-brand-500/20 text-brand-400' : 'bg-dark-700 text-gray-500'}`}>
                {photos.length} / 20
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {photos.map(photo => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group aspect-square"
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-500/80"
                  >
                    <FiTrash2 size={11} className="text-white" />
                  </button>
                </motion.div>
              ))}

              {photos.length < 20 && (
                <button
                  onClick={() => photoRef.current.click()}
                  disabled={uploadingPhoto}
                  className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1.5 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
                >
                  {uploadingPhoto ? (
                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FiPlus className="text-gray-500" size={22} />
                      <span className="text-gray-600 text-[10px]">Agregar</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
