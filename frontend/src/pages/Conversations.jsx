import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiPlus, FiUsers, FiX, FiCheck, FiMessageCircle } from 'react-icons/fi';
import api from '../lib/api.js';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import toast from 'react-hot-toast';

export default function Conversations() {
  const navigate = useNavigate();
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/conversations');
      setConvs(data.conversations || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-2xl mx-auto relative">
      <div className="absolute top-12 right-0 w-64 h-64 bg-accent-500/6 rounded-full blur-3xl pointer-events-none animate-float -z-10" />

      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/messages')} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors shrink-0">
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-2xl lg:text-3xl font-black gradient-text flex items-center gap-2 truncate">
            <FiUsers size={22} /> Grupos
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-gradient-to-br from-brand-500 to-accent-500 hover:shadow-glow-lg shadow-glow-sm rounded-xl w-10 h-10 flex items-center justify-center text-white transition-all duration-200 ease-out-expo active:scale-95 shrink-0"
          aria-label="Crear grupo"
        >
          <FiPlus size={18} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : convs.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-12 text-center">
          <div className="inline-block animate-float mb-4">
            <FiUsers size={40} className="text-gray-700" />
          </div>
          <h2 className="text-white font-bold mb-1">Sin grupos todavía</h2>
          <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
            Crea un grupo con tus matches para chatear varios al mismo tiempo.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-5 shadow-glow">
            <FiPlus size={14} /> Crear primer grupo
          </button>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {convs.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to={`/conversations/${c.id}`}
                className={`card p-3 flex items-center gap-3 transition-all duration-200 ease-out-expo hover:border-white/15 hover:-translate-y-0.5 ${
                  c.unread_count > 0 ? 'border-brand-500/30 shadow-glow-sm' : ''
                }`}
              >
                <div className="relative shrink-0">
                  {c.avatar_url ? (
                    <img loading="lazy" src={c.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/30 flex items-center justify-center text-lg">
                      👥
                    </div>
                  )}
                  {c.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-glow-sm">
                      {c.unread_count > 9 ? '9+' : c.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.member_count} miembros{c.last_message ? ` · ${(c.last_message.content || '🎟️ sticker').slice(0, 40)}` : ''}
                  </p>
                </div>
                <FiMessageCircle size={14} className="text-gray-600 shrink-0" />
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/api/matches').then(({ data }) => setMatches(data.matches || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = (uid) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid);
      else if (n.size < 7) n.add(uid);
      else toast.error('Max 7 miembros');
      return n;
    });
  };

  const create = async () => {
    if (!name.trim()) return toast.error('Pon un nombre al grupo');
    if (selected.size === 0) return toast.error('Selecciona al menos 1 match');
    setCreating(true);
    try {
      const { data } = await api.post('/api/conversations', {
        name: name.trim(),
        member_ids: [...selected],
      });
      toast.success('Grupo creado');
      onCreated(data.conversation);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setCreating(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 glass-strong flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: '100%', opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full sm:max-w-md glass-strong rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold">Nuevo grupo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors">
            <FiX size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del grupo (ej. Amigos cercanos)"
            maxLength={60}
            className="input-field mb-4"
          />

          <p className="text-xs text-gray-500 uppercase font-bold mb-2">Selecciona miembros ({selected.size}/7)</p>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : matches.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Necesitas matches para crear un grupo</p>
          ) : (
            <div className="space-y-1">
              {matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggle(m.other.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 ease-out-expo active:scale-[0.98] ${
                    selected.has(m.other.id)
                      ? 'bg-brand-500/15 border border-brand-500/30 shadow-glow-sm'
                      : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <img loading="lazy"
                    src={m.other.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.other.full_name || '?')}&size=80&background=1a1a2e&color=f43f5e`}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white text-sm font-medium truncate flex items-center gap-1">
                      {m.other.full_name}
                      {m.other.is_verified && <VerifiedBadge size={11} />}
                    </p>
                  </div>
                  {selected.has(m.other.id) && (
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                      <FiCheck size={13} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5 shrink-0">
          <button
            onClick={create}
            disabled={creating || !name.trim() || selected.size === 0}
            className="btn-primary w-full shadow-glow hover:shadow-glow-lg disabled:opacity-50"
          >
            {creating ? '…' : `Crear grupo (${selected.size + 1})`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
