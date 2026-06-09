import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiUsers, FiHeart, FiMessageCircle, FiDollarSign, FiShield, FiStar,
  FiTrash2, FiVideo, FiZap, FiSearch, FiExternalLink, FiRadio, FiGrid,
  FiCheck, FiX, FiCreditCard, FiImage, FiBell, FiPlus, FiMinus, FiFlag,
  FiAlertCircle, FiRefreshCw, FiTrendingUp, FiDownload, FiFileText,
  FiHelpCircle, FiSend,
} from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { SHOW_CATEGORIES } from './LiveShows.jsx';
import AdminGlobalSearch from '../components/ui/AdminGlobalSearch.jsx';
import AdminAuditLog from '../components/ui/AdminAuditLog.jsx';
import AdminTrustedFlaggers from '../components/ui/AdminTrustedFlaggers.jsx';
import AdminFunnel from '../components/ui/AdminFunnel.jsx';

// Recharts es pesado — lazy load solo cuando el admin entra al tab Revenue
const AdminRevenueChart = lazy(() => import('../components/ui/AdminRevenueChart.jsx'));

const TABS = [
  { key: 'overview',       label: 'Resumen',    icon: FiGrid },
  { key: 'revenue',        label: 'Ingresos',   icon: FiDollarSign },
  { key: 'users',          label: 'Usuarios',   icon: FiUsers },
  { key: 'creators',       label: 'Creadores',  icon: FiVideo },
  { key: 'shows',          label: 'Shows',      icon: FiRadio },
  { key: 'content',        label: 'Contenido',  icon: FiImage },
  { key: 'withdrawals',    label: 'Retiros',    icon: FiCreditCard },
  { key: 'verifications',  label: 'ID',         icon: FiShield },
  { key: 'reports',        label: 'Reportes',   icon: FiFlag },
  { key: 'dmca',           label: 'DMCA',       icon: FiShield },
  { key: 'appeals',        label: 'Apelaciones', icon: FiMessageCircle },
  { key: 'support',        label: 'Soporte',     icon: FiHelpCircle },
  { key: 'funnel',         label: 'Funnel',      icon: FiTrendingUp },
  { key: 'audit',          label: 'Audit',       icon: FiFileText },
  { key: 'flaggers',       label: 'Flaggers',    icon: FiShield },
];

