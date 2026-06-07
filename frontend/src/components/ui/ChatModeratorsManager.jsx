import { useState, useEffect } from 'react';
import { FiShield, FiX, FiUserPlus, FiTrash2, FiUsers, FiSlash, FiClock } from 'react-icons/fi';
import api from '../../lib/api.js';
import toast from 'react-hot-toast';

// Panel para que el creator gestione sus mods de chat persistentes.
// Mods pueden banear/silenciar viewers en cualquier show del creator.

export default function ChatModeratorsManager({ creatorId }) {
  const [tab, setTab] = useState('mods'); // mods | bans | mutes
  const [mods, setMods] = useState([]);
  const [bans, setBans] = useState([]);
  const [mutes, setMutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([
        api.get('/api/shows/mods'),
        api.get(`/api/shows/chat/restrictions/${creatorId}`),
      ]);
      setMods(m.data.moderators || []);
      setBans(r.data.bans || []);
      setMutes(r.data.mutes || []);
    } catch {
      toast.error('Error cargando moderadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleAddMod = async () => {
    const u = username.trim().replace(/^@/, '');
    if (!u) return;
    setAdding(true);
    try {
      await api.post('/api/shows/mods', { username: u });
      toast.success(`@${u} es ahora moderador`);
      setUsername('');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error añadiendo');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMod = async (userId) => {
    if (!confirm('¿Quitar moderador?')) return;
    try {
      await api.delete(`/api/shows/mods/${userId}`);
      setMods(prev => prev.filter(m => m.user.id !== userId));
      toast.success('Moderador removido');
    } catch {
      toast.error('Error');
    }
  };

  const handleUnban = async (viewerId) => {
    try {
      await api.delete(`/api/shows/chat/ban/${creatorId}/${viewerId}`);
      setBans(prev => prev.filter(b => b.viewer.id !== viewerId));
      toast.success('Desbaneado');
    } catch {
      toast.error('Error');
    }
  };

  const tabs = [
    { k: 'mods',  l: 'Moderadores', icon: FiUsers,  count: mods.length },
    { k: 'bans',  l: 'Baneados',    icon: FiSlash,  count: bans.length },
    { k: 'mutes', l: 'Silenciados', icon: FiClock,  count: mutes.length },
  ];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FiShield size={16} className="text-brand-400" />
        <h3 className="text-sm font-bold text-white">Moderación de chat</h3>
      </div>
      <p className="text-xs text-gray-500">
        Los mods pueden banear/silenciar viewers en cualquier show tuyo.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
        {tabs.map(({ k, l, icon: Icon, count }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ease-out-expo active:scale-95 ${
              tab === k ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon size={11} /> {l}
            {count > 0 && (
              <span className={`text-[9px] px-1.5 rounded-full ${tab === k ? 'bg-white/20' : 'bg-white/10'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Mods */}
      {tab === 'mods' && (
        <>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              className="input-field py-2 text-sm flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddMod()}
            />
            <button
              onClick={handleAddMod}
              disabled={adding || !username.trim()}
              className="btn-primary px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <FiUserPlus size={13} /> Añadir
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 text-sm py-4">Cargando…</div>
          ) : mods.length === 0 ? (
            <p className="text-gray-600 text-xs text-center py-4">Sin moderadores</p>
          ) : (
            <div className="divide-y divide-white/5">
              {mods.map(m => (
                <div key={m.user.id} className="flex items-center gap-3 py-2">
                  <img
                    src={m.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.user.full_name}</p>
                    <p className="text-[10px] text-gray-500">@{m.user.username}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveMod(m.user.id)}
                    className="text-gray-500 hover:text-red-400"
                    aria-label="Quitar mod"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab Bans */}
      {tab === 'bans' && (
        loading ? <div className="text-center text-gray-500 text-sm py-4">Cargando…</div> :
        bans.length === 0 ? <p className="text-gray-600 text-xs text-center py-4">Sin baneados</p> : (
          <div className="divide-y divide-white/5">
            {bans.map(b => (
              <div key={b.id} className="flex items-center gap-3 py-2">
                <img
                  src={b.viewer.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.viewer.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{b.viewer.full_name}</p>
                  {b.reason && <p className="text-[10px] text-gray-500 truncate">{b.reason}</p>}
                </div>
                <button
                  onClick={() => handleUnban(b.viewer.id)}
                  className="text-xs bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-gray-300 px-2.5 py-1 rounded transition-all duration-200 ease-out-expo active:scale-95"
                >
                  Desbanear
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab Mutes */}
      {tab === 'mutes' && (
        loading ? <div className="text-center text-gray-500 text-sm py-4">Cargando…</div> :
        mutes.length === 0 ? <p className="text-gray-600 text-xs text-center py-4">Sin silenciados activos</p> : (
          <div className="divide-y divide-white/5">
            {mutes.map(m => {
              const minsLeft = Math.max(0, Math.round((new Date(m.expires_at) - Date.now()) / 60000));
              return (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <img
                    src={m.viewer.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.viewer.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.viewer.full_name}</p>
                    <p className="text-[10px] text-yellow-400">{minsLeft} min restantes</p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// Botones de moderación para usar en el chat de LiveShow.
// Solo se muestran si el currentUserId es creator o mod de ese show.
export function ChatModActions({ creatorId, viewerId, viewerName, onActionDone }) {
  const [busy, setBusy] = useState(false);

  const ban = async () => {
    if (!confirm(`¿Banear a ${viewerName} del chat?`)) return;
    setBusy(true);
    try {
      await api.post('/api/shows/chat/ban', { creator_id: creatorId, viewer_id: viewerId });
      toast.success('Baneado');
      onActionDone?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const mute = async (minutes) => {
    setBusy(true);
    try {
      await api.post('/api/shows/chat/mute', { creator_id: creatorId, viewer_id: viewerId, minutes });
      toast.success(`Silenciado ${minutes} min`);
      onActionDone?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-1">
      <button onClick={() => mute(5)} disabled={busy} className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded disabled:opacity-50">
        5m
      </button>
      <button onClick={() => mute(15)} disabled={busy} className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded disabled:opacity-50">
        15m
      </button>
      <button onClick={() => mute(60)} disabled={busy} className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded disabled:opacity-50">
        1h
      </button>
      <button onClick={ban} disabled={busy} className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded disabled:opacity-50">
        Ban
      </button>
    </div>
  );
}
