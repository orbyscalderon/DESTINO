import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUpload, FiTrash2, FiImage, FiVideo, FiMusic, FiFileText, FiArchive } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { EmptyVault } from '../components/ui/illustrations/index.js';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';

const TYPE_ICONS = { photo: FiImage, video: FiVideo, audio: FiMusic, text: FiFileText, gif: FiImage };
const FILTERS = [
  { value: 'all',   label: 'Todos'  },
  { value: 'photo', label: 'Fotos'  },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio'  },
  { value: 'gif',   label: 'GIFs'   },
];

export default function CreatorVault() {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/creator-monetization/vault' + (filter !== 'all' ? `?type=${filter}` : ''));
      setItems(r.data?.items || []);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);

  const upload = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setUploading(true);
    try {
      await api.post('/api/creator-monetization/vault', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Subido al vault ✨');
      setShowUpload(false);
      load();
    } catch {
      toast.error('Error subiendo');
    } finally {
      setUploading(false);
    }
  };

  const del = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar este item del vault?',
      message: 'Esta acción es permanente. Si estás usándolo en alguna collection o DM, también deja de funcionar.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/creator-monetization/vault/${id}`);
      setItems(items.filter(i => i.id !== id));
      toast.success('Eliminado del vault');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const uploadButton = (
    <button onClick={() => setShowUpload(s => !s)} className="btn-primary text-sm py-2 px-4">
      <FiUpload size={14} /> Subir
    </button>
  );

  return (
    <PageShell
      icon={FiArchive}
      title="Content Vault"
      subtitle="Tu biblioteca privada — subí una vez, reutilizá en mensajes, collections, posts."
      backTo="/creator/monetization"
      maxWidth="5xl"
      actions={uploadButton}
    >
      <AnimatePresence>
        {showUpload && (
          <motion.form
            onSubmit={upload}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
            className="overflow-hidden"
          >
            <div className="card-form space-y-3">
              <input
                name="file" type="file" required accept="image/*,video/*,audio/*"
                className="w-full text-sm text-gray-300
                           file:mr-3 file:px-4 file:py-2 file:rounded-lg
                           file:bg-brand-500/20 file:border-0 file:text-brand-300 file:font-bold file:cursor-pointer
                           file:hover:bg-brand-500/30 file:transition-colors"
              />
              <div className="grid grid-cols-2 gap-3">
                <select name="type" required defaultValue="photo" className="select-sm">
                  <option value="photo" className="bg-dark-800">Foto</option>
                  <option value="video" className="bg-dark-800">Video</option>
                  <option value="audio" className="bg-dark-800">Audio</option>
                  <option value="gif"   className="bg-dark-800">GIF</option>
                </select>
                <input name="title" placeholder="Título (opcional)" className="input-sm" />
              </div>
              <input name="tags" placeholder="tags separados por coma (lingerie, beach, solo…)" className="input-sm" />
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" name="is_adult" value="true" className="accent-brand-500 w-4 h-4" />
                Es contenido adult
              </label>
              <button type="submit" disabled={uploading} className="btn-primary w-full">
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    Subiendo…
                  </>
                ) : 'Guardar en vault'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {FILTERS.map(t => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`chip whitespace-nowrap transition-all duration-200 ease-out-expo ${filter === t.value ? 'chip-active scale-105' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card p-0 overflow-hidden">
              <div className="skeleton aspect-square w-full" />
              <div className="p-3 space-y-2">
                <div className="skeleton-line w-2/3" />
                <div className="skeleton-line w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          illustration={<EmptyVault size={140} />}
          title="Tu vault está vacío"
          desc="Subí tu primer ítem para empezar a reutilizar contenido en cualquier collection o mensaje."
        />
      ) : (
        <motion.div
          layout
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          <AnimatePresence>
            {items.map(i => {
              const Icon = TYPE_ICONS[i.type] || FiImage;
              return (
                <motion.div
                  key={i.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="card-interactive p-0 overflow-hidden group"
                >
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
                    {i.is_adult && <span className="absolute top-2 left-2 pill-brand">18+</span>}
                    <button
                      onClick={() => del(i.id)}
                      aria-label="Eliminar"
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur text-white/70
                                 hover:text-rose-400 hover:bg-black/80
                                 transition-all duration-200 ease-out-expo
                                 opacity-0 group-hover:opacity-100"
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-white font-medium truncate">{i.title || '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Usado {i.use_count}×</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </PageShell>
  );
}
