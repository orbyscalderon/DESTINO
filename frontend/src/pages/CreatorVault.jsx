import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiUpload, FiTrash2, FiImage, FiVideo, FiMusic, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const TYPE_ICONS = { photo: FiImage, video: FiVideo, audio: FiMusic, text: FiFileText, gif: FiImage };

export default function CreatorVault() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const load = async () => {
    try {
      const r = await api.get('/api/creator-monetization/vault' + (filter !== 'all' ? `?type=${filter}` : ''));
      setItems(r.data?.items || []);
    } catch {}
  };
  useEffect(() => { load(); }, [filter]);

  const upload = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setUploading(true);
    try {
      await api.post('/api/creator-monetization/vault', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Subido al vault');
      setShowUpload(false);
      load();
    } catch (err) {
      toast.error('Error subiendo');
    } finally {
      setUploading(false);
    }
  };

  const del = async (id) => {
    if (!confirm('¿Eliminar este item del vault?')) return;
    await api.delete(`/api/creator-monetization/vault/${id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none animate-float" />

      <div className="max-w-5xl mx-auto relative z-10">
        <Link to="/creator/monetization" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-black gradient-text mb-1">Content Vault</h1>
            <p className="text-gray-500 text-sm">Tu biblioteca privada — sube una vez, reutiliza en mensajes, collections, posts</p>
          </div>
          <button onClick={() => setShowUpload(s => !s)} className="px-4 py-2 rounded-xl bg-brand-500 text-white font-bold text-sm flex items-center gap-2 shrink-0">
            <FiUpload size={14} /> Subir
          </button>
        </div>

        {showUpload && (
          <form onSubmit={upload} className="glass-strong rounded-2xl p-5 border border-white/5 mb-6 space-y-3">
            <input name="file" type="file" required accept="image/*,video/*,audio/*"
              className="w-full text-sm text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:bg-brand-500/20 file:border-0 file:text-brand-300" />
            <div className="grid grid-cols-2 gap-3">
              <select name="type" required defaultValue="photo"
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm">
                <option value="photo">Foto</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="gif">GIF</option>
              </select>
              <input name="title" placeholder="Título (opcional)"
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            </div>
            <input name="tags" placeholder="tags separados por coma (lingerie, beach, solo...)"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm" />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" name="is_adult" value="true" className="accent-brand-500" /> Es contenido adult
            </label>
            <button type="submit" disabled={uploading}
              className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold text-sm disabled:opacity-50">
              {uploading ? 'Subiendo…' : 'Guardar en vault'}
            </button>
          </form>
        )}

        <div className="flex gap-2 mb-6">
          {['all', 'photo', 'video', 'audio', 'gif'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${filter === t ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {t === 'all' ? 'Todos' : t}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Tu vault está vacío.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(i => {
              const Icon = TYPE_ICONS[i.type] || FiImage;
              return (
                <div key={i.id} className="glass-strong rounded-2xl border border-white/5 overflow-hidden">
                  <div className="aspect-square bg-dark-800 relative">
                    {i.type === 'photo' || i.type === 'gif' ? (
                      <img src={i.url} alt="" className="w-full h-full object-cover" />
                    ) : i.type === 'video' ? (
                      <video src={i.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon size={36} className="text-gray-600" />
                      </div>
                    )}
                    {i.is_adult && (
                      <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 backdrop-blur">18+</span>
                    )}
                    <button onClick={() => del(i.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 backdrop-blur text-white/70 hover:text-rose-400 hover:bg-black/70">
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-white font-medium truncate">{i.title || '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Usado {i.use_count}x</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