const REVENUE_CATS = [
  { key: 'coin_sales',     label: 'Venta de coins',   subtitle: '100% plataforma' },
  { key: 'show_tickets',   label: 'Entradas a shows', subtitle: '30% de cada ticket' },
  { key: 'show_tips',      label: 'Tips en shows',    subtitle: '30% de cada tip' },
  { key: 'show_gifts',     label: 'Regalos en shows', subtitle: '30% de cada regalo' },
  { key: 'content_sales',  label: 'Contenido pagado', subtitle: '30% de PPV / fotos' },
  { key: 'video_requests', label: 'Encargos de video',subtitle: '30% de cada encargo' },
  { key: 'subscriptions',  label: 'Suscripciones',    subtitle: '30% mensual' },
  { key: 'boosts',         label: 'Boost de visibilidad', subtitle: '100% plataforma' },
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
  const [reports, setReports] = useState([]);
  const [reportsFilter, setReportsFilter] = useState('pending');
  const [processingReport, setProcessingReport] = useState(null);
  const [platformRevenue, setPlatformRevenue] = useState(null);
  const [revenueDays, setRevenueDays] = useState(30);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [dmcaList, setDmcaList] = useState([]);
  const [dmcaStatus, setDmcaStatus] = useState('pending');
  const [dmcaLoading, setDmcaLoading] = useState(false);
  const [processingDmca, setProcessingDmca] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState('open');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [respondingTicket, setRespondingTicket] = useState(null);
  const [ticketResponse, setTicketResponse] = useState('');

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === 'revenue') loadPlatformRevenue(revenueDays);
    if (tab === 'dmca')    loadDmca(dmcaStatus);
    if (tab === 'support') loadTickets(ticketStatus);
  }, [tab, revenueDays, dmcaStatus, ticketStatus]);

  const loadTickets = async (status) => {
    setTicketsLoading(true);
    try {
      const { data } = await api.get(`/api/admin/support?status=${status}`);
      setTickets(data?.tickets || []);
    } catch {
      toast.error('Error cargando tickets de soporte');
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleRespondTicket = async (ticketId, status) => {
    if (status === 'resolved' && !ticketResponse.trim()) {
      return toast.error('Escribe una respuesta antes de resolver');
    }
    try {
      await api.patch(`/api/admin/support/${ticketId}`, {
        status,
        admin_response: ticketResponse.trim() || undefined,
      });
      toast.success(status === 'resolved' ? 'Ticket resuelto' : 'Ticket actualizado');
      setRespondingTicket(null);
      setTicketResponse('');
      loadTickets(ticketStatus);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error procesando ticket');
    }
  };

  const loadDmca = async (status) => {
    try {
      setDmcaLoading(true);
      const { data } = await api.get(`/api/admin/dmca?status=${status}`);
      setDmcaList(data?.requests || []);
    } catch {
      toast.error('Error cargando DMCA');
    } finally {
      setDmcaLoading(false);
    }
  };

  const handleProcessDmca = async (id, action, remove_content = false) => {
    setProcessingDmca(id);
    try {
      await api.patch(`/api/admin/dmca/${id}`, { action, remove_content });
      toast.success('DMCA procesado');
      loadDmca(dmcaStatus);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error procesando');
    } finally {
      setProcessingDmca(null);
    }
  };

  const loadPlatformRevenue = async (days) => {
    try {
      setRevenueLoading(true);
      const { data } = await api.get(`/api/admin/platform-revenue?days=${days}`);
      setPlatformRevenue(data);
    } catch (err) {
      toast.error('Error cargando ingresos de plataforma');
    } finally {
      setRevenueLoading(false);
    }
  };

  const fmtUsd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadAll = async () => {
    try {
      const [sRes, uRes, cRes, shRes, wRes, vRes, cqRes, appRes, repRes, tkRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/users'),
        api.get('/api/admin/creators'),
        api.get('/api/admin/shows'),
        api.get('/api/admin/withdrawals').catch(() => ({ data: [] })),
        api.get('/api/admin/verifications').catch(() => ({ data: [] })),
        api.get('/api/admin/content-queue').catch(() => ({ data: { posts: [] } })),
        api.get('/api/appeals/admin').catch(() => ({ data: { appeals: [] } })),
        api.get('/api/admin/reports?status=pending').catch(() => ({ data: { reports: [] } })),
        api.get('/api/admin/support?status=open').catch(() => ({ data: { tickets: [] } })),
      ]);
      setStats(sRes.data.stats);
      setUsers(uRes.data.users);
      setCreators(cRes.data.creators);
      setShows(shRes.data.shows);
      setWithdrawalRequests(wRes.data?.withdrawals || []);
      setVerificationRequests(vRes.data?.verifications || []);
      setContentQueue(cqRes.data?.posts || []);
      setAppeals(appRes.data?.appeals || []);
      setReports(repRes.data?.reports || []);
      setTickets(tkRes.data?.tickets || []);
    } catch (err) {
      if (err.response?.status === 403) navigate('/home', { replace: true });
      else toast.error('Error cargando datos admin');
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async (status) => {
    try {
      const { data } = await api.get(`/api/admin/reports?status=${status}`);
      setReports(data.reports || []);
    } catch {
      toast.error('Error cargando reportes');
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

  const handleProcessReport = async (id, status, banUser = false) => {
    if (banUser && !confirm('¿Banear al usuario reportado? Esta acción es irreversible.')) return;
    setProcessingReport(id);
    try {
      await api.patch(`/api/admin/reports/${id}`, { status, banUser });
      setReports(prev => prev.filter(r => r.id !== id));
      toast.success(status === 'reviewed' ? 'Reporte revisado' : 'Reporte descartado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar reporte');
    } finally {
      setProcessingReport(null);
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

  // Conteos de items que requieren atención del admin. Se calculan local desde
  // los arrays ya cargados — cero requests extra. El tab badge ayuda a saber
  // qué requiere acción sin tener que abrir cada pestaña.
  const pendingCounts = useMemo(() => ({
    withdrawals:   withdrawalRequests.filter(w => w.status === 'pending').length,
    verifications: verificationRequests.filter(v => v.status === 'pending').length,
    content:       contentQueue.length,
    appeals:       appeals.filter(a => a.status === 'pending').length,
    reports:       reports.filter(r => r.status === 'pending').length,
    dmca:          dmcaList.filter(d => d.status === 'pending').length,
    support:       tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length,
  }), [withdrawalRequests, verificationRequests, contentQueue, appeals, reports, dmcaList, tickets]);

  const totalPending = Object.values(pendingCounts).reduce((a, b) => a + b, 0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await loadAll(); }
    finally { setRefreshing(false); }
  };

  if (loading) return (
    <div className="min-h-screen px-4 pt-8 pb-24 max-w-3xl mx-auto">
      {/* Skeleton del header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-dark-700 rounded-xl animate-pulse" />
        <div className="flex-1">
          <div className="w-32 h-5 skeleton rounded mb-1.5" />
          <div className="w-48 h-3 bg-dark-700/60 rounded animate-pulse" />
        </div>
      </div>
      {/* Skeleton tabs */}
      <div className="h-10 bg-dark-800 rounded-2xl animate-pulse mb-6" />
      {/* Skeleton stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24" />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 max-w-3xl mx-auto">
      {/* Header con refresh y badge de pendientes totales */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
          <FiShield size={18} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white">Admin Panel</h1>
            {totalPending > 0 && (
              <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-500/30 flex items-center gap-1">
                <FiAlertCircle size={9} /> {totalPending} pendiente{totalPending !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-gray-600 text-xs">Solo visible para super admins</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-9 h-9 rounded-xl bg-dark-800 hover:bg-dark-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors disabled:opacity-50 shrink-0"
          aria-label="Refrescar datos"
        >
          <FiRefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Búsqueda global Cmd+K */}
      <div className="mb-4">
        <AdminGlobalSearch />
      </div>

      {/* Tabs — scroll horizontal en mobile, wrap en desktop para mostrar todos.
          13 tabs no caben en 1 row angosta sin comprimir hasta ser ilegibles. */}
      <div className="bg-dark-800 p-1 rounded-2xl mb-6 border border-white/5 overflow-x-auto md:overflow-x-visible scrollbar-hide">
        <div className="flex gap-1 min-w-fit md:flex-wrap md:min-w-0">
          {TABS.map(({ key, label, icon: Icon }) => {
            const pendingCount = pendingCounts[key] || 0;
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all shrink-0 relative ${
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={13} /> {label}
                {pendingCount > 0 && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-black rounded-full px-1 ${
                    isActive ? 'bg-white text-brand-500' : 'bg-red-500 text-white'
                  }`}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RESUMEN ── */}
      {tab === 'overview' && stats && (
        <div className="space-y-4">
          {/* Acción requerida — solo si hay items pendientes. Atajos a cada tab. */}
          {totalPending > 0 && (
            <div className="card p-4 border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/5">
              <div className="flex items-center gap-2 mb-3">
                <FiAlertCircle size={16} className="text-red-400" />
                <h3 className="text-sm font-bold text-white">Acción requerida</h3>
                <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded-full">
                  {totalPending} item{totalPending !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'withdrawals',   label: 'Retiros',       icon: FiCreditCard, count: pendingCounts.withdrawals },
                  { key: 'verifications', label: 'Verificaciones', icon: FiShield,    count: pendingCounts.verifications },
                  { key: 'content',       label: 'Contenido',     icon: FiImage,      count: pendingCounts.content },
                  { key: 'reports',       label: 'Reportes',      icon: FiFlag,       count: pendingCounts.reports },
                  { key: 'dmca',          label: 'DMCA',          icon: FiShield,     count: pendingCounts.dmca },
                  { key: 'appeals',       label: 'Apelaciones',   icon: FiMessageCircle, count: pendingCounts.appeals },
                  { key: 'support',       label: 'Soporte',       icon: FiHelpCircle, count: pendingCounts.support },
                ].filter(x => x.count > 0).map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className="flex items-center gap-2 bg-dark-800/70 hover:bg-dark-700 rounded-lg p-2.5 text-left transition-colors"
                  >
                    <Icon size={14} className="text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 truncate">{label}</p>
                    </div>
                    <span className="text-sm font-black text-white tabular-nums shrink-0">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats unificadas — 9 cards en un solo grid responsivo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { icon: FiUsers,       label: 'Usuarios',   value: stats.users,    color: 'text-blue-400',   bg: 'bg-blue-500/10' },
              { icon: FiVideo,       label: 'Creadores',  value: stats.creators, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { icon: FiHeart,       label: 'Matches',    value: stats.matches,  color: 'text-brand-400',  bg: 'bg-brand-500/10' },
              { icon: FiMessageCircle, label: 'Mensajes', value: stats.messages, color: 'text-green-400',  bg: 'bg-green-500/10' },
              { icon: FiRadio,       label: 'Shows',      value: stats.shows,    color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { icon: FiStar,        label: 'Premium',    value: stats.premium,  color: 'text-brand-400',  bg: 'bg-brand-500/10' },
              { icon: FiStar,        label: 'VIP',        value: stats.vip,      color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
              { icon: FiDollarSign,  label: 'Ganancias',  value: `$${(stats.total_earnings || 0).toFixed(2)}`, color: 'text-green-400', bg: 'bg-green-500/10' },
              { icon: FiZap,         label: 'Coins',      value: (stats.coins_total || 0).toLocaleString(), color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="card-interactive p-4">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                  <Icon size={16} className={color} />
                </div>
                <div className="text-xl font-black text-white tabular-nums">
                  {typeof value === 'number' ? value.toLocaleString() : (value ?? 0)}
                </div>
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

      {/* ── INGRESOS PLATAFORMA (solo admin) ── */}
      {tab === 'revenue' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Ingresos de la plataforma</h2>
              <p className="text-xs text-gray-500">Comisión del 30% sobre transacciones + 100% de venta de coins y boosts</p>
            </div>
            <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
              {[7, 30, 90, 365].map(d => (
                <button
                  key={d}
                  onClick={() => setRevenueDays(d)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    revenueDays === d ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {d === 365 ? '1 año' : `${d}d`}
                </button>
              ))}
            </div>
          </div>

          {revenueLoading && !platformRevenue && (
            <div className="card p-8 text-center text-gray-500 text-sm">Cargando ingresos…</div>
          )}

          {platformRevenue && (
            <>
              {/* Gráfico de revenue diario — lazy load del chunk recharts */}
              <Suspense fallback={<div className="skeleton h-64" />}>
                <AdminRevenueChart days={Math.min(revenueDays, 90)} />
              </Suspense>

              {/* Totales */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="card p-5 bg-gradient-to-br from-green-500/15 to-emerald-500/5 border-green-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <FiDollarSign size={18} className="text-green-400" />
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total plataforma</span>
                  </div>
                  <div className="text-3xl font-black text-white">{fmtUsd(platformRevenue.total_current)}</div>
                  <div className="text-xs mt-1">
                    {platformRevenue.total_previous > 0 ? (
                      <span className={platformRevenue.pct_change >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {platformRevenue.pct_change >= 0 ? '↑' : '↓'} {Math.abs(platformRevenue.pct_change)}% vs período anterior
                      </span>
                    ) : platformRevenue.total_current > 0 ? (
                      <span className="text-brand-400">🎉 Primer período con ingresos</span>
                    ) : (
                      <span className="text-gray-600">Sin datos previos</span>
                    )}
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <FiUsers size={18} className="text-blue-400" />
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Pagado a creadores (70%)</span>
                  </div>
                  <div className="text-3xl font-black text-white">{fmtUsd(platformRevenue.creator_earnings_current)}</div>
                  <div className="text-xs mt-1 text-gray-500">en el mismo período</div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <FiZap size={18} className="text-yellow-400" />
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">GMV (volumen total)</span>
                  </div>
                  <div className="text-3xl font-black text-white">
                    {fmtUsd(platformRevenue.total_current + platformRevenue.creator_earnings_current)}
                  </div>
                  <div className="text-xs mt-1 text-gray-500">
                    1 coin = ${platformRevenue.coin_rate?.usd_per_coin} • {Math.round((platformRevenue.coin_rate?.platform_fee || 0) * 100)}% comisión
                  </div>
                </div>
              </div>

              {/* Desglose por categoría */}
              <div className="card p-4">
                <h3 className="text-sm font-bold text-white mb-3">Desglose por categoría</h3>
                <div className="space-y-2">
                  {REVENUE_CATS.map(cat => {
                    const detail = platformRevenue.breakdown_detail?.[cat.key] || { total_usd: 0, count: 0, avg_usd: 0, max_usd: 0 };
                    const total  = platformRevenue.total_current || 1;
                    const pct    = (detail.total_usd / total) * 100;
                    return (
                      <div key={cat.key} className="bg-dark-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{cat.label}</p>
                            <p className="text-[10px] text-gray-500">{cat.subtitle}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-black text-white">{fmtUsd(detail.total_usd)}</p>
                            <p className="text-[10px] text-gray-500">{pct.toFixed(1)}% del total</p>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-500 to-pink-500 rounded-full"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        {detail.count > 0 && (
                          <div className="flex gap-4 text-[10px] text-gray-500 mt-1.5">
                            <span>{detail.count} {detail.count === 1 ? 'transacción' : 'transacciones'}</span>
                            <span>Promedio: {fmtUsd(detail.avg_usd)}</span>
                            <span>Máx: {fmtUsd(detail.max_usd)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mini chart de barras día por día */}
              {Array.isArray(platformRevenue.chart) && platformRevenue.chart.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-bold text-white mb-3">Evolución diaria ({revenueDays}d)</h3>
                  <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                    {(() => {
                      const max = Math.max(...platformRevenue.chart.map(p => p.amount), 1);
                      return platformRevenue.chart.map(p => (
                        <div key={p.date} className="flex flex-col items-center gap-1 min-w-[16px]" title={`${p.date}: ${fmtUsd(p.amount)}`}>
                          <div
                            className="w-3 bg-gradient-to-t from-brand-500 to-pink-500 rounded-t"
                            style={{ height: `${(p.amount / max) * 100}%`, minHeight: p.amount > 0 ? '2px' : '0' }}
                          />
                          <span className="text-[8px] text-gray-600 rotate-45 origin-left whitespace-nowrap">
                            {p.date.substring(5)}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-gray-600 text-center px-4">
                Los creadores únicamente pueden ver sus ganancias (70%) en su panel.
                Esta vista de plataforma solo es visible para administradores.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── USUARIOS ── */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input-field pl-9 py-2 text-sm w-full"
                placeholder="Buscar por nombre o username..."
                value={search}
                onChange={e => { setSearch(e.target.value); setUsersPage(0); }}
              />
            </div>
            <ExportCsvButton dataset="users" label="Users" />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-600">{filteredUsers.length} usuario{filteredUsers.length !== 1 ? 's' : ''}</p>
            {selectedUsers.size > 0 && (
              <BulkActionsToolbar
                count={selectedUsers.size}
                disabled={bulkLoading}
                onAction={async (action) => {
                  if (action === 'delete' && !confirm(`¿Eliminar ${selectedUsers.size} usuarios? Esta acción es irreversible.`)) return;
                  setBulkLoading(true);
                  try {
                    const { data } = await api.post('/api/admin/users/bulk', {
                      user_ids: [...selectedUsers],
                      action,
                    });
                    toast.success(`${data.ok} ok · ${data.failed} fallidos`);
                    // Refrescar lista local
                    if (action === 'verify')   setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_verified: true } : u));
                    if (action === 'unverify') setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_verified: false } : u));
                    if (action === 'creator')  setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_creator: true } : u));
                    if (action === 'uncreator')setUsers(p => p.map(u => selectedUsers.has(u.id) ? { ...u, is_creator: false } : u));
                    if (action === 'delete')   setUsers(p => p.filter(u => !selectedUsers.has(u.id)));
                    setSelectedUsers(new Set());
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Error en bulk action');
                  } finally {
                    setBulkLoading(false);
                  }
                }}
                onClear={() => setSelectedUsers(new Set())}
              />
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-600">{withdrawalRequests.length} solicitud{withdrawalRequests.length !== 1 ? 'es' : ''}</p>
            <ExportCsvButton dataset="withdrawals" label="Retiros" />
          </div>
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
      {/* ── DMCA ── */}
      {tab === 'dmca' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Notificaciones DMCA</h2>
              <p className="text-xs text-gray-500">Solicitudes de takedown bajo 17 U.S.C. § 512(c)(3)</p>
            </div>
            <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
              {['pending', 'accepted', 'rejected', 'counter_notice'].map(s => (
                <button
                  key={s}
                  onClick={() => setDmcaStatus(s)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${dmcaStatus === s ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {s === 'pending' ? 'Pendientes' : s === 'accepted' ? 'Aceptados' : s === 'rejected' ? 'Rechazados' : 'Contra-notif.'}
                </button>
              ))}
            </div>
          </div>

          {dmcaLoading && <div className="card p-8 text-center text-gray-500 text-sm">Cargando…</div>}

          {!dmcaLoading && dmcaList.length === 0 && (
            <div className="card p-8 text-center text-gray-500 text-sm">Sin solicitudes en esta categoría</div>
          )}

          {dmcaList.map(d => (
            <div key={d.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{d.copyright_owner}</p>
                  <p className="text-xs text-gray-500">por {d.claimant_name} · {d.claimant_email}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(d.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 text-gray-400 uppercase font-bold shrink-0">
                  {d.content_type}
                </span>
              </div>

              <div className="bg-dark-800 rounded-lg p-2.5 text-xs space-y-1">
                <p className="text-gray-500">URL infractora:</p>
                <p className="text-white break-all text-[11px]">{d.infringing_url}</p>
                {d.original_work_url && (
                  <>
                    <p className="text-gray-500 mt-2">Obra original:</p>
                    <p className="text-white break-all text-[11px]">{d.original_work_url}</p>
                  </>
                )}
              </div>

              <div className="text-[10px] text-gray-500 italic">
                Firma: <span className="text-gray-300 not-italic">{d.signature}</span>
              </div>

              {d.status === 'pending' && (
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => handleProcessDmca(d.id, 'accept', true)}
                    disabled={processingDmca === d.id}
                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40"
                  >
                    Aceptar + eliminar contenido
                  </button>
                  <button
                    onClick={() => handleProcessDmca(d.id, 'reject')}
                    disabled={processingDmca === d.id}
                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-dark-700 text-gray-300 hover:bg-dark-600 disabled:opacity-40"
                  >
                    Rechazar
                  </button>
                </div>
              )}

              {d.status !== 'pending' && d.resolution && (
                <p className="text-[10px] text-gray-500 pt-2 border-t border-white/5">
                  Resolución: <span className="text-gray-300">{d.resolution.replace(/_/g, ' ')}</span>
                  {d.reviewed_at && ` · ${new Date(d.reviewed_at).toLocaleDateString('es')}`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── REPORTES ── */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {/* Filtro de estado */}
          <div className="flex gap-2 mb-1">
            {['pending', 'reviewed', 'dismissed'].map(s => (
              <button
                key={s}
                onClick={() => { setReportsFilter(s); loadReports(s); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  reportsFilter === s ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {s === 'pending' ? 'Pendientes' : s === 'reviewed' ? 'Revisados' : 'Descartados'}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-600">{reports.length} reporte{reports.length !== 1 ? 's' : ''}</p>

          {reports.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <FiFlag size={36} className="mx-auto mb-3" />
              <p>Sin reportes {reportsFilter === 'pending' ? 'pendientes' : reportsFilter === 'reviewed' ? 'revisados' : 'descartados'}</p>
            </div>
          ) : (
            reports.map(r => (
              <div key={r.id} className="card p-4 space-y-3">
                {/* Reportado */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Usuario reportado</p>
                    <div className="flex items-center gap-2">
                      <img
                        src={r.reported?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.reported?.full_name || 'U')}&size=32&background=1a1a2e&color=f43f5e`}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                        alt=""
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">{r.reported?.full_name || 'Usuario'}</p>
                        <p className="text-xs text-gray-500">@{r.reported?.username}</p>
                      </div>
                      <Link to={`/profile/${r.reported?.id}`} className="ml-auto text-gray-500 hover:text-brand-400">
                        <FiExternalLink size={13} />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Motivo */}
                <div className="bg-dark-700 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">Motivo</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      r.reason === 'harassment' ? 'bg-red-500/20 text-red-400' :
                      r.reason === 'inappropriate' ? 'bg-orange-500/20 text-orange-400' :
                      r.reason === 'spam' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-dark-600 text-gray-400'
                    }`}>
                      {r.reason === 'spam' ? 'Spam' :
                       r.reason === 'inappropriate' ? 'Inapropiado' :
                       r.reason === 'harassment' ? 'Acoso' :
                       r.reason === 'fake' ? 'Perfil falso' :
                       r.reason === 'fake_profile' ? 'Perfil falso' :
                       r.reason === 'hate_speech' ? 'Discurso de odio' :
                       r.reason === 'underage' ? 'Menor de edad' :
                       r.reason}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">Reportado por</span>
                    <span className="text-gray-300 text-xs">@{r.reporter?.username || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">Fecha</span>
                    <span className="text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {reportsFilter === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleProcessReport(r.id, 'dismissed')}
                      disabled={processingReport === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-gray-400 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <FiX size={14} /> Descartar
                    </button>
                    <button
                      onClick={() => handleProcessReport(r.id, 'reviewed')}
                      disabled={processingReport === r.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <FiCheck size={14} /> Revisado
                    </button>
                    <button
                      onClick={() => handleProcessReport(r.id, 'reviewed', true)}
                      disabled={processingReport === r.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-semibold transition-colors disabled:opacity-50"
                      title="Revisar y banear usuario"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
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

      {/* ── SOPORTE ── */}
      {tab === 'support' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiHelpCircle size={16} /> Tickets de soporte
            </h2>
            {/* Filtro de status */}
            <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
              {[
                { k: 'open',        l: 'Abiertos' },
                { k: 'in_progress', l: 'En curso' },
                { k: 'resolved',    l: 'Resueltos' },
                { k: 'closed',      l: 'Cerrados' },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  onClick={() => setTicketStatus(k)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                    ticketStatus === k ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {ticketsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="card p-8 text-center text-gray-500 text-sm">
              <FiHelpCircle size={32} className="mx-auto mb-2 text-gray-600" />
              Sin tickets {ticketStatus === 'open' ? 'abiertos' : `con estado "${ticketStatus}"`}
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <div key={t.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          t.priority === 'high'   ? 'bg-red-500/20 text-red-400' :
                          t.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-white/10 text-gray-400'
                        }`}>
                          {t.priority?.toUpperCase() || 'NORMAL'}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {new Date(t.created_at).toLocaleString('es', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        {t.category && (
                          <span className="text-[10px] bg-dark-700 text-gray-400 px-2 py-0.5 rounded-full">
                            {t.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-white truncate">{t.subject || 'Sin asunto'}</p>
                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-words">{t.message}</p>
                      {t.admin_response && (
                        <div className="mt-2 p-2 bg-brand-500/10 border-l-2 border-brand-500 rounded-r text-xs text-gray-300">
                          <p className="text-[10px] text-brand-400 font-bold uppercase tracking-wide mb-1">Tu respuesta</p>
                          {t.admin_response}
                        </div>
                      )}
                    </div>
                  </div>

                  {respondingTicket === t.id ? (
                    <div className="space-y-2 mt-3 border-t border-white/5 pt-3">
                      <textarea
                        value={ticketResponse}
                        onChange={(e) => setTicketResponse(e.target.value)}
                        placeholder="Respuesta al usuario..."
                        rows={3}
                        className="input-field py-2 text-sm w-full resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRespondingTicket(null); setTicketResponse(''); }}
                          className="flex-1 text-xs bg-dark-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleRespondTicket(t.id, 'in_progress')}
                          className="flex-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 px-3 py-2 rounded-lg font-semibold"
                        >
                          Guardar (en curso)
                        </button>
                        <button
                          onClick={() => handleRespondTicket(t.id, 'resolved')}
                          className="flex-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-1"
                        >
                          <FiSend size={11} /> Resolver
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      {(ticketStatus === 'open' || ticketStatus === 'in_progress') && (
                        <button
                          onClick={() => { setRespondingTicket(t.id); setTicketResponse(t.admin_response || ''); }}
                          className="flex-1 text-xs bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-1"
                        >
                          <FiMessageCircle size={11} /> Responder
                        </button>
                      )}
                      {ticketStatus !== 'closed' && (
                        <button
                          onClick={() => handleRespondTicket(t.id, 'closed')}
                          className="text-xs bg-dark-700 text-gray-400 hover:text-white px-3 py-2 rounded-lg"
                        >
                          Cerrar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FUNNEL ── */}
      {tab === 'funnel' && <AdminFunnel />}

      {/* ── AUDIT LOG ── */}
      {tab === 'audit' && <AdminAuditLog />}
      {tab === 'flaggers' && <AdminTrustedFlaggers />}
    </div>
  );
}

// Botón export CSV — descarga directa, hace request blob y triggera <a> download.
// Reutilizable en cualquier listado: dataset es 'users' | 'withdrawals' | 'audit_log' | 'transactions'.
function ExportCsvButton({ dataset, label }) {
  const [busy, setBusy] = useState(false);
  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/api/admin/export/${dataset}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error exportando');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="bg-dark-800 hover:bg-dark-700 text-gray-300 px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs disabled:opacity-50 shrink-0"
      aria-label={`Exportar ${label} CSV`}
    >
      <FiDownload size={12} /> {busy ? 'Exportando…' : label}
    </button>
  );
}

// Toolbar de acciones en masa sobre users seleccionados.
// Pasa una sola request al backend en lugar de N requests paralelas.
function BulkActionsToolbar({ count, disabled, onAction, onClear }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-brand-400 font-semibold mr-1">
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <button
        disabled={disabled}
        onClick={() => onAction('verify')}
        className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 font-medium transition-colors disabled:opacity-50"
      >
        ✓ Verificar
      </button>
      <button
        disabled={disabled}
        onClick={() => onAction('unverify')}
        className="text-xs px-2.5 py-1 rounded-lg bg-dark-700 text-gray-400 hover:text-white font-medium transition-colors disabled:opacity-50"
      >
        ✕ Quitar verif
      </button>
      <button
        disabled={disabled}
        onClick={() => onAction('creator')}
        className="text-xs px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 font-medium transition-colors disabled:opacity-50"
      >
        🎥 Creador
      </button>
      <button
        disabled={disabled}
        onClick={() => onAction('delete')}
        className="text-xs px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium transition-colors disabled:opacity-50"
      >
        🚫 Banear
      </button>
      <button
        onClick={onClear}
        className="text-xs text-gray-500 hover:text-white px-1"
        aria-label="Limpiar selección"
      >
        ✕
      </button>
    </div>
  );
}
