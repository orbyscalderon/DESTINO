import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiTrash2, FiHeart, FiList } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import AgeGate, { isAgeVerified } from '../components/ui/AgeGate.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';

function fmtDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}:${s}` : `${m}:${s}`;
}

export default function Playlists() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [lists, setLists]         = useState([]);
  const [content, setContent]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [ageOk, setAgeOk]         = useState(isAgeVerified());

  useEffect(() => {
    if (!ageOk) return;
    if (id) loadOne();
    else loadAll();
  }, [id, ageOk]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/explore/playlists');
      setLists(data?.playlists || []);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.code === 'AGE_VERIFICATION_REQUIRED') setAgeOk(false);
      else toast.error('Error cargando listas');
    } finally { setLoading(false); }
  };

  const loadOne = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/explore/playlists/${id}`);
      setContent(data);
    } catch {
      toast.error('Lista no encontrada');
      navigate('/explore/playlists');
    } finally { setLoading(false); }
  };

  const createList = async () => {
    if (!newName.trim()) return;
    try {
      await api.post('/api/explore/playlists', { name: newName.trim() });
      setNewName(''); setCreating(false);
      toast.success('Lista creada');
      loadAll();
    } catch { toast.error('Error'); }
  };

  const deleteList = async (lid) => {
    const ok = await confirm({
      title: '¿Eliminar esta lista?',
      message: 'Los items se quitan de la lista pero no se borran del sitio.',
      confirmLabel: 'Eliminar lista',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/explore/playlists/${lid}`);
      toast.success('Lista eliminada');
      loadAll();
    } catch { toast.error('Error'); }
  };

  const removeItem = async (videoId) => {
    try {
      await api.delete(`/api/explore/playlists/${id}/items/${videoId}`);
      loadOne();
    } catch { toast.error('Error'); }
  };

  if (!ageOk) return <AgeGate onVerified={() => setAgeOk(true)} />;

  // Vista de una lista individual
  if (id) {
    if (loading) return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
    return (
      <div className="min-h-screen px-4 pt-6 pb-24 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/explore/playlists')} className="text-gray-400 hover:text-white">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-white truncate flex-1">{content?.playlist?.name}</h1>
          <span className="text-xs text-gray-500">{content?.items?.length || 0} videos</span>
        </div>

        {content?.items?.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            <FiList size={28} className="mx-auto mb-2 opacity-30" />
            Lista vacía. Agrega videos desde el reproductor.
          </div>
        )}

        <div className="space-y-2">
          {content?.items?.map(it => (
            <div key={it.video?.id} className="flex gap-3 items-center bg-dark-800 rounded-xl p-2 hover:bg-dark-700 transition-colors">
              <Link to={`/explore/v/${it.video?.id}`} className="flex gap-3 items-center flex-1 min-w-0">
                <div className="relative w-28 aspect-video bg-dark-900 rounded-lg overflow-hidden shrink-0">
                  <img src={it.video?.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 rounded">
                    {fmtDuration(it.video?.duration_seconds)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold line-clamp-2">{it.video?.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{it.video?.user?.full_name}</p>
                </div>
              </Link>
              <button onClick={() => removeItem(it.video?.id)}
                className="w-9 h-9 rounded-lg bg-dark-700 hover:bg-red-500/20 text-gray-500 hover:text-red-400 flex items-center justify-center shrink-0">
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Listado de listas
  return (
    <div className="min-h-screen px-4 pt-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/explore')} className="text-gray-400 hover:text-white">
          <FiArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-black gradient-text flex-1">Mis listas</h1>
        <button onClick={() => setCreating(c => !c)} className="text-brand-400 hover:text-brand-300">
          <FiPlus size={20} />
        </button>
      </div>

      {creating && (
        <div className="card p-4 mb-3 flex gap-2">
          <input
            className="input-field flex-1 text-sm"
            placeholder="Nombre de la lista"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && createList()}
          />
          <button onClick={createList} disabled={!newName.trim()}
            className="btn-primary text-sm disabled:opacity-50">Crear</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map(l => (
            <div key={l.id} className="card p-3 flex items-center gap-3">
              <Link to={`/explore/playlists/${l.id}`} className="flex-1 flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${l.is_favorites ? 'bg-red-500/20 text-red-400' : 'bg-dark-700 text-gray-400'}`}>
                  {l.is_favorites ? <FiHeart size={16} /> : <FiList size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{l.name}</p>
                  <p className="text-xs text-gray-500">{l.items_count} video{l.items_count !== 1 ? 's' : ''}</p>
                </div>
              </Link>
              {!l.is_favorites && (
                <button onClick={() => deleteList(l.id)}
                  className="w-9 h-9 rounded-lg bg-dark-700 hover:bg-red-500/20 text-gray-500 hover:text-red-400 flex items-center justify-center">
                  <FiTrash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
