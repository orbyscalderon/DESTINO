import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDollarSign, FiVideo, FiImage, FiPlus, FiArrowUpRight,
  FiTrendingUp, FiAlertCircle, FiUsers, FiBarChart2, FiSettings,
  FiGrid, FiEdit3, FiCheck, FiX, FiCalendar, FiClock,
  FiStar, FiZap, FiShield, FiChevronRight, FiRefreshCw,
  FiCreditCard, FiArrowDown, FiPlay, FiTrash2, FiSend, FiGift,
  FiRadio, FiLogOut, FiLock,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { SHOW_CATEGORIES } from './LiveShows.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';
import VideoPackagesManager from '../components/ui/VideoPackagesManager.jsx';
import CreatorGiftsManager from '../components/ui/CreatorGiftsManager.jsx';
import TipMenuManager from '../components/ui/TipMenuManager.jsx';
import TierManager from '../components/ui/TierManager.jsx';
import CCBillSetup from '../components/ui/CCBillSetup.jsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

/* ── Helpers ─────────────────────────────────────────────── */
const fmt   = (v) => parseFloat(v || 0).toFixed(2);
const fmtK  = (v) => { const n = parseFloat(v||0); return n>=1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(2)}`; };

/* ── Mini components ─────────────────────────────────────── */
function Toggle({ value, onChange, accent = 'brand' }) {
  const c = { brand: 'bg-brand-500', red: 'bg-red-500', green: 'bg-green-500' };
  return (
    <button onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${value ? (c[accent]||c.brand) : 'bg-dark-600 border border-white/10'}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${value ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function StatPill({ label, value, icon: Icon, color = 'text-brand-400' }) {
  return (
    <div className="flex flex-col items-center px-4 py-2 bg-dark-700/60 rounded-xl border border-white/5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={11} className={color} />}
        <span className={`text-sm font-black ${color}`}>{value}</span>
      </div>
      <span className="text-[10px] text-gray-600 mt-0.5">{label}</span>
    </div>
  );
}

function ShowStatusBadge({ status }) {
  const m = {
    live:      { label: 'En vivo',    cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    scheduled: { label: 'Listo',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    ended:     { label: 'Finalizado', cls: 'bg-dark-600 text-gray-500 border-white/5' },
  };
  const b = m[status] || m.ended;
  return <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold border ${b.cls}`}>{b.label}</span>;
}

