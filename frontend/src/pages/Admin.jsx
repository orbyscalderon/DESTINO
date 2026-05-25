import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiUsers, FiHeart, FiMessageCircle, FiDollarSign, FiShield, FiStar,
  FiTrash2, FiVideo, FiZap, FiSearch, FiExternalLink, FiRadio, FiGrid,
  FiCheck, FiX, FiCreditCard, FiImage, FiBell, FiPlus, FiMinus,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { SHOW_CATEGORIES } from './LiveShows.jsx';

const TABS = [
  { key: 'overview',       label: 'Resumen',    icon: FiGrid },
  { key: 'users',          label: 'Usuarios',   icon: FiUsers },
  { key: 'creators',       label: 'Creadores',  icon: FiVideo },
  { key: 'shows',          label: 'Shows',      icon: FiRadio },
  { key: 'content',        label: 'Contenido',  icon: FiImage },
  { key: 'withdrawals',    label: 'Retiros',    icon: FiCreditCard },
  { key: 'verifications',  label: 'ID',         icon: FiShield },
  { key: 'appeals',        label: 'Apelaciones', icon: FiMessageCircle },
];

function Badge({ on, onLabel, offLabel, color = 'yellow' }) {
  const colors = {
    yellow: on ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-gray-600',
    blue:   on ? 'bg-blue-500/20 text-blue-400'     : 'bg-white/5 text-gray-600',
    green:  on ? 'bg-green-500/20 text-green-400'   : 'bg-white/5 text-gray-600',
    red:    on ? 'bg-red-500/20 text-red-400'       : 'bg-white/5 text-gray-600',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors[color]}`}>
      {on ? onLabel : offLabel}
    </span>
  );
}

const USERS_PAGE_SIZE = 20;

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [creators, setCreators] = useState([]);
  const [shows, setShows] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [contentQueue, setContentQueue] = useState([]);
  const [processingContent, setProcessingContent] = useState(null);
  const [appeals, setAppeals] = useState([]);
  const [reviewingAppeal, setReviewingAppeal] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [usersPage, setUsersPage] = useState(0);
  const [coinsEditing, setCoinsEditing] = useState(null);
  const [coinsDelta, setCoinsDelta] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [sRes, uRes, cRes, shRes, wRes, vRes, cqRes, appRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/users'),
        api.get('/api/admin/creators'),
        api.get('/api/admin/shows'),
        api.get('/api/admin/withdrawals').catch(() => ({ data: [] })),
        api.get('/api/admin/verifications').catch(() => ({ data: [] })),
        api.get('/api/admin/content-queue').catch(() => ({ data: { posts: [] } })),
        api.get('/api/appeals/admin').catch(() => ({ data: { appeals: [] } })),
      ]);
      setStats(sRes.data.stats);
      setUsers(uRes.data.users);
      setCreators(cRes.data.creators);
      setShows(shRes.data.shows);
      setWithdrawalRequests(wRes.data?.withdrawals || []);
      setVerificationRequests(vRes.data?.verifications || []);
      setContentQueue(cqRes.data?.posts || []);
      setAppeals(appRes.data?.appeals || []);
    } catch (err) {
      if (err.response?.status === 403) navigate('/home', { replace: true });
      else toast.error('Error cargando datos admin');
    } finally {
      setLoading(false);
    }
  };

  const patch = async (endpoint, body, optimistic) => {
    try {
      await api.patch(endpoint, body);
      optimistic();
      toast.success('Actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    }
  };

  const TIER_CYCLE = { basic: 'premium', premium: 'vip', vip: 'basic' };
  const cycleTier = (u) => {
    const next = TIER_CYCLE[u.premium_tier || 'basic'];
    patch('/api/admin/users/tier', { userId: u.id, tier: next },
      () => setUsers(prev => prev.map(x => x.id === u.id
        ? { ...x, premium_tier: next, is_premium: next !== 'basic' } : x)));
  };

  const adjustCoins = async (u) => {
    const delta = parseInt(coinsDelta);
    if (!delta || isNaN(delta)) return;
    try {
      const res = await api.patch('/api/admin/users/coins', { userId: u.id, delta });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, coins_balance: res.data.new_balance } : x));
      setCoinsEditing(null);
      setCoinsDelta('');
      toast.success(`Coins ajustados → ${res.data.new_balance}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ajustar coins');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    setSendingBroadcast(true);
    try {
      const res = await api.post('/api/admin/notifications/broadcast', { title: broadcastTitle, body: broadcastBody });
      toast.success(`Enviado a ${res.data.sent} / ${res.data.total} usuarios`);
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar notificación');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleEndShow = async (id) => {
    if (!confirm('¿Terminar este show ahora?')) return;
    try {
      await api.patch(`/api/admin/shows/${id}/end`);
      setShows(prev => prev.map(s => s.id === id ? { ...s, status: 'ended' } : s));
      toast.success('Show terminado');
    } catch { toast.error('Error al terminar show'); }
  };

  const toggleVerified = (u) => patch('/api/admin/users/verified', { userId: u.id, isVerified: !u.is_verified },
    () => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_verified: !u.is_verified } : x)));

  const toggleCreator = (u) => patch('/api/admin/users/creator', { userId: u.id, isCreator: !u.is_creator },
    () => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_creator: !u.is_creator } : x)));

  const toggleAdult = (u) => patch('/api/admin/users/adult', { userId: u.id, isAdult: !u.is_adult_creator },
    () => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_adult_creator: !u.is_adult_creator } : x)));

  const removeUser = async (u) => {
    if (!confirm(`¿Eliminar a "${u.full_name || u.username}"? Irreversible.`)) return;
    try {
      await api.delete(`/api/admin/users/${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast.success('Usuario eliminado');
    } catch { toast.error('Error eliminando usuario'); }
  };

  const processWithdrawal = async (id, status) => {
    try {
      await api.patch(`/api/admin/withdrawals/${id}`, { status });
      setWithdrawalRequests(prev => prev.map(w => w.id === id ? { ...w, status } : w));
      toast.success(status === 'approved' ? 'Retiro aprobado' : 'Retiro rechazado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const processVerification = async (id, status) => {
    try {
      await api.patch(`/api/admin/verifications/${id}`, { status });
      setVerificationRequests(prev => prev.map(v => v.id === id ? { ...v, status } : v));
      toast.success(status === 'approved' ? 'Verificación aprobada' : 'Verificación rechazada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
  });
  const totalUserPages = Math.ceil(filteredUsers.length / USERS_PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(usersPage * USERS_PAGE_SIZE, (usersPage + 1) * USERS_PAGE_SIZE);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center">
          <FiShield size={18} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Admin Panel</h1>
          <p className="text-gray-600 text-xs">Solo visible para super admins</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-2xl mb-6 border border-white/5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === key ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {tab === 'overview' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: FiUsers,       label: 'Usuarios',   value: stats.users,    color: 'text-blue-400' },
              { icon: FiHeart,       label: 'Matches',    value: stats.matches,  color: 'text-brand-400' },
              { icon: FiMessageCircle,label:'Mensajes',   value: stats.messages, color: 'text-green-400' },
              { icon: FiStar,        label: 'Premium',    value: stats.premium,  color: 'text-brand-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card p-4">
                <Icon size={18} className={`${color} mb-2`} />
                <div className="text-2xl font-black text-white">{(value || 0).toLocaleString()}</div>
                <div className="text-gray-500 text-xs">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: FiVideo,      label: 'Creadores',  value: stats.creators,                                   color: 'text-purple-400' },
              { icon: FiRadio,      label: 'Shows',      value: stats.shows,                                      color: 'text-orange-400' },
              { icon: FiDollarSign, label: 'Ganancias',  value: `$${(stats.total_earnings || 0).toFixed(2)}`,     color: 'text-green-400' },
              { icon: FiZap,        label: 'Coins total',value: (stats.coins_total || 0).toLocaleString(),        color: 'text-yellow-400' },
              { icon: FiStar,       label: 'VIP',        value: stats.vip,                                        color: 'text-yellow-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card p-4">
                <Icon size={18} className={`${color} mb-2`} />
                <div className="text-2xl font-black text-white">{value ?? 0}</div>
                <div className="text-gray-500 text-xs">{label}</div>
              </div>
            ))}
          </div>

          {/* Broadcast push notification */}
          <div className="card p-4 border-brand-500/20">
            <div className="flex items-center gap-2 mb-3">
              <FiBell size={15} className="text-brand-400" />
              <h3 className="text-sm font-bold text-white">Notificación push masiva</h3>
            </div>
            <input
              value={broadcastTitle}
              onChange={e => setBroadcastTitle(e.target.value)}
              placeholder="Título..."
              className="input-field py-2 text-sm w-full mb-2"
            />
            <textarea
              value={broadcastBody}
              onChange={e => setBroadcastBody(e.target.value)}
              placeholder="Mensaje..."
              rows={2}
              className="input-field py-2 text-sm w-full resize-none mb-2"
            />
            <button
              onClick={handleBroadcast}
              disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()}
              className="w-full btn-primary py-2 text-sm font-bold disabled:opacity-40"
            >
              {sendingBroadcast ? 'Enviando...' : 'Enviar a todos los usuarios'}
            </button>
          </div>

          {/* Últimos usuarios */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Últimos registros</h3>
            <div className="space-y-1.5">
              {users.slice(0, 8).map(u => (
                <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-800">
                  <img
                    src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{u.full_name || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500">@{u.username || '—'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {u.is_premium  && <Badge on label="PRO" color="yellow" />}
                    {u.is_verified && <Badge on label="VER" color="blue" />}
                    {u.is_creator  && <Badge on label="CRE" color="green" />}
                  </div>
                  <span className="text-[10px] text-gray-600">{new Date(u.created_at).toLocaleDateString('es')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── USUARIOS ── */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="relative">
            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input-field pl-9 py-2 text-sm w-full"
              placeholder="Buscar por nombre o username..."
              value={search}
              onChange={e => { setSearch(e.target.value); setUsersPage(0); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">{filteredUsers.length} usuario{filteredUsers.length !== 1 ? 's' : ''}</p>
            {selectedUsers.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-brand-400 font-semibold">{selectedUsers.size} seleccionados</span>
                <button
                  disabled={bulkLoading}
                  onClick={async () => {
                    setBulkLoading(true);
                    await Promise.all([...selectedUsers].map(id => api.patch('/api/admin/users/tier', { userId: id, tier: 'premium' }).catch(() => {})));
                    setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_premium: true, premium_tier: 'premium' } : u));
                    setSelectedUsers(new Set());
                    setBulkLoading(false);
                    toast.success('Premium aplicado');
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 font-medium transition-colors disabled:opacity-50"
                >
                  ⚡ Premium
                </button>
                <button
                  disabled={bulkLoading}
                  onClick={async () => {
                    setBulkLoading(true);
                    await Promise.all([...selectedUsers].map(id => api.patch('/api/admin/users/tier', { userId: id, tier: 'vip' }).catch(() => {})));
                    setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_premium: true, premium_tier: 'vip' } : u));
                    setSelectedUsers(new Set());
                    setBulkLoading(false);
                    toast.success('VIP aplicado');
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 font-medium transition-colors disabled:opacity-50"
                >
                  👑 VIP
                </button>
                <button
                  disabled={bulkLoading}
                  onClick={async () => {
                    setBulkLoading(true);
                    await Promise.all([...selectedUsers].map(id => api.patch('/api/admin/users/verified', { userId: id, isVerified: true }).catch(() => {})));
                    setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_verified: true } : u));
                    setSelectedUsers(new Set());
                    setBulkLoading(false);
                    toast.success('Verificación aplicada');
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 font-medium transition-colors disabled:opacity-50"
                >
                  ✓ Verificar
                </button>
                <button onClick={() => setSelectedUsers(new Set())} className="text-xs text-gray-500 hover:text-white">✕</button>
              </div>
            )}
          </div>

          <div className="space-y-2" key={usersPage}>
            {pagedUsers.map(u => (
              <div key={u.id} className="card p-3">
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => setSelectedUsers(prev => {
                      const next = new Set(prev);
                      next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                      return next;
                    })}
                    className="w-4 h-4 rounded accent-brand-500 shrink-0"
                  />
                  <img
                    src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.full_name || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500">@{u.username || '—'} · {u.coins_balance || 0} coins</p>
                  </div>
                  <Link to={`/profile/${u.id}`} className="text-gray-500 hover:text-brand-400 transition-colors">
                    <FiExternalLink size={14} />
                  </Link>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => cycleTier(u)}
                    title="Click para cambiar tier: Básico → Premium → VIP → Básico"
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      u.premium_tier === 'vip'     ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' :
                      u.premium_tier === 'premium' ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30' :
                                                     'bg-dark-700 text-gray-500 hover:text-yellow-400'
                    }`}
                  >
                    {u.premium_tier === 'vip' ? '👑 VIP ✓' : u.premium_tier === 'premium' ? '⚡ Premium ✓' : <><FiStar size={11} /> Tier</>}
                  </button>
                  <button
                    onClick={() => toggleVerified(u)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      u.is_verified ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-dark-700 text-gray-500 hover:text-blue-400'
                    }`}
                  >
                    <FiShield size={11} /> {u.is_verified ? 'Verificado ✓' : 'Verificar'}
                  </button>
                  <button
                    onClick={() => toggleCreator(u)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      u.is_creator ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : 'bg-dark-700 text-gray-500 hover:text-purple-400'
                    }`}
                  >
                    <FiVideo size={11} /> {u.is_creator ? 'Creador ✓' : 'Creador'}
                  </button>
                  <button
                    onClick={() => toggleAdult(u)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      u.is_adult_creator ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-dark-700 text-gray-500 hover:text-red-400'
                    }`}
                  >
                    🔞 {u.is_adult_creator ? 'Adulto ✓' : 'Adulto'}
                  </button>
                  <button
                    onClick={() => { setCoinsEditing(coinsEditing === u.id ? null : u.id); setCoinsDelta(''); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-dark-700 text-gray-500 hover:text-yellow-400 transition-colors"
                  >
                    <FiZap size={11} /> Coins
                  </button>
                  <button
                    onClick={() => removeUser(u)}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-dark-700 text-gray-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  >
                    <FiTrash2 size={11} /> Eliminar
                  </button>
                </div>

                {coinsEditing === u.id && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                    <span className="text-xs text-gray-500">Balance: <span className="text-yellow-400 font-bold">{u.coins_balance || 0}</span></span>
                    <button onClick={() => setCoinsDelta(d => String((parseInt(d)||0) - 10))} className="w-6 h-6 rounded-lg bg-dark-700 text-gray-400 hover:text-red-400 flex items-center justify-center text-xs transition-colors"><FiMinus size={10}/></button>
                    <input
                      type="number"
                      value={coinsDelta}
                      onChange={e => setCoinsDelta(e.target.value)}
                      placeholder="±coins"
                      className="w-20 bg-dark-700 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-brand-500"
                    />
                    <button onClick={() => setCoinsDelta(d => String((parseInt(d)||0) + 10))} className="w-6 h-6 rounded-lg bg-dark-700 text-gray-400 hover:text-green-400 flex items-center justify-center text-xs transition-colors"><FiPlus size={10}/></button>
                    <button onClick={() => adjustCoins(u)} disabled={!coinsDelta} className="flex-1 py-1 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 text-xs font-semibold transition-colors disabled:opacity-40">
                      Aplicar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalUserPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                disabled={usersPage === 0}
                onClick={() => setUsersPage(p => p - 1)}
                className="px-4 py-2 rounded-xl bg-dark-700 text-sm text-gray-400 disabled:opacity-30 hover:bg-dark-600 transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-xs text-gray-500">
                {usersPage + 1} / {totalUserPages}
              </span>
              <button
                disabled={usersPage >= totalUserPages - 1}
                onClick={() => setUsersPage(p => p + 1)}
                className="px-4 py-2 rounded-xl bg-dark-700 text-sm text-gray-400 disabled:opacity-30 hover:bg-dark-600 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CREADORES ── */}
      {tab === 'creators' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-3">{creators.length} creador{creators.length !== 1 ? 'es' : ''}</p>
          {creators.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <FiVideo size={36} className="mx-auto mb-3" />
              <p>Sin creadores aún</p>
            </div>
          )}
          {creators.map(c => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{c.full_name}</p>
                    {c.is_verified && <span className="text-blue-400 text-xs">✓</span>}
                    {c.is_adult_creator && <span className="text-xs">🔞</span>}
                  </div>
                  <p className="text-xs text-gray-500">@{c.username}</p>
                </div>
                <Link
                  to={`/profile/${c.id}`}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                >
                  Ver perfil <FiExternalLink size={11} />
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-dark-700 rounded-xl p-2">
                  <p className="text-white font-bold text-sm">${c.total_earned.toFixed(2)}</p>
                  <p className="text-gray-600 text-[10px]">Ganado total</p>
                </div>
                <div className="bg-dark-700 rounded-xl p-2">
                  <p className="text-white font-bold text-sm">${c.available_balance.toFixed(2)}</p>
                  <p className="text-gray-600 text-[10px]">Disponible</p>
                </div>
                <div className="bg-dark-700 rounded-xl p-2">
                  <p className="text-white font-bold text-sm">
                    {c.creator_subscription_price ? `$${c.creator_subscription_price}` : '—'}
                  </p>
                  <p className="text-gray-600 text-[10px]">Suscripción</p>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  c.stripe_account_status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-dark-700 text-gray-500'
                }`}>
                  Stripe: {c.stripe_account_status || 'no configurado'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SHOWS ── */}
      {tab === 'shows' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-3">{shows.length} show{shows.length !== 1 ? 's' : ''}</p>
          {shows.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <FiRadio size={36} className="mx-auto mb-3" />
              <p>Sin shows aún</p>
            </div>
          )}
          {shows.map(s => {
            const cat = SHOW_CATEGORIES.find(c => c.key === s.category);
            return (
              <div key={s.id} className="card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                    {cat && <span className="text-xs">{cat.emoji}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.host?.full_name} · {s.show_type} · {s.ticket_price > 0 ? `$${s.ticket_price}` : 'Gratis'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    s.status === 'live'      ? 'bg-red-500/20 text-red-400' :
                    s.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                                               'bg-dark-700 text-gray-500'
                  }`}>
                    {s.status === 'live' ? '● EN VIVO' : s.status === 'scheduled' ? 'Programado' : 'Terminado'}
                  </span>
                  <div className="flex items-center gap-2">
                    {s.status === 'live' && (
                      <button
                        onClick={() => handleEndShow(s.id)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold transition-colors"
                      >
                        Terminar
                      </button>
                    )}
                    <Link to={`/shows/${s.id}`} className="text-gray-600 hover:text-brand-400">
                      <FiExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── COLA DE CONTENIDO ADULTO ── */}
      {tab === 'content' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 mb-3">{contentQueue.length} post{contentQueue.length !== 1 ? 's' : ''} pendiente{contentQueue.length !== 1 ? 's' : ''} de revisión</p>
          {contentQueue.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <FiCheck size={36} className="mx-auto mb-3 text-green-500" />
              <p>Sin contenido pendiente de moderación</p>
            </div>
          ) : (
            contentQueue.map(post => (
              <div key={post.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src={post.author?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author?.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{post.author?.full_name}</p>
                    <p className="text-gray-500 text-xs">{new Date(post.created_at).toLocaleString('es')}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {post.is_adult && <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">18+</span>}
                    {post.is_subscribers_only && <span className="bg-purple-500/20 text-purple-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">Subs</span>}
                  </div>
                </div>
                {post.media_url && (
                  <div className="rounded-xl overflow-hidden bg-dark-700 max-h-48">
                    {post.media_type === 'video'
                      ? <video src={post.media_url} controls className="w-full max-h-48 object-contain" />
                      : <img src={post.media_url} alt="" className="w-full max-h-48 object-contain" loading="lazy" />
                    }
                  </div>
                )}
                {post.caption && <p className="text-gray-300 text-sm">{post.caption}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setProcessingContent(post.id);
                      try {
                        await api.patch(`/api/admin/content/${post.id}`, { status: 'published' });
                        setContentQueue(prev => prev.filter(p => p.id !== post.id));
                        toast.success('Post aprobado');
                      } catch { toast.error('Error'); }
                      finally { setProcessingContent(null); }
                    }}
                    disabled={processingContent === post.id}
                    className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FiCheck size={14} /> Aprobar
                  </button>
                  <button
                    onClick={async () => {
                      const notes = prompt('Motivo del rechazo (opcional):');
                      setProcessingContent(post.id);
                      try {
                        await api.patch(`/api/admin/content/${post.id}`, { status: 'rejected', notes: notes || null });
                        setContentQueue(prev => prev.filter(p => p.id !== post.id));
                        toast.success('Post rechazado');
                      } catch { toast.error('Error'); }
                      finally { setProcessingContent(null); }
                    }}
                    disabled={processingContent === post.id}
                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FiX size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── RETIROS ── */}
      {tab === 'withdrawals' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-3">{withdrawalRequests.length} solicitud{withdrawalRequests.length !== 1 ? 'es' : ''}</p>
          {withdrawalRequests.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <FiCreditCard size={36} className="mx-auto mb-3" />
              <p>Sin solicitudes de retiro</p>
            </div>
          )}
          {withdrawalRequests.map(w => (
            <div key={w.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={w.creator?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(w.creator?.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{w.creator?.full_name || 'Creador'}</p>
                    <p className="text-xs text-gray-500">@{w.creator?.username}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold shrink-0 ${
                  w.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                  w.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {w.status === 'approved' ? 'Aprobado' : w.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                </span>
              </div>
              <div className="bg-dark-700 rounded-xl p-3 mb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Monto</span>
                  <span className="text-white font-bold">${parseFloat(w.amount_usd).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Método</span>
                  <span className="text-gray-300 text-xs capitalize">{w.payout_method?.replace('_', ' ')}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-gray-500 text-xs shrink-0">Cuenta</span>
                  <span className="text-gray-300 text-xs text-right break-all">{w.payout_details}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Fecha</span>
                  <span className="text-gray-500 text-xs">{new Date(w.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
              {w.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => processWithdrawal(w.id, 'approved')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors"
                  >
                    <FiCheck size={14} /> Aprobar
                  </button>
                  <button
                    onClick={() => processWithdrawal(w.id, 'rejected')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-semibold transition-colors"
                  >
                    <FiX size={14} /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── VERIFICACIONES ── */}
      {tab === 'verifications' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-3">{verificationRequests.length} solicitud{verificationRequests.length !== 1 ? 'es' : ''}</p>
          {verificationRequests.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <FiShield size={36} className="mx-auto mb-3" />
              <p>Sin solicitudes de verificación</p>
            </div>
          )}
          {verificationRequests.map(v => (
            <div key={v.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={v.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(v.user?.full_name || 'U')}&size=40&background=1a1a2e&color=f43f5e`}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{v.user?.full_name || 'Usuario'}</p>
                    <p className="text-xs text-gray-500">@{v.user?.username}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold shrink-0 ${
                  v.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                  v.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {v.status === 'approved' ? 'Aprobada' : v.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {v.selfie_url && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Selfie</p>
                    <a href={v.selfie_url} target="_blank" rel="noopener noreferrer">
                      <img src={v.selfie_url} alt="selfie" className="w-full aspect-square object-cover rounded-xl hover:opacity-80 transition-opacity" />
                    </a>
                  </div>
                )}
                {v.id_url && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Documento ID</p>
                    <a href={v.id_url} target="_blank" rel="noopener noreferrer">
                      <img src={v.id_url} alt="id" className="w-full aspect-square object-cover rounded-xl hover:opacity-80 transition-opacity" />
                    </a>
                  </div>
                )}
              </div>
              <p className="text-gray-600 text-xs mb-3">
                Enviado: {new Date(v.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              {v.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => processVerification(v.id, 'approved')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors"
                  >
                    <FiCheck size={14} /> Aprobar
                  </button>
                  <button
                    onClick={() => processVerification(v.id, 'rejected')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-semibold transition-colors"
                  >
                    <FiX size={14} /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* ── APELACIONES ── */}
      {tab === 'appeals' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 mb-3">{appeals.length} pendiente{appeals.length !== 1 ? 's' : ''}</p>
          {appeals.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <FiMessageCircle size={36} className="mx-auto mb-3" />
              <p>Sin apelaciones pendientes</p>
            </div>
          )}
          {appeals.map(a => (
            <div key={a.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={a.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.user?.full_name || 'U')}&size=36&background=1a1a2e&color=f43f5e`}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{a.user?.full_name || 'Usuario'}</p>
                  <p className="text-xs text-gray-500">@{a.user?.username} · {a.content_type} #{a.content_id.slice(0, 8)}</p>
                </div>
                <span className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString('es')}</span>
              </div>
              <p className="text-sm text-gray-300 bg-dark-700 rounded-xl p-3">"{a.reason}"</p>
              {reviewingAppeal === a.id ? (
                <div className="space-y-2">
                  <input
                    placeholder="Nota para el usuario (opcional)"
                    className="w-full bg-dark-700 text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:outline-none focus:border-brand-500"
                    id={`note-${a.id}`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const note = document.getElementById(`note-${a.id}`)?.value;
                        await api.patch(`/api/appeals/admin/${a.id}`, { action: 'approve', admin_note: note });
                        setAppeals(p => p.filter(x => x.id !== a.id));
                        setReviewingAppeal(null);
                        toast.success('Apelación aprobada');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors"
                    >
                      <FiCheck size={14} /> Aprobar
                    </button>
                    <button
                      onClick={async () => {
                        const note = document.getElementById(`note-${a.id}`)?.value;
                        await api.patch(`/api/appeals/admin/${a.id}`, { action: 'reject', admin_note: note });
                        setAppeals(p => p.filter(x => x.id !== a.id));
                        setReviewingAppeal(null);
                        toast.success('Apelación rechazada');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-semibold transition-colors"
                    >
                      <FiX size={14} /> Rechazar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setReviewingAppeal(a.id)}
                  className="w-full py-2 rounded-xl bg-dark-700 text-gray-300 hover:text-white text-sm font-semibold transition-colors"
                >
                  Revisar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