function StoryAnalyticsCard() {
  const [stories, setStories] = useState(null);
  useEffect(() => {
    api.get('/api/creator/story-analytics')
      .then(({ data }) => setStories(data.stories || []))
      .catch(() => {});
  }, []);
  if (!stories) return null;
  if (stories.length === 0) return null;
  return (
    <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
      <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
        <FiImage size={13} className="text-pink-400" /> Vistas de Stories (últimas 20)
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {stories.slice(0, 8).map(s => (
          <div key={s.id} className="bg-dark-700/60 rounded-xl p-2.5 flex items-center gap-2">
            {s.media_url && (
              <img src={s.media_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('es',{day:'numeric',month:'short'})}</p>
              <p className="text-white font-bold text-sm">{s.views_count} <span className="text-gray-500 font-normal text-xs">vistas</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }) {
  if (!data?.length) return null;
  const chartData = data.slice(-30).map(d => ({ date: d.date?.slice(5), amount: d.amount }));
  const isSparse = chartData.length < 5;
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={chartData} margin={{ top: 4, right: 10, left: -30, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" padding={{ left: 20, right: 20 }} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af', fontSize: 11 }}
          itemStyle={{ color: '#a78bfa', fontSize: 11 }}
          formatter={v => [`$${v}`, 'Ingresos']}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#incomeGrad)"
          dot={isSparse ? { fill: '#8b5cf6', r: 4 } : false}
          activeDot={{ r: 6, fill: '#a78bfa' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Nav items ───────────────────────────────────────────── */
const NAV_ITEMS = [
  { key: 'overview',    label: 'Resumen',      icon: FiGrid },
  { key: 'shows',       label: 'Mis Shows',    icon: FiVideo },
  { key: 'content',     label: 'Contenido',    icon: FiImage },
  { key: 'packages',    label: 'Encargos',     icon: FiSend },
  { key: 'gifts',       label: 'Regalos',      icon: FiGift },
  { key: 'subscribers', label: 'Suscriptores', icon: FiUsers },
  { key: 'earnings',    label: 'Ingresos',     icon: FiDollarSign },
  { key: 'analytics',   label: 'Analytics',    icon: FiBarChart2 },
  { key: 'settings',    label: 'Ajustes',      icon: FiSettings },
];

/* ══════════════════════════════════════════════════════════ */
export default function CreatorDashboard() {
  const { profile, user, fetchProfile } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData]                   = useState(null);
  const [analytics, setAnalytics]         = useState(null);
  const [postAnalytics, setPostAnalytics] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const [tab, setTab] = useState(() => searchParams.get('tab') || 'overview');

  // Subscribers
  const [subscribers, setSubscribers]   = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastPpv, setBroadcastPpv] = useState(false);
  const [broadcastPrice, setBroadcastPrice] = useState(50);
  const [sending, setSending]           = useState(false);
  const [exporting, setExporting]       = useState(false);

  // Tips & Withdrawals
  const [tips, setTips]         = useState([]);
  const [tipsTotal, setTipsTotal] = useState(0);
  const [breakdown, setBreakdown] = useState(null);
  const [incomeFeed, setIncomeFeed] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [withdrawals, setWithdrawals]     = useState([]);
  const [withdrawForm, setWithdrawForm]   = useState({ amount: '' });
  const [autoPayout, setAutoPayout]       = useState(null);
  const [savingAutoPayout, setSavingAutoPayout] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  // Galleries
  const [galleries, setGalleries]       = useState(null);
  const [newGallery, setNewGallery]     = useState({ title: '', price_coins: '50' });
  const [creatingGallery, setCreatingGallery] = useState(false);
  const galleryFileRef     = useRef(null);
  const galleryItemFileRef = useRef(null);
  const [uploadingItem, setUploadingItem] = useState(null);


  // Settings
  const [subPrice, setSubPrice]     = useState('');
  const [bio, setBio]               = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingBio, setSavingBio]   = useState(false);

  /* ── onboarding ── */
  useEffect(() => {
    if (searchParams.get('onboarding') === 'complete') {
      fetchProfile(user?.id);
      toast.success('¡Pagos configurados!');
    }
  }, []);

  /* ── guard ── */
  useEffect(() => {
    if (!profile?.is_creator) { navigate('/become-creator'); return; }
    loadDashboard();
  }, [profile?.is_creator]);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [dashRes, analyticsRes, postRes, earningsRes, tipsRes, breakdownRes, feedRes, autoPayoutRes] = await Promise.all([
        api.get('/api/creator/dashboard'),
        api.get('/api/creator/analytics'),
        api.get('/api/creator/post-analytics').catch(() => ({ data: null })),
        api.get('/api/withdrawals/earnings').catch(() => ({ data: null })),
        api.get('/api/tips/received').catch(() => ({ data: { tips: [], total_coins: 0 } })),
        api.get('/api/creator/breakdown?days=30').catch(() => ({ data: null })),
        api.get('/api/creator/income-feed?limit=50').catch(() => ({ data: { items: [] } })),
        api.get('/api/withdrawals/auto-payout').catch(() => ({ data: null })),
      ]);
      setData(dashRes.data);
      setAnalytics(analyticsRes.data);
      setPostAnalytics(postRes.data);
      setEarnings(earningsRes.data);
      setTips(tipsRes.data?.tips || []);
      setTipsTotal(tipsRes.data?.total_coins || 0);
      setBreakdown(breakdownRes.data);
      setIncomeFeed(feedRes.data?.items || []);
      setAutoPayout(autoPayoutRes.data);
      setSubPrice(dashRes.data.profile?.creator_subscription_price ?? '');
      setBio(dashRes.data.profile?.creator_bio ?? '');
    } catch {
      toast.error('Error al cargar el estudio');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /* ── handlers ── */
  const handleDeleteShow = async (showId) => {
    if (!confirm('¿Eliminar este show?')) return;
    try {
      await api.delete(`/api/shows/${showId}`);
      toast.success('Show eliminado');
      loadDashboard(true);
    } catch { toast.error('Error al eliminar'); }
  };

  const handleEndShow = async (showId) => {
    if (!confirm('¿Terminar este show ahora? Los viewers serán desconectados.')) return;
    try {
      await api.post(`/api/shows/${showId}/end`);
      toast.success('Show terminado');
      loadDashboard(true);
    } catch (err) { toast.error(err.response?.data?.error || 'Error al terminar'); }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setSending(true);
    try {
      const payload = { message: broadcastMsg.trim() };
      if (broadcastPpv) {
        payload.is_paid = true;
        payload.price_coins = Math.max(1, Math.min(9999, parseInt(broadcastPrice) || 50));
      }
      const { data: res } = await api.post('/api/creator/subscribers/broadcast', payload);
      const earned = broadcastPpv ? ` · Potencial $${(res.sent * (payload.price_coins || 0) * 0.05 * 0.7).toFixed(2)} si todos pagan` : '';
      toast.success(`Enviado a ${res.sent} suscriptores${earned}`);
      setBroadcastMsg('');
      setBroadcastPpv(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Error al enviar'); }
    finally { setSending(false); }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get('/api/creator/analytics/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'analytics.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error al exportar'); }
    finally { setExporting(false); }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount < 10) { toast.error('Mínimo $10'); return; }
    setSubmittingWithdrawal(true);
    try {
      const { data: res } = await api.post('/api/creator/payout', { amount });
      toast.success(`Retiro de $${res.amount?.toFixed(2)} procesado`);
      setWithdrawForm({ amount: '' });
      loadDashboard(true);
    } catch (err) { toast.error(err.response?.data?.error || 'Error al retirar'); }
    finally { setSubmittingWithdrawal(false); }
  };

  const handleSaveSubPrice = async () => {
    setSavingPrice(true);
    try {
      await api.put('/api/creator/subscription-price', { price: parseFloat(subPrice) || null });
      toast.success('Precio actualizado');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingPrice(false); }
  };

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await api.put('/api/creator/bio', { creator_bio: bio });
      toast.success('Bio guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingBio(false); }
  };

  const handleToggleAdult = async () => {
    try {
      await api.put('/api/creator/adult-mode', { enabled: !profile?.is_adult_creator });
      await fetchProfile(user?.id);
      toast.success(profile?.is_adult_creator ? 'Modo adulto desactivado' : 'Modo adulto activado');
    } catch { toast.error('Error'); }
  };

  /* ── derived ── */
  const isStripeActive = profile?.stripe_account_status === 'active';
  const available      = parseFloat(data?.earnings?.available_balance || 0);

  /* ── loading ── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Cargando estudio…</p>
      </div>
    </div>
  );

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-dark-900 pb-24 lg:pb-0 lg:flex lg:flex-col">

      {/* ── HEADER DEL ESTUDIO ───────────────────────────── */}
      <div className="bg-dark-800 border-b border-white/5 px-4 py-3 lg:px-6 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center gap-3">

          {/* Avatar + nombre */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="relative shrink-0">
              <img
                src={profile?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${profile?.id}`}
                alt=""
                className="w-8 h-8 rounded-xl object-cover border border-white/10"
              />
              {isStripeActive && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-800" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-white text-xs font-bold truncate max-w-[100px] sm:max-w-none">{profile?.full_name || 'Creador'}</span>
                {profile?.is_verified && <VerifiedBadge size={12} />}
              </div>
              <p className="text-gray-500 text-[10px]">Estudio</p>
            </div>
          </div>

          {/* Stats rápidas — ocultas en móvil (se ven en los tabs) */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <StatPill label="Disponible" value={fmtK(data?.earnings?.available_balance)} icon={FiDollarSign} color="text-green-400" />
            <StatPill label="Subs" value={analytics?.subscribers ?? 0} icon={FiUsers} color="text-brand-400" />
            <StatPill label="Shows" value={data?.shows?.length ?? 0} icon={FiVideo} color="text-purple-400" />
          </div>

          {/* Balance compacto solo en móvil */}
          <div className="sm:hidden flex items-center gap-1 bg-dark-700 px-2 py-1 rounded-lg">
            <FiDollarSign size={11} className="text-green-400" />
            <span className="text-green-400 text-xs font-bold">{fmtK(data?.earnings?.available_balance)}</span>
          </div>

          {/* Acciones del header */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl bg-dark-700 hover:bg-dark-600 flex items-center justify-center transition-colors"
            >
              <FiRefreshCw size={13} className={`text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => navigate('/studio')}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-2.5 py-2 rounded-xl transition-colors"
            >
              <FiPlus size={13} /> <span className="hidden sm:inline">Nuevo show</span><span className="sm:hidden">Show</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full lg:flex lg:flex-1">

        {/* ── SIDEBAR NAV (desktop) / top tabs (mobile) ──── */}
        <nav className="lg:w-52 lg:shrink-0 lg:border-r lg:border-white/5 lg:min-h-[calc(100vh-57px)]">
          {/* Mobile: horizontal scroll con indicador visual */}
          <div className="relative lg:hidden border-b border-white/5">
            <div className="flex overflow-x-auto scrollbar-hide px-4 pt-3 pb-0 gap-0.5">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[11px] font-semibold shrink-0 transition-all border-b-2 ${
                    tab === key
                      ? 'text-white border-brand-500 bg-brand-500/10'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
            {/* Gradiente indicador de scroll derecho */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-dark-800 to-transparent pointer-events-none" />
          </div>

          {/* Desktop: vertical sidebar */}
          <div className="hidden lg:flex flex-col gap-0.5 p-3 pt-5">
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full ${
                  tab === key
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <Icon size={15} className={tab === key ? 'text-brand-400' : ''} />
                {label}
              </button>
            ))}

            <div className="mt-auto pt-6 border-t border-white/5 mt-6">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-400 transition-colors w-full"
              >
                <FiLogOut size={14} /> Salir del estudio
              </button>
            </div>
          </div>
        </nav>

        {/* ── CONTENIDO PRINCIPAL ──────────────────────────── */}
        <div className="flex-1 min-w-0 px-4 py-5 lg:px-6 lg:py-6">

          {/* ── Stripe warning ── */}
          {!isStripeActive && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mb-5 p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-3"
            >
              <FiAlertCircle className="text-yellow-400 shrink-0" size={18} />
              <div className="flex-1 min-w-0">
                <p className="text-yellow-300 font-semibold text-sm">Pagos no configurados</p>
                <p className="text-gray-400 text-xs mt-0.5">Conecta Stripe para cobrar por tu contenido</p>
              </div>
              <Link to="/become-creator"
                className="shrink-0 flex items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
              >
                Conectar <FiChevronRight size={12} />
              </Link>
            </motion.div>
          )}

          <AnimatePresence mode="wait">

            {/* ══ RESUMEN ════════════════════════════════════ */}
            {tab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

                {/* Balance card */}
                {isStripeActive && (
                  <div className="rounded-2xl bg-gradient-to-r from-brand-500/15 to-purple-500/10 border border-brand-500/20 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Balance disponible</p>
                        <p className="text-3xl font-black text-white">${fmt(available)}</p>
                        <p className="text-gray-500 text-xs mt-1">Total ganado: ${fmt(data?.earnings?.total_earned)}</p>
                      </div>
                      <button
                        onClick={() => setTab('earnings')}
                        className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                      >
                        <FiArrowDown size={14} /> Retirar
                      </button>
                    </div>
                    <div className="mt-4 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${Math.min((available/10)*100, 100)}%` }} />
                    </div>
                    {available < 10 && (
                      <p className="text-gray-600 text-xs mt-1">Mínimo $10 · faltan ${Math.max(0, 10-available).toFixed(2)}</p>
                    )}
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Total ganado',  value: fmtK(data?.earnings?.total_earned),      color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: FiTrendingUp },
                    { label: 'Disponible',    value: fmtK(data?.earnings?.available_balance),  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: FiDollarSign },
                    { label: 'Pendiente',     value: fmtK(data?.earnings?.pending_balance),    color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     icon: FiClock },
                    { label: 'Retirado',      value: fmtK(data?.earnings?.total_paid_out),     color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20',     icon: FiArrowUpRight },
                  ].map(s => (
                    <div key={s.label} className={`rounded-2xl border p-4 ${s.bg}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-gray-500 text-xs">{s.label}</p>
                        <s.icon size={13} className={s.color} />
                      </div>
                      <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Shows activos */}
                {data?.shows?.filter(s => s.status !== 'ended').length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-bold text-white flex items-center gap-2 text-sm">
                        <FiRadio size={14} className="text-green-400" /> Shows activos
                      </h2>
                      <button onClick={() => setTab('shows')} className="text-xs text-brand-400 hover:underline">Ver todos →</button>
                    </div>
                    <div className="space-y-2">
                      {data.shows.filter(s => s.status !== 'ended').slice(0, 3).map(show => (
                        <ShowRow key={show.id} show={show} onGoLive={() => navigate('/studio')} onDelete={handleDeleteShow} onEnd={handleEndShow} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Ventas recientes */}
                {data?.recent_sales?.length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <h2 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                      <FiTrendingUp size={14} className="text-green-400" /> Ventas recientes
                    </h2>
                    <div className="space-y-0">
                      {data.recent_sales.slice(0, 8).map((sale, i) => (
                        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${sale.sale_type === 'show' ? 'bg-purple-500/20' : 'bg-pink-500/20'}`}>
                            {sale.sale_type === 'show' ? <FiVideo size={11} className="text-purple-400" /> : <FiImage size={11} className="text-pink-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-300 text-xs font-medium">{sale.sale_type === 'show' ? 'Ticket de show' : 'Foto vendida'}</p>
                            <p className="text-gray-600 text-[10px]">
                              {new Date(sale.purchased_at || sale.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <p className="text-green-400 text-sm font-bold">+${parseFloat(sale.creator_earnings).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ MIS SHOWS ══════════════════════════════════ */}
            {tab === 'shows' && (
              <motion.div key="shows" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white text-lg flex items-center gap-2">
                    <FiVideo size={18} className="text-purple-400" /> Mis Shows
                  </h2>
                  <button onClick={() => navigate('/studio')}
                    className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                  >
                    <FiPlus size={13} /> Crear show
                  </button>
                </div>

                {!data?.shows?.length ? (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-12 text-center">
                    <div className="w-14 h-14 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <FiVideo size={24} className="text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-semibold">Sin shows todavía</p>
                    <p className="text-gray-600 text-sm mt-1 mb-5">Crea tu primer show y empieza a ganar</p>
                    <button onClick={() => navigate('/studio')} className="btn-primary text-sm px-6 py-2.5">
                      Crear primer show
                    </button>
                  </div>
                ) : (
                  <>
                    {/* En vivo ahora */}
                    {data.shows.filter(s => s.status === 'live').length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> En vivo ahora
                        </p>
                        <div className="space-y-2">
                          {data.shows.filter(s => s.status === 'live').map(show => (
                            <ShowRow key={show.id} show={show} onGoLive={() => navigate('/studio')} onDelete={handleDeleteShow} onEnd={handleEndShow} large />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Programados / listos */}
                    {data.shows.filter(s => s.status === 'scheduled').length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Listos para ir en vivo</p>
                        <div className="space-y-2">
                          {data.shows.filter(s => s.status === 'scheduled').map(show => (
                            <ShowRow key={show.id} show={show} onGoLive={() => navigate('/studio')} onDelete={handleDeleteShow} onEnd={handleEndShow} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Finalizados */}
                    {data.shows.filter(s => s.status === 'ended').length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Finalizados</p>
                        <div className="space-y-2">
                          {data.shows.filter(s => s.status === 'ended').slice(0, 10).map(show => (
                            <ShowRow key={show.id} show={show} onGoLive={() => navigate(`/shows/${show.id}`)} onDelete={handleDeleteShow} onEnd={handleEndShow} ended />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══ CONTENIDO ══════════════════════════════════ */}
            {tab === 'content' && (
              <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiImage size={18} className="text-pink-400" /> Contenido
                </h2>

                {/* Fotos de pago */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                      <FiImage size={13} className="text-pink-400" /> Fotos de pago
                      {data?.paid_photos?.length > 0 && <span className="text-xs bg-dark-700 text-gray-400 px-2 py-0.5 rounded-full">{data.paid_photos.length}</span>}
                    </h3>
                    <Link to="/profile" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
                      Gestionar en perfil <FiChevronRight size={10} />
                    </Link>
                  </div>
                  {!data?.paid_photos?.length ? (
                    <div className="py-6 text-center">
                      <p className="text-gray-500 text-sm">Sin fotos de pago</p>
                      <p className="text-gray-600 text-xs mt-1 mb-3">Ve a tu perfil y marca fotos con precio</p>
                      <Link to="/profile" className="text-brand-400 text-xs font-medium hover:underline">Ir a mi perfil →</Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
                      {data.paid_photos.map(photo => (
                        <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
                          <img src={photo.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute bottom-1 left-0 right-0 text-center">
                            <span className="text-white text-[9px] font-bold">${photo.price}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Galerías */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
                    <FiGrid size={13} className="text-brand-400" /> Galerías
                  </h3>

                  {/* Crear galería */}
                  <div className="bg-dark-700/50 rounded-xl p-4 mb-4 space-y-3">
                    <p className="text-xs text-gray-400 font-semibold">Nueva galería</p>
                    <div className="flex gap-2">
                      <input
                        className="input-field flex-1 text-sm"
                        placeholder="Título de la galería"
                        value={newGallery.title}
                        onChange={e => setNewGallery(p => ({ ...p, title: e.target.value }))}
                      />
                      <div className="relative w-28">
                        <FiZap size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-400" />
                        <input
                          type="number" className="input-field pl-7 text-sm w-full" placeholder="Precio"
                          value={newGallery.price_coins}
                          onChange={e => setNewGallery(p => ({ ...p, price_coins: e.target.value }))}
                          min="0"
                        />
                      </div>
                      <button
                        disabled={creatingGallery || !newGallery.title.trim()}
                        onClick={async () => {
                          if (!newGallery.title.trim()) return;
                          setCreatingGallery(true);
                          try {
                            const fd = new FormData();
                            fd.append('title', newGallery.title.trim());
                            fd.append('price_coins', newGallery.price_coins || '0');
                            const { data: res } = await api.post('/api/creator/galleries', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                            setGalleries(prev => [res.gallery, ...(prev||[])]);
                            setNewGallery({ title: '', price_coins: '50' });
                            toast.success('Galería creada');
                          } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
                          finally { setCreatingGallery(false); }
                        }}
                        className="btn-primary px-4 py-2 text-sm disabled:opacity-50 shrink-0"
                      >
                        {creatingGallery ? '…' : 'Crear'}
                      </button>
                    </div>
                  </div>

                  {/* Lista de galerías */}
                  {galleries === null ? (
                    <button onClick={async () => {
                      try {
                        const { supabase: sb } = await import('../lib/supabase.js');
                        const { data: { user: u } } = await sb.auth.getUser();
                        const res = await api.get(`/api/creator/${u.id}/galleries`);
                        setGalleries(res.data.galleries || []);
                      } catch { toast.error('Error al cargar'); }
                    }} className="btn-secondary w-full text-sm py-2">
                      Cargar galerías
                    </button>
                  ) : galleries.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm py-4">Sin galerías aún</p>
                  ) : (
                    <div className="space-y-2">
                      {galleries.map(g => (
                        <div key={g.id} className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-xl">
                          <div className="w-12 h-12 rounded-lg bg-dark-600 overflow-hidden shrink-0">
                            {g.cover_url
                              ? <img src={g.cover_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><FiImage className="text-gray-600" size={16} /></div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{g.title}</p>
                            <p className="text-gray-500 text-xs">{g.items_count||0} items · {g.price_coins>0?`${g.price_coins} coins`:'Gratis'}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => { if (!galleryItemFileRef.current) return; galleryItemFileRef.current.dataset.galleryId = g.id; galleryItemFileRef.current.click(); }}
                              disabled={uploadingItem===g.id}
                              className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center hover:bg-brand-500/30 transition-colors disabled:opacity-50"
                            >
                              {uploadingItem===g.id ? <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"/> : <FiPlus size={13} />}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('¿Eliminar esta galería?')) return;
                                await api.delete(`/api/creator/galleries/${g.id}`);
                                setGalleries(p => p.filter(x => x.id !== g.id));
                                toast.success('Eliminada');
                              }}
                              className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                            >
                              <FiTrash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <input ref={galleryItemFileRef} type="file" accept="image/*,video/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      const gid = e.target.dataset.galleryId;
                      if (!file || !gid) return;
                      e.target.value = '';
                      setUploadingItem(gid);
                      try {
                        const fd = new FormData(); fd.append('media', file);
                        await api.post(`/api/creator/galleries/${gid}/items`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                        setGalleries(prev => prev.map(g => g.id===gid ? {...g, items_count:(g.items_count||0)+1} : g));
                        toast.success('Item añadido');
                      } catch { toast.error('Error al subir'); }
                      finally { setUploadingItem(null); }
                    }}
                  />
                </div>
              </motion.div>
            )}

            {/* ══ ENCARGOS DE VIDEO ════════════════════════════ */}
            {tab === 'packages' && (
              <motion.div key="packages" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiSend size={18} className="text-brand-400" /> Encargos de video
                </h2>
                <VideoPackagesManager />
              </motion.div>
            )}

            {tab === 'gifts' && (
              <motion.div key="gifts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiGift size={18} className="text-brand-400" /> Regalos personalizados
                </h2>
                <CreatorGiftsManager />
              </motion.div>
            )}

            {/* ══ SUSCRIPTORES ═══════════════════════════════ */}
            {tab === 'subscribers' && (
              <motion.div key="subscribers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiUsers size={18} className="text-brand-400" /> Suscriptores
                </h2>

                {subscribers === null ? (
                  <button onClick={async () => {
                    try {
                      const { data } = await api.get('/api/creator/subscribers');
                      setSubscribers(data);
                    } catch { toast.error('Error al cargar'); }
                  }} className="btn-primary w-full">
                    Cargar suscriptores
                  </button>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-dark-800 border border-white/5 p-4 text-center">
                        <p className="text-2xl font-black text-white">{subscribers.count||0}</p>
                        <p className="text-xs text-gray-500 mt-1">Activos</p>
                      </div>
                      <div className="rounded-2xl bg-dark-800 border border-white/5 p-4 text-center">
                        <p className="text-2xl font-black text-green-400">${fmt(subscribers.total_revenue)}</p>
                        <p className="text-xs text-gray-500 mt-1">Bruto / mes</p>
                      </div>
                      <div className="rounded-2xl bg-dark-800 border border-white/5 p-4 text-center">
                        <p className="text-2xl font-black text-brand-400">${fmt((subscribers.total_revenue||0)*0.7)}</p>
                        <p className="text-xs text-gray-500 mt-1">Tu corte / mes</p>
                      </div>
                    </div>

                    {subscribers?.count > 0 && (
                      <div className="rounded-2xl bg-dark-800 border border-brand-500/20 p-5 space-y-3">
                        <p className="text-sm font-semibold text-white flex items-center gap-2"><FiSend size={13} className="text-brand-400" /> Mensaje masivo</p>
                        <textarea
                          className="input-field text-sm resize-none w-full"
                          rows={3}
                          placeholder={broadcastPpv ? 'Tu mensaje (los subs deben pagar para verlo)…' : 'Escribe un mensaje para todos tus suscriptores…'}
                          value={broadcastMsg}
                          onChange={e => setBroadcastMsg(e.target.value.slice(0, 1000))}
                          maxLength={1000}
                        />

                        {/* Toggle PPV */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBroadcastPpv(v => !v)}
                            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                              broadcastPpv
                                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                                : 'bg-dark-700 text-gray-400 hover:text-white border border-transparent'
                            }`}
                          >
                            💎 {broadcastPpv ? 'PPV ACTIVO' : 'Hacer PPV (cobrar para ver)'}
                          </button>
                          {broadcastPpv && (
                            <div className="relative w-24 shrink-0">
                              <input
                                type="number" min="1" max="9999"
                                value={broadcastPrice}
                                onChange={e => setBroadcastPrice(e.target.value)}
                                className="input-field text-sm py-2 pl-7 w-full"
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400 text-xs">⚡</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{broadcastMsg.length}/1000</span>
                          <button onClick={handleBroadcast} disabled={sending||!broadcastMsg.trim()}
                            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                          >
                            {sending ? 'Enviando…' : broadcastPpv ? `Enviar PPV a ${subscribers.count}` : `Enviar a ${subscribers.count} subs`}
                          </button>
                        </div>
                        {broadcastPpv && (
                          <p className="text-[10px] text-gray-500">
                            💡 Si todos pagan: ~${(subscribers.count * (broadcastPrice || 0) * 0.05 * 0.7).toFixed(2)} para ti (70% de ${(subscribers.count * (broadcastPrice || 0) * 0.05).toFixed(2)})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Niveles de suscripción (tiers) */}
                    <div className="card p-4">
                      <TierManager />
                    </div>

                    {/* CCBill (solo creators adultos) */}
                    {profile?.is_adult_creator && <CCBillSetup />}

                    {/* Tip menu / wishlist */}
                    <TipMenuManager />

                    {(subscribers.subscribers||[]).length === 0 ? (
                      <p className="text-center text-gray-600 py-8">Aún no tienes suscriptores</p>
                    ) : (
                      <div className="rounded-2xl bg-dark-800 border border-white/5 divide-y divide-white/5">
                        {(subscribers.subscribers||[]).map(sub => (
                          <div key={sub.id} className="flex items-center gap-3 p-4">
                            <img src={sub.subscriber?.avatar_url||`https://ui-avatars.com/api/?name=${encodeURIComponent(sub.subscriber?.full_name||'U')}&size=80&background=1a1a2e&color=f43f5e`}
                              alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-semibold truncate">{sub.subscriber?.full_name}</p>
                              <p className="text-gray-500 text-xs">Desde {new Date(sub.created_at).toLocaleDateString('es',{month:'short',year:'numeric'})}</p>
                            </div>
                            <p className="text-green-400 text-sm font-bold shrink-0">${fmt(sub.subscription_price)}/mes</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══ INGRESOS ═══════════════════════════════════ */}
            {tab === 'earnings' && (
              <motion.div key="earnings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiDollarSign size={18} className="text-green-400" /> Ingresos y retiros
                </h2>

                {/* Balance */}
                <div className="rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Disponible para retirar</p>
                      <p className="text-3xl font-black text-white">${fmt(available)}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>Total ganado: ${fmt(data?.earnings?.total_earned)}</span>
                        {breakdown && (
                          <span>Últimos {breakdown.days}d: <span className="text-white font-semibold">${fmt(breakdown.total_current)}</span></span>
                        )}
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center">
                      <FiArrowDown size={20} className="text-green-400" />
                    </div>
                  </div>

                  {/* Aviso de desync — el balance no refleja todo lo cobrado */}
                  {breakdown && parseFloat(breakdown.total_current || 0) > 0 &&
                   parseFloat(data?.earnings?.total_earned || 0) === 0 && (
                    <div className="mt-3 pt-3 border-t border-green-500/20">
                      <p className="text-yellow-300 text-xs mb-2">
                        ⚠ Detectamos ingresos que no se reflejan en tu balance. Sincroniza para corregir.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const { data: r } = await api.post('/api/creator/sync-earnings');
                            toast.success(`Balance actualizado: $${r.total_earned}`);
                            loadDashboard(true);
                          } catch {
                            toast.error('Error al sincronizar');
                          }
                        }}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-bold px-3 py-1.5 rounded-xl"
                      >
                        Sincronizar balance
                      </button>
                    </div>
                  )}
                </div>

                {/* Desglose por tipo — UNIFICADO (7 categorías) */}
                {breakdown?.totals_usd && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                        <FiBarChart2 size={13} className="text-brand-400" /> Ingresos por tipo (30 días)
                      </h3>
                      {parseFloat(breakdown.total_previous || 0) === 0 && parseFloat(breakdown.total_current || 0) > 0 ? (
                        <span className="text-xs font-bold text-brand-400">🎉 Primer período</span>
                      ) : breakdown.pct_change !== 0 ? (
                        <span className={`text-xs font-bold ${breakdown.pct_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {breakdown.pct_change > 0 ? '↑' : '↓'} {Math.abs(breakdown.pct_change)}% vs anterior
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      {[
                        { key: 'show_tickets',   label: 'Tickets de shows',    color: 'bg-purple-500' },
                        { key: 'show_tips',      label: 'Propinas en shows',   color: 'bg-green-500' },
                        { key: 'show_gifts',     label: 'Regalos en shows',    color: 'bg-yellow-500' },
                        { key: 'photo_sales',    label: 'Ventas de contenido', color: 'bg-pink-500' },
                        { key: 'video_requests', label: 'Encargos de video',   color: 'bg-orange-500' },
                        { key: 'subscriptions',  label: 'Suscripciones',       color: 'bg-blue-500' },
                        { key: 'gallery_sales',  label: 'Galerías',            color: 'bg-cyan-500' },
                      ].map(item => {
                        const value = parseFloat(breakdown.totals_usd[item.key] || 0);
                        const total = breakdown.total_current || 1;
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        if (value === 0 && total > 0) return null;
                        return (
                          <div key={item.key}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-400">{item.label}</span>
                              <span className="text-white font-semibold">${value.toFixed(2)} <span className="text-gray-600">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                              <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8,ease:'easeOut'}}
                                className={`h-full rounded-full ${item.color}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-3 text-right">
                      Tasa: {breakdown.coin_rate?.coins_per_usd ?? 25} coins ≈ $1 USD · creador recibe {Math.round((breakdown.coin_rate?.creator_cut ?? 0.7) * 100)}%
                    </p>
                  </div>
                )}

                {/* Historial de ingresos unificado */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2"><FiStar size={13} className="text-yellow-400"/> Ingresos recientes</h3>
                    <span className="text-gray-500 text-[10px]">{incomeFeed.length} entradas</span>
                  </div>
                  {incomeFeed.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm py-4">Sin ingresos aún</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-0">
                      {incomeFeed.map(item => {
                        const iconMap = {
                          show_tip: '💰', show_gift: '🎁', show_ticket: '🎟',
                          profile_tip: '💝', content_sale: '🖼', video_request: '🎬',
                        };
                        return (
                          <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                            <img src={item.from?.avatar_url||`https://ui-avatars.com/api/?name=${encodeURIComponent(item.from?.full_name||'U')}&size=60&background=1a1a2e&color=f43f5e`}
                              className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate flex items-center gap-1">
                                <span>{iconMap[item.type] || '⚡'}</span>
                                {item.from?.full_name || 'Usuario'}
                                <span className="text-gray-500 font-normal">· {item.title}</span>
                              </p>
                              {item.message && <p className="text-gray-500 text-xs truncate">"{item.message}"</p>}
                              {item.subtitle && !item.message && <p className="text-gray-600 text-[10px] truncate">{item.subtitle}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-green-400 text-xs font-bold">${item.usd.toFixed(2)}</p>
                              {item.coins && <p className="text-yellow-500 text-[10px]">⚡{item.coins}</p>}
                              <p className="text-gray-600 text-[10px]">{new Date(item.at).toLocaleDateString('es', { day:'numeric', month:'short' })}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Retiro */}
                {!isStripeActive ? (
                  <div className="rounded-2xl bg-yellow-500/5 border border-yellow-500/20 p-5 flex items-start gap-3">
                    <FiCreditCard size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-yellow-300 font-semibold text-sm">Cuenta Stripe no configurada</p>
                      <p className="text-gray-400 text-xs mt-1 mb-3">Necesitas conectar Stripe para recibir pagos directos</p>
                      <Link to="/become-creator" className="inline-flex items-center gap-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors">
                        <FiArrowUpRight size={12} /> Conectar Stripe
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5 space-y-4">
                    <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
                      <FiCreditCard size={13} className="text-brand-400" /> Retirar a Stripe
                    </h3>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                        <input className="input-field pl-7" type="number" placeholder="Mínimo $10"
                          min="10" step="0.01"
                          value={withdrawForm.amount}
                          onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))}
                        />
                      </div>
                      <button onClick={() => setWithdrawForm(f => ({...f, amount: fmt(available)}))}
                        className="px-3 text-xs bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white rounded-xl transition-colors">
                        Todo
                      </button>
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={submittingWithdrawal || !withdrawForm.amount || parseFloat(withdrawForm.amount)<10 || parseFloat(withdrawForm.amount)>available}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {submittingWithdrawal
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><FiArrowDown size={14} /> Retirar con Stripe</>
                      }
                    </button>
                    <p className="text-gray-600 text-xs text-center">Stripe transfiere directo a tu banco · 2-7 días hábiles</p>
                  </div>
                )}

                {/* Pagos automáticos (auto-payout) */}
                {autoPayout?.stripe_connected && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                          <FiZap size={13} className="text-yellow-400" /> Pagos automáticos
                        </h3>
                        <p className="text-gray-500 text-xs mt-1">Te transferimos automáticamente cuando tu balance supere el umbral</p>
                      </div>
                      <button
                        onClick={async () => {
                          setSavingAutoPayout(true);
                          try {
                            const { data: r } = await api.patch('/api/withdrawals/auto-payout', {
                              enabled: !autoPayout.enabled,
                              min_usd: autoPayout.min_usd,
                            });
                            setAutoPayout(a => ({ ...a, enabled: r.auto_payout_enabled }));
                            toast.success(r.auto_payout_enabled ? 'Pagos automáticos activados' : 'Pagos automáticos desactivados');
                          } catch (err) {
                            toast.error(err.response?.data?.error || 'Error');
                          } finally {
                            setSavingAutoPayout(false);
                          }
                        }}
                        disabled={savingAutoPayout}
                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${autoPayout.enabled ? 'bg-brand-500' : 'bg-dark-600'}`}
                      >
                        <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${autoPayout.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    {autoPayout.enabled && (
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <span className="text-xs text-gray-400">Umbral mínimo:</span>
                        <div className="relative flex-1 max-w-[120px]">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            className="input-field pl-5 py-1.5 text-xs"
                            type="number" min="10" max="10000" step="10"
                            defaultValue={autoPayout.min_usd}
                            onBlur={async (e) => {
                              const val = parseFloat(e.target.value);
                              if (val >= 10 && val <= 10000 && val !== autoPayout.min_usd) {
                                try {
                                  await api.patch('/api/withdrawals/auto-payout', { enabled: true, min_usd: val });
                                  setAutoPayout(a => ({ ...a, min_usd: val }));
                                  toast.success(`Umbral actualizado: $${val}`);
                                } catch {
                                  toast.error('Error actualizando umbral');
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {autoPayout.last_payout_at && (
                      <p className="text-[10px] text-gray-600">
                        Último payout automático: {new Date(autoPayout.last_payout_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}

                {/* Historial retiros */}
                {data?.payouts?.length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <h3 className="font-semibold text-white text-sm mb-4">Historial de retiros</h3>
                    <div className="space-y-0">
                      {data.payouts.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${p.status==='completed'?'bg-green-500/15':'bg-yellow-500/10'}`}>
                            <FiArrowDown size={13} className={p.status==='completed'?'text-green-400':'text-yellow-400'} />
                          </div>
                          <div className="flex-1">
                            <p className="text-white text-sm font-bold">${parseFloat(p.amount).toFixed(2)}</p>
                            <p className="text-gray-600 text-xs">{new Date(p.created_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})}</p>
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${p.status==='completed'?'bg-green-500/15 text-green-400':p.status==='processing'?'bg-blue-500/15 text-blue-400':'bg-yellow-500/15 text-yellow-400'}`}>
                            {p.status==='completed'?'Completado':p.status==='processing'?'Procesando':'Pendiente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ ANALYTICS ══════════════════════════════════ */}
            {tab === 'analytics' && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-white text-lg flex items-center gap-2">
                    <FiBarChart2 size={18} className="text-brand-400" /> Analytics
                  </h2>
                  <button onClick={handleExportCsv} disabled={exporting}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-dark-700 text-gray-300 hover:text-white hover:bg-dark-600 transition-colors disabled:opacity-50 border border-white/10"
                  >
                    <FiArrowDown size={12} /> {exporting?'Exportando…':'Exportar CSV'}
                  </button>
                </div>

                {/* Aviso de desync del balance */}
                {breakdown && parseFloat(breakdown.total_current || 0) > 0 &&
                 parseFloat(data?.earnings?.total_earned || 0) === 0 && (
                  <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-4 flex items-start gap-3">
                    <FiAlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-yellow-300 text-sm font-semibold mb-1">Balance desincronizado</p>
                      <p className="text-gray-400 text-xs mb-3">Detectamos ingresos por ${fmt(breakdown.total_current)} que no se reflejan en tu balance de retiro.</p>
                      <button
                        onClick={async () => {
                          try {
                            const { data: r } = await api.post('/api/creator/sync-earnings');
                            toast.success(`Balance actualizado: $${r.total_earned}`);
                            loadDashboard(true);
                          } catch {
                            toast.error('Error al sincronizar');
                          }
                        }}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-bold px-3 py-1.5 rounded-xl"
                      >
                        Sincronizar balance
                      </button>
                    </div>
                  </div>
                )}

                {/* Suscriptores */}
                <div className="rounded-2xl bg-gradient-to-r from-brand-500/10 to-purple-500/5 border border-brand-500/20 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Suscriptores activos</p>
                      <p className="text-4xl font-black text-white">{breakdown?.subscribers_active ?? analytics?.subscribers ?? 0}</p>
                    </div>
                    <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center">
                      <FiUsers size={24} className="text-brand-400" />
                    </div>
                  </div>
                </div>

                {/* Totales 30d — 7 categorías con detalle (count + avg + max) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'show_tickets',   label: 'Tickets shows', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: FiVideo,  noun: 'ticket' },
                    { key: 'show_tips',      label: 'Propinas',      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: FiStar,   noun: 'propina' },
                    { key: 'show_gifts',     label: 'Regalos',       color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: FiGift,   noun: 'regalo' },
                    { key: 'photo_sales',    label: 'Contenido',     color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20',     icon: FiImage,  noun: 'venta' },
                    { key: 'video_requests', label: 'Encargos',      color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: FiPlay,   noun: 'encargo' },
                    { key: 'subscriptions',  label: 'Suscripciones', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     icon: FiUsers,  noun: 'sub' },
                  ].map(s => {
                    const d = breakdown?.breakdown_detail?.[s.key];
                    const value = parseFloat(d?.total_usd ?? breakdown?.totals_usd?.[s.key] ?? 0);
                    const count = d?.count ?? 0;
                    const avg   = d?.avg_usd ?? 0;
                    const max   = d?.max_usd ?? 0;
                    return (
                      <div key={s.key} className={`rounded-2xl border p-4 ${s.bg}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <s.icon size={11} className={s.color} />
                          <p className="text-gray-500 text-xs">{s.label}</p>
                        </div>
                        <p className={`text-xl font-black ${s.color}`}>${value.toFixed(2)}</p>
                        {count > 0 ? (
                          <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-500">
                            <p>{count} {s.noun}{count !== 1 ? 's' : ''} · prom. <span className="text-gray-300">${avg.toFixed(2)}</span></p>
                            <p>Mejor: <span className="text-gray-300">${max.toFixed(2)}</span></p>
                          </div>
                        ) : (
                          <p className="mt-1.5 text-[10px] text-gray-600">Sin transacciones</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Top fans del período */}
                {breakdown?.top_fans?.length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                      <FiStar size={13} className="text-yellow-400" /> Top fans · últimos {breakdown.days}d
                    </h3>
                    <div className="space-y-2">
                      {breakdown.top_fans.map((fan, i) => (
                        <div key={fan.id} className="flex items-center gap-3 bg-dark-700/60 rounded-xl p-2.5">
                          <span className={`w-6 text-center font-black ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-600'} text-sm shrink-0`}>
                            {i + 1}
                          </span>
                          <img src={fan.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fan.name || 'U')}&size=60&background=1a1a2e&color=f43f5e`}
                            className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{fan.name || 'Anónimo'}</p>
                            <p className="text-gray-500 text-[10px]">{fan.count} contribucion{fan.count !== 1 ? 'es' : ''}</p>
                          </div>
                          <p className="text-green-400 text-sm font-bold shrink-0">${fan.total_usd.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top shows que más generaron */}
                {breakdown?.top_shows?.length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                      <FiTrendingUp size={13} className="text-purple-400" /> Shows que más generaron · últimos {breakdown.days}d
                    </h3>
                    <div className="space-y-2">
                      {breakdown.top_shows.map((show, i) => (
                        <div key={show.show_id} className="flex items-center gap-3 bg-dark-700/60 rounded-xl p-2.5">
                          <span className={`w-6 text-center font-black ${i === 0 ? 'text-yellow-400' : 'text-gray-500'} text-sm shrink-0`}>
                            #{i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{show.title}</p>
                            <p className="text-gray-500 text-[10px]">{show.count} transaccion{show.count !== 1 ? 'es' : ''}</p>
                          </div>
                          <p className="text-green-400 text-sm font-bold shrink-0">${show.total_usd.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chart */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                      <FiBarChart2 size={13} className="text-brand-400" /> Últimos {breakdown?.days ?? 30} días
                    </h3>
                    <div className="text-right">
                      <span className="text-brand-400 font-black text-xl">${fmt(breakdown?.total_current ?? analytics?.totals?.thirty_days)}</span>
                      {breakdown && (
                        <>
                          {parseFloat(breakdown.total_previous || 0) === 0 && parseFloat(breakdown.total_current || 0) > 0 ? (
                            <p className="text-[10px] font-bold text-brand-400">🎉 Primer período con ingresos</p>
                          ) : breakdown.pct_change !== 0 ? (
                            <p className={`text-[10px] font-bold ${breakdown.pct_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {breakdown.pct_change > 0 ? '↑' : '↓'} {Math.abs(breakdown.pct_change)}% vs anterior
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs mb-4">Ingresos netos ({Math.round((breakdown?.coin_rate?.creator_cut ?? 0.7) * 100)}% tuyo)</p>
                  {(breakdown?.chart || analytics?.chart)?.length > 0
                    ? <BarChart data={breakdown?.chart || analytics.chart} />
                    : <div className="h-14 flex items-center justify-center"><p className="text-gray-600 text-xs">Sin datos en este período</p></div>
                  }
                </div>

                {/* Rendimiento por show — usa tasa del backend */}
                {data?.shows?.filter(s=>s.status==='ended').length > 0 && (
                  <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                    <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                      <FiVideo size={13} className="text-purple-400" /> Rendimiento por show
                    </h3>
                    <div className="space-y-2">
                      {data.shows.filter(s=>s.status==='ended').slice(0,8).map((show,i) => {
                        const durationMin = show.started_at && show.ended_at
                          ? Math.round((new Date(show.ended_at)-new Date(show.started_at))/60000) : null;
                        const coinUsd = breakdown?.coin_rate?.usd_per_coin ?? 0.04;
                        const cut     = breakdown?.coin_rate?.creator_cut  ?? 0.70;
                        const usd = ((show.total_coins_earned||0) * coinUsd * cut).toFixed(2);
                        return (
                          <div key={show.id||i} className="bg-dark-700/60 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-white text-sm font-semibold truncate flex-1">{show.title}</p>
                              <span className="text-green-400 font-bold text-sm shrink-0">${usd}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><FiUsers size={10} /> {show.viewer_count||0} viewers</span>
                              <span className="flex items-center gap-1"><FiTrendingUp size={10} /> pico {show.peak_viewers||0}</span>
                              {durationMin !== null && <span className="flex items-center gap-1"><FiClock size={10} /> {durationMin}m</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Story analytics */}
                <StoryAnalyticsCard />
              </motion.div>
            )}

            {/* ══ AJUSTES ════════════════════════════════════ */}
            {tab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <FiSettings size={18} className="text-gray-400" /> Ajustes del estudio
                </h2>

                {/* Bio */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                    <FiEdit3 size={13} className="text-brand-400" /> Bio de creador
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Aparece en tu perfil público como creador.</p>
                  <textarea
                    className="input-field resize-none text-sm w-full"
                    rows={3}
                    placeholder="Ej: Modelo fitness, shows de baile y yoga en vivo todos los martes…"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    maxLength={300}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-gray-600 text-xs">{bio.length}/300</p>
                    <button onClick={handleSaveBio} disabled={savingBio}
                      className="btn-primary text-xs px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {savingBio ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/> : <FiCheck size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>

                {/* Precio suscripción */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                    <FiDollarSign size={13} className="text-green-400" /> Suscripción mensual
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Cobra a tus fans por acceso a contenido exclusivo.</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                      <input className="input-field pl-7" type="number" placeholder="Ej: 9.99"
                        value={subPrice} onChange={e => setSubPrice(e.target.value)} min="1" max="500" step="0.01" />
                    </div>
                    <button onClick={handleSaveSubPrice} disabled={savingPrice}
                      className="btn-primary px-4 disabled:opacity-50"
                    >{savingPrice?'…':'Guardar'}</button>
                  </div>
                  {subPrice && <p className="text-gray-500 text-xs mt-2">Tus fans pagan ${parseFloat(subPrice||0).toFixed(2)}/mes · tú recibes ${(parseFloat(subPrice||0)*0.7).toFixed(2)}</p>}
                </div>

                {/* Modo adulto */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <FiShield size={14} className="text-red-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-white text-sm">Modo adulto (18+)</h3>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            Habilita contenido 18+ en shows y fotos.{' '}
                            <strong className="text-gray-400">Tu perfil no aparecerá en matches.</strong>
                          </p>
                        </div>
                        <Toggle value={!!profile?.is_adult_creator} onChange={handleToggleAdult} accent="red" />
                      </div>
                      {profile?.is_adult_creator && (
                        <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}}
                          className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-xl"
                        >
                          <p className="text-red-300 text-xs font-medium">Modo adulto activo</p>
                          <p className="text-gray-500 text-xs mt-0.5">Puedes publicar contenido 18+. Tu perfil está excluido del matching.</p>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stripe status */}
                <div className={`rounded-2xl border p-5 ${isStripeActive?'border-green-500/20 bg-green-500/5':'border-yellow-500/20 bg-yellow-500/5'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isStripeActive?'bg-green-500/20':'bg-yellow-500/20'}`}>
                      <FiDollarSign size={16} className={isStripeActive?'text-green-400':'text-yellow-400'} />
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${isStripeActive?'text-green-300':'text-yellow-300'}`}>
                        {isStripeActive?'Cuenta de pagos activa':'Cuenta de pagos no configurada'}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {isStripeActive?'Puedes cobrar y retirar ganancias':'Configura Stripe para recibir pagos'}
                      </p>
                    </div>
                    {!isStripeActive && (
                      <Link to="/become-creator"
                        className="shrink-0 flex items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                      >
                        Configurar <FiChevronRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Quick links */}
                <div className="rounded-2xl bg-dark-800 border border-white/5 p-5">
                  <h3 className="font-semibold text-white text-sm mb-3">Accesos rápidos</h3>
                  <div className="space-y-1">
                    {[
                      { label: 'Ver mi perfil público', to: `/profile/${profile?.id}`, icon: FiStar, color: 'text-brand-400' },
                      { label: 'Gestionar fotos de perfil', to: '/profile', icon: FiImage, color: 'text-pink-400' },
                      { label: 'Explorar shows en vivo', to: '/shows', icon: FiVideo, color: 'text-purple-400' },
                    ].map(({ label, to, icon: Icon, color }) => (
                      <Link key={to} to={to}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-700 transition-colors group"
                      >
                        <Icon size={15} className={color} />
                        <span className="text-gray-300 text-sm flex-1">{label}</span>
                        <FiChevronRight size={13} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                      </Link>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

/* ── Show Row Component ───────────────────────────────────── */
function ShowRow({ show, onGoLive, onDelete, onEnd, large, ended }) {
  const cat = SHOW_CATEGORIES.find(c => c.key === show.category);
  const durationMin = show.started_at && show.ended_at
    ? Math.round((new Date(show.ended_at) - new Date(show.started_at)) / 60000) : null;
  const usd = ((show.total_coins_earned || 0) * 0.04 * 0.7).toFixed(2);

  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
      show.status === 'live'
        ? 'bg-green-500/5 border-green-500/20'
        : show.status === 'scheduled'
        ? 'bg-dark-700/60 border-white/5 hover:border-white/10'
        : 'bg-dark-700/30 border-white/5'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${
        show.status === 'live' ? 'bg-green-500/20' : 'bg-purple-500/10'
      }`}>
        {show.status === 'live' ? '🔴' : (cat?.emoji || '🎥')}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-semibold truncate">{show.title}</p>
          <ShowStatusBadge status={show.status} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span>{show.show_type === 'broadcast' ? 'Broadcast' : 'Privado'}</span>
          {show.ticket_price > 0 && <span>· ${show.ticket_price}</span>}
          {show.viewer_count > 0 && <span>· {show.viewer_count} viewers</span>}
          {durationMin !== null && <span>· {durationMin}m</span>}
          {ended && parseFloat(usd) > 0 && <span className="text-green-400 font-medium">· ${usd}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!ended && (
          <>
            <button
              onClick={onGoLive}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                show.status === 'live'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-brand-500 hover:bg-brand-600 text-white'
              }`}
            >
              <FiPlay size={11} />
              {show.status === 'live' ? 'Entrar' : 'Ir en vivo'}
            </button>
            {show.status === 'live' && onEnd && (
              <button
                onClick={() => onEnd(show.id)}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-all"
                title="Terminar show"
              >
                <FiX size={11} /> Terminar
              </button>
            )}
          </>
        )}
        {ended && (
          <Link to={`/shows/${show.id}`}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white bg-dark-600 hover:bg-dark-500 transition-colors"
          >
            Ver
          </Link>
        )}
        <button
          onClick={() => onDelete(show.id)}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          title="Eliminar"
        >
          <FiTrash2 size={13} />
        </button>
      </div>
    </div>
  );
}
