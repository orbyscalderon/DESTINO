import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDollarSign, FiVideo, FiImage, FiPlus, FiArrowUpRight,
  FiTrendingUp, FiAlertCircle, FiUsers, FiBarChart2, FiSettings,
  FiGrid, FiEdit3, FiCheck, FiX, FiCalendar, FiClock,
  FiStar, FiZap, FiShield, FiChevronRight, FiRefreshCw,
  FiCreditCard, FiArrowDown,
} from 'react-icons/fi';
import { useAuthStore } from '../store/authStore.js';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { SHOW_CATEGORIES } from './LiveShows.jsx';
import VerifiedBadge from '../components/ui/VerifiedBadge.jsx';

/* ── Helpers ──────────────────────────────────────────────── */
const fmt = (v) => parseFloat(v || 0).toFixed(2);
const fmtShort = (v) => {
  const n = parseFloat(v || 0);
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
};

/* ── Stat Card ────────────────────────────────────────────── */
function StatCard({ label, value, sub, accent, icon: Icon }) {
  const colors = {
    green:  { bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400' },
    blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   text: 'text-blue-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
    pink:   { bg: 'bg-pink-500/10',   border: 'border-pink-500/20',   text: 'text-pink-400' },
    brand:  { bg: 'bg-brand-500/10',  border: 'border-brand-500/20',  text: 'text-brand-400' },
  };
  const c = colors[accent] || colors.brand;
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`card p-4 ${c.border} ${c.bg} relative overflow-hidden`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className={`text-2xl font-black ${c.text}`}>{fmtShort(value)}</p>
          {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon size={16} className={c.text} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Toggle Switch ────────────────────────────────────────── */
function Toggle({ value, onChange, accent = 'brand' }) {
  const colors = { brand: 'bg-brand-500', red: 'bg-red-500', green: 'bg-green-500' };
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${value ? (colors[accent] || colors.brand) : 'bg-dark-600'}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${value ? 'left-7' : 'left-1'}`} />
    </button>
  );
}

/* ── Show Status Badge ────────────────────────────────────── */
function ShowBadge({ status }) {
  const map = {
    live:      { label: 'En vivo',    cls: 'bg-green-500/20 text-green-400 border border-green-500/30' },
    scheduled: { label: 'Programado', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
    ended:     { label: 'Finalizado', cls: 'bg-dark-600 text-gray-500' },
  };
  const b = map[status] || map.ended;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${b.cls}`}>
      {b.label}
    </span>
  );
}

/* ── Galleries Manager ────────────────────────────────────── */
function GalleriesManager({ galleries, setGalleries, galleryItemFileRef, uploadingItem, setUploadingItem }) {
  if (!galleries?.length) return <p className="text-center text-gray-600 py-10">No tienes galerías aún</p>;

  const handleAddItem = (galleryId) => {
    if (!galleryItemFileRef.current) return;
    galleryItemFileRef.current.dataset.galleryId = galleryId;
    galleryItemFileRef.current.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    const galleryId = e.target.dataset.galleryId;
    if (!file || !galleryId) return;
    e.target.value = '';
    setUploadingItem(galleryId);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const { data } = await import('../lib/api.js').then(m => m.default.post(`/api/creator/galleries/${galleryId}/items`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
      setGalleries(prev => prev.map(g => g.id === galleryId ? { ...g, items_count: (g.items_count || 0) + 1, cover_url: g.cover_url || data.item?.media_url } : g));
      const { toast } = await import('react-hot-toast');
      toast.success('Item añadido');
    } catch (err) {
      const { toast } = await import('react-hot-toast');
      toast.error('Error al subir');
    } finally {
      setUploadingItem(null);
    }
  };

  return (
    <div className="space-y-3">
      {galleries.map(g => (
        <div key={g.id} className="card p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-dark-700 overflow-hidden shrink-0">
            {g.cover_url
              ? <img src={g.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              : <div className="w-full h-full flex items-center justify-center"><FiImage className="text-gray-600" size={20} /></div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{g.title}</p>
            <p className="text-gray-500 text-xs">{g.items_count || 0} items · {g.price_coins > 0 ? `${g.price_coins} monedas` : 'Gratis'}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleAddItem(g.id)}
              disabled={uploadingItem === g.id}
              className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center hover:bg-brand-500/30 transition-colors disabled:opacity-50"
              title="Añadir item"
            >
              {uploadingItem === g.id
                ? <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                : <FiPlus size={14} />
              }
            </button>
            <button
              onClick={async () => {
                if (!confirm('¿Eliminar esta galería y todos sus items?')) return;
                try {
                  await import('../lib/api.js').then(m => m.default.delete(`/api/creator/galleries/${g.id}`));
                  setGalleries(prev => prev.filter(x => x.id !== g.id));
                  const { toast } = await import('react-hot-toast');
                  toast.success('Galería eliminada');
                } catch {
                  const { toast } = await import('react-hot-toast');
                  toast.error('Error al eliminar');
                }
              }}
              className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
              title="Eliminar galería"
            >
              <FiX size={14} />
            </button>
          </div>
        </div>
      ))}
      <input
        ref={galleryItemFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}

/* ── Mini Bar Chart ───────────────────────────────────────── */
function BarChart({ data }) {
  if (!data?.length) return null;
  const visible = data.slice(-14);
  const max = Math.max(...visible.map(d => d.amount), 0.01);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {visible.map((d, i) => {
        const pct = (d.amount / max) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all"
            style={{
              height: `${Math.max(pct, 3)}%`,
              background: `rgba(139,92,246,${0.3 + (pct / 100) * 0.7})`,
            }}
            title={`${d.date}: $${d.amount}`}
          />
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function CreatorDashboard() {
  const { profile, user, fetchProfile } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData]             = useState(null);
  const [analytics, setAnalytics]   = useState(null);
  const [postAnalytics, setPostAnalytics] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [tab, setTab] = useState('overview');

  // Subscribers
  const [subscribers, setSubscribers] = useState(null); // null = not loaded yet

  // Galleries
  const [galleries, setGalleries]     = useState(null);
  const [newGallery, setNewGallery]   = useState({ title: '', description: '', price_coins: '50' });
  const [creatingGallery, setCreatingGallery] = useState(false);
  const [galleryFile, setGalleryFile] = useState(null);
  const galleryFileRef = useRef(null);
  const galleryItemFileRef = useRef(null);
  const [uploadingItem, setUploadingItem] = useState(null); // galleryId

  // Broadcast to subscribers
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [sending, setSending]           = useState(false);
  // CSV export
  const [exporting, setExporting]       = useState(false);

  // Withdrawals
  const [earnings, setEarnings]       = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', payout_method: 'bank', payout_details: '' });
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  // Create show modal
  const [showModal, setShowModal] = useState(false);
  const [newShow, setNewShow] = useState({
    title: '', description: '', show_type: 'broadcast',
    ticket_price: '', category: 'chat', scheduled_at: '', tip_goal: '',
  });
  const [creatingShow, setCreatingShow] = useState(false);

  // Settings state
  const [subPrice, setSubPrice]     = useState('');
  const [bio, setBio]               = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingBio, setSavingBio]   = useState(false);
  const bioRef = useRef(null);

  /* ── onboarding complete ── */
  useEffect(() => {
    if (searchParams.get('onboarding') === 'complete') {
      fetchProfile(user?.id);
      toast.success('¡Pagos configurados correctamente!');
    }
  }, []);

  /* ── guard ── */
  useEffect(() => {
    if (!profile?.is_creator) {
      navigate('/become-creator');
      return;
    }
    loadDashboard();
  }, [profile?.is_creator]);

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [dashRes, analyticsRes, postAnalyticsRes, earningsRes, withdrawalsRes] = await Promise.all([
        api.get('/api/creator/dashboard'),
        api.get('/api/creator/analytics'),
        api.get('/api/creator/post-analytics').catch(() => ({ data: null })),
        api.get('/api/withdrawals/earnings').catch(() => ({ data: null })),
        api.get('/api/withdrawals').catch(() => ({ data: [] })),
      ]);
      setData(dashRes.data);
      setAnalytics(analyticsRes.data);
      setPostAnalytics(postAnalyticsRes.data);
      setSubPrice(dashRes.data.profile?.creator_subscription_price ?? '');
      setBio(dashRes.data.profile?.creator_bio ?? '');
      setEarnings(earningsRes.data);
      setWithdrawals(withdrawalsRes.data?.withdrawals || []);
    } catch {
      toast.error('Error al cargar el panel');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /* ── handlers ── */
  const handlePayout = async () => {
    const available = parseFloat(data?.earnings?.available_balance || 0);
    if (available < 10) { toast.error('Mínimo $10 para retirar'); return; }
    setPayoutLoading(true);
    try {
      const { data: res } = await api.post('/api/creator/payout', { amount: available });
      toast.success(`Retiro de $${res.amount.toFixed(2)} procesado`);
      loadDashboard(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al retirar');
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleCreateShow = async () => {
    if (!newShow.title.trim()) { toast.error('El título es obligatorio'); return; }
    setCreatingShow(true);
    try {
      await api.post('/api/shows', {
        ...newShow,
        ticket_price: parseFloat(newShow.ticket_price) || 0,
        tip_goal: parseFloat(newShow.tip_goal) || null,
        scheduled_at: newShow.scheduled_at || undefined,
      });
      toast.success('Show creado exitosamente');
      setShowModal(false);
      setNewShow({ title: '', description: '', show_type: 'broadcast', ticket_price: '', category: 'chat', scheduled_at: '', tip_goal: '' });
      loadDashboard(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear el show');
    } finally {
      setCreatingShow(false);
    }
  };

  const handleSubmitWithdrawal = async () => {
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount < 10) { toast.error('Mínimo $10 para retirar'); return; }
    setSubmittingWithdrawal(true);
    try {
      const { data: res } = await api.post('/api/creator/payout', { amount });
      toast.success(`Retiro de $${res.amount?.toFixed(2)} procesado por Stripe`);
      setWithdrawForm(f => ({ ...f, amount: '' }));
      loadDashboard(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar el retiro');
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const handleSaveSubPrice = async () => {
    setSavingPrice(true);
    try {
      await api.put('/api/creator/subscription-price', { price: parseFloat(subPrice) || null });
      toast.success('Precio de suscripción actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await api.put('/api/creator/bio', { creator_bio: bio });
      toast.success('Bio actualizada');
    } catch {
      toast.error('Error al guardar la bio');
    } finally {
      setSavingBio(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setSending(true);
    try {
      const { data: res } = await api.post('/api/creator/subscribers/broadcast', { message: broadcastMsg.trim() });
      toast.success(`Mensaje enviado a ${res.sent} suscriptores`);
      setBroadcastMsg('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await api.get('/api/creator/analytics/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'analytics.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const handleToggleAdult = async () => {
    const enabled = !profile?.is_adult_creator;
    try {
      await api.put('/api/creator/adult-mode', { enabled });
      await fetchProfile(user?.id);
      toast.success(enabled ? 'Modo adulto activado' : 'Modo adulto desactivado');
    } catch { toast.error('Error al cambiar el modo'); }
  };

  /* ── derived ── */
  const isStripeActive = profile?.stripe_account_status === 'active';
  const available      = parseFloat(data?.earnings?.available_balance || 0);
  const payoutPct      = Math.min((available / 10) * 100, 100);

  /* ── loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Cargando panel...</p>
        </div>
      </div>
    );
  }

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-24">
      {/* ── Hero header ──────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-purple-500/10 to-transparent pointer-events-none" />
        <div className="relative px-4 pt-8 pb-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white text-sm">
              ← Volver
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadDashboard(true)}
                disabled={refreshing}
                className="p-2 rounded-xl bg-dark-700/60 text-gray-400 hover:text-white transition-colors"
              >
                <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <Link
                to="/profile"
                className="p-2 rounded-xl bg-dark-700/60 text-gray-400 hover:text-white transition-colors"
              >
                <FiSettings size={15} />
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={profile?.avatar_url || `https://api.dicebear.com/7.x/personas/svg?seed=${profile?.id}`}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover border-2 border-brand-500/40"
              />
              {isStripeActive && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-dark-900">
                  <FiCheck size={9} className="text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-white truncate">{profile?.full_name || 'Creador'}</h1>
                {profile?.is_verified && <VerifiedBadge size={20} />}
                {profile?.is_adult_creator && (
                  <span className="bg-red-500/15 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                    18+
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-0.5">@{profile?.username || '—'}</p>
              <p className="text-brand-400 text-xs font-medium mt-1 flex items-center gap-1">
                <FiZap size={10} /> Panel de Creador
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-2xl mx-auto">

        {/* ── Stripe warning ───────────────────────────── */}
        {!isStripeActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4 mb-5 border-yellow-500/30 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 flex items-center gap-3"
          >
            <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
              <FiAlertCircle className="text-yellow-400" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-yellow-300 font-semibold text-sm">Pagos no configurados</p>
              <p className="text-gray-400 text-xs mt-0.5">Conecta tu cuenta para cobrar por tu contenido</p>
            </div>
            <Link
              to="/become-creator"
              className="shrink-0 flex items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
            >
              Conectar <FiChevronRight size={12} />
            </Link>
          </motion.div>
        )}

        {/* ── Stats grid ───────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard label="Total ganado"  value={data?.earnings?.total_earned}      accent="purple" icon={FiTrendingUp} />
          <StatCard label="Disponible"    value={data?.earnings?.available_balance}  accent="green"  icon={FiDollarSign} sub="para retirar" />
          <StatCard label="Pendiente"     value={data?.earnings?.pending_balance}    accent="blue"   icon={FiClock} sub="en proceso" />
          <StatCard label="Retirado"      value={data?.earnings?.total_paid_out}     accent="pink"   icon={FiArrowUpRight} />
        </div>

        {/* ── Payout card ──────────────────────────────── */}
        {isStripeActive && (
          <div className="card p-4 mb-5 bg-gradient-to-r from-brand-500/10 to-purple-500/10 border-brand-500/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-gray-400 text-xs">Balance disponible</p>
                <p className="text-2xl font-black text-white">${fmt(data?.earnings?.available_balance)}</p>
              </div>
              <button
                onClick={handlePayout}
                disabled={payoutLoading || available < 10}
                className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40 flex items-center gap-2"
              >
                {payoutLoading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><FiArrowUpRight size={14} /> Retirar</>
                }
              </button>
            </div>
            <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all"
                style={{ width: `${payoutPct}%` }}
              />
            </div>
            {available < 10 && (
              <p className="text-gray-600 text-xs mt-1.5">
                Mínimo $10 para retirar · faltan ${Math.max(0, 10 - available).toFixed(2)}
              </p>
            )}
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────── */}
        <div className="flex gap-1.5 mb-6 bg-dark-800 p-1 rounded-2xl border border-white/5">
          {[
            { key: 'overview',     label: 'Resumen',   icon: FiGrid },
            { key: 'subscribers',  label: 'Subs',      icon: FiUsers },
            { key: 'galleries',    label: 'Galerías',  icon: FiImage },
            { key: 'analytics',    label: 'Analytics', icon: FiBarChart2 },
            { key: 'retiros',      label: 'Retiros',   icon: FiCreditCard },
            { key: 'settings',     label: 'Ajustes',   icon: FiSettings },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === key
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ══ TAB: OVERVIEW ══════════════════════════════ */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Shows section */}
              <div className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <div className="w-7 h-7 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <FiVideo size={13} className="text-purple-400" />
                    </div>
                    Mis Shows
                    {data?.shows?.length > 0 && (
                      <span className="text-xs bg-dark-700 text-gray-400 px-2 py-0.5 rounded-full">
                        {data.shows.length}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-1.5 bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <FiPlus size={13} /> Crear show
                  </button>
                </div>

                {!data?.shows?.length ? (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <FiVideo size={20} className="text-gray-600" />
                    </div>
                    <p className="text-gray-500 text-sm font-medium">Sin shows todavía</p>
                    <p className="text-gray-600 text-xs mt-1">Crea tu primer show en vivo y empieza a ganar</p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-4 btn-primary text-sm px-5 py-2"
                    >
                      Crear primer show
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.shows.map(show => {
                      const cat = SHOW_CATEGORIES.find(c => c.key === show.category);
                      return (
                        <Link
                          key={show.id}
                          to={`/shows/${show.id}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/50 hover:bg-dark-700 transition-colors group"
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${
                            show.status === 'live' ? 'bg-green-500/20' : 'bg-purple-500/15'
                          }`}>
                            {cat?.emoji || '🎥'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{show.title}</p>
                            <p className="text-gray-500 text-xs capitalize">
                              {show.show_type === 'broadcast' ? 'Broadcast' : 'Privado'} ·{' '}
                              {show.ticket_price ? `$${show.ticket_price}` : 'Gratis'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <ShowBadge status={show.status} />
                            <FiChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Paid photos section */}
              <div className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-white flex items-center gap-2">
                    <div className="w-7 h-7 bg-pink-500/20 rounded-xl flex items-center justify-center">
                      <FiImage size={13} className="text-pink-400" />
                    </div>
                    Fotos de Pago
                    {data?.paid_photos?.length > 0 && (
                      <span className="text-xs bg-dark-700 text-gray-400 px-2 py-0.5 rounded-full">
                        {data.paid_photos.length}
                      </span>
                    )}
                  </h2>
                  <Link
                    to="/profile"
                    className="flex items-center gap-1 text-pink-400/80 hover:text-pink-400 text-xs font-medium transition-colors"
                  >
                    Gestionar <FiChevronRight size={11} />
                  </Link>
                </div>

                {!data?.paid_photos?.length ? (
                  <div className="py-6 text-center">
                    <div className="w-12 h-12 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <FiImage size={20} className="text-gray-600" />
                    </div>
                    <p className="text-gray-500 text-sm font-medium">Sin fotos de pago</p>
                    <p className="text-gray-600 text-xs mt-1 mb-3">Ve a tu perfil y marca fotos con precio</p>
                    <Link to="/profile" className="text-brand-400 text-xs font-medium hover:underline">
                      Ir a mi perfil →
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {data.paid_photos.map(photo => (
                      <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
                        <img
                          src={photo.url}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-1 left-0 right-0 text-center">
                          <span className="text-white text-[10px] font-bold">${photo.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent sales */}
              {data?.recent_sales?.length > 0 && (
                <div className="card p-5 mb-4">
                  <h2 className="font-bold text-white flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-green-500/20 rounded-xl flex items-center justify-center">
                      <FiTrendingUp size={13} className="text-green-400" />
                    </div>
                    Ventas recientes
                  </h2>
                  <div className="space-y-1">
                    {data.recent_sales.slice(0, 10).map((sale, i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          sale.sale_type === 'show' ? 'bg-purple-500/20' : 'bg-pink-500/20'
                        }`}>
                          {sale.sale_type === 'show'
                            ? <FiVideo size={12} className="text-purple-400" />
                            : <FiImage size={12} className="text-pink-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm font-medium">
                            {sale.sale_type === 'show' ? 'Ticket de show' : 'Foto vendida'}
                          </p>
                          <p className="text-gray-600 text-xs">
                            {new Date(sale.purchased_at || sale.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <p className="text-green-400 text-sm font-bold">+${parseFloat(sale.creator_earnings).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payouts history */}
              {data?.payouts?.length > 0 && (
                <div className="card p-5 mb-4">
                  <h2 className="font-bold text-white flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <FiArrowUpRight size={13} className="text-blue-400" />
                    </div>
                    Retiros
                  </h2>
                  <div className="space-y-1">
                    {data.payouts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                        <div>
                          <p className="text-gray-300 text-sm font-medium">${parseFloat(p.amount).toFixed(2)}</p>
                          <p className="text-gray-600 text-xs">
                            {new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                          p.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
                        }`}>
                          {p.status === 'completed' ? 'Completado' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ TAB: SUBSCRIBERS ══════════════════════════ */}
          {tab === 'subscribers' && (
            <motion.div key="subscribers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {subscribers === null ? (
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.get('/api/creator/subscribers');
                      setSubscribers(data);
                    } catch { toast.error('Error al cargar suscriptores'); }
                  }}
                  className="btn-primary w-full"
                >
                  Cargar suscriptores
                </button>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-black text-white">{subscribers.count || 0}</p>
                      <p className="text-xs text-gray-500 mt-1">Activos</p>
                    </div>
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-black text-green-400">${fmt(subscribers.total_revenue)}</p>
                      <p className="text-xs text-gray-500 mt-1">Recaudado</p>
                    </div>
                    <div className="card p-4 text-center">
                      <p className="text-2xl font-black text-brand-400">${fmt((subscribers.total_revenue || 0) * 0.8)}</p>
                      <p className="text-xs text-gray-500 mt-1">Tu corte (80%)</p>
                    </div>
                  </div>
                  {(subscribers.subscribers || []).length === 0 ? (
                    <p className="text-center text-gray-600 py-10">Aún no tienes suscriptores</p>
                  ) : (
                    <div className="space-y-2">
                      {(subscribers.subscribers || []).map(sub => (
                        <div key={sub.id} className="card p-3 flex items-center gap-3">
                          <img
                            src={sub.subscriber?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sub.subscriber?.full_name || 'U')}&size=80&background=1a1a2e&color=f43f5e`}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{sub.subscriber?.full_name}</p>
                            <p className="text-gray-500 text-xs">Desde {new Date(sub.created_at).toLocaleDateString('es', { month: 'short', year: 'numeric' })}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-green-400 text-sm font-bold">${fmt(sub.subscription_price)}/mes</p>
                            {sub.current_period_end && (
                              <p className="text-gray-600 text-[10px]">hasta {new Date(sub.current_period_end).toLocaleDateString('es')}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Broadcast */}
                  {subscribers?.count > 0 && (
                    <div className="card p-4 mt-4 space-y-3 border border-brand-500/20">
                      <p className="text-sm font-semibold text-white flex items-center gap-2">
                        📢 Enviar mensaje masivo
                      </p>
                      <textarea
                        className="input-field text-sm resize-none w-full"
                        rows={3}
                        placeholder="Escribe un mensaje para todos tus suscriptores activos..."
                        value={broadcastMsg}
                        onChange={e => setBroadcastMsg(e.target.value.slice(0, 500))}
                        maxLength={500}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">{broadcastMsg.length}/500</span>
                        <button
                          onClick={handleBroadcast}
                          disabled={sending || !broadcastMsg.trim()}
                          className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                        >
                          {sending ? 'Enviando...' : `Enviar a ${subscribers.count} subs`}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ══ TAB: GALLERIES ═════════════════════════════ */}
          {tab === 'galleries' && (
            <motion.div key="galleries" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Create gallery form */}
              <div className="card p-4 mb-5 space-y-3">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2"><FiPlus size={14} className="text-brand-400" /> Nueva galería</h3>
                <input
                  className="input-field text-sm"
                  placeholder="Título de la galería"
                  value={newGallery.title}
                  onChange={e => setNewGallery(p => ({ ...p, title: e.target.value }))}
                />
                <input
                  className="input-field text-sm"
                  placeholder="Descripción (opcional)"
                  value={newGallery.description}
                  onChange={e => setNewGallery(p => ({ ...p, description: e.target.value }))}
                />
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <FiZap size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                    <input
                      type="number"
                      className="input-field pl-9 text-sm"
                      placeholder="Precio en monedas"
                      value={newGallery.price_coins}
                      onChange={e => setNewGallery(p => ({ ...p, price_coins: e.target.value }))}
                      min="0"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!newGallery.title.trim()) return toast.error('Añade un título');
                      setCreatingGallery(true);
                      try {
                        const fd = new FormData();
                        fd.append('title', newGallery.title.trim());
                        fd.append('description', newGallery.description.trim());
                        fd.append('price_coins', newGallery.price_coins || '0');
                        if (galleryFile) fd.append('media', galleryFile);
                        const { data } = await api.post('/api/creator/galleries', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                        setGalleries(prev => [data.gallery, ...(prev || [])]);
                        setNewGallery({ title: '', description: '', price_coins: '50' });
                        setGalleryFile(null);
                        toast.success('Galería creada');
                      } catch (err) {
                        toast.error(err.response?.data?.error || 'Error al crear');
                      } finally {
                        setCreatingGallery(false);
                      }
                    }}
                    disabled={creatingGallery || !newGallery.title.trim()}
                    className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
                  >
                    {creatingGallery ? '...' : 'Crear'}
                  </button>
                </div>
                <input ref={galleryFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => setGalleryFile(e.target.files[0] || null)} />
                <button onClick={() => galleryFileRef.current?.click()} className="text-xs text-brand-400 hover:underline">
                  {galleryFile ? `Portada: ${galleryFile.name}` : '+ Añadir imagen de portada'}
                </button>
              </div>

              {/* Gallery list */}
              {galleries === null ? (
                <button onClick={async () => {
                  try {
                    const { supabase: sb } = await import('../lib/supabase.js');
                    const { data: { user } } = await sb.auth.getUser();
                    if (!user) return;
                    const res = await api.get(`/api/creator/${user.id}/galleries`);
                    setGalleries(res.data.galleries || []);
                  } catch { toast.error('Error al cargar galerías'); }
                }} className="btn-secondary w-full text-sm">
                  Cargar galerías
                </button>
              ) : (
                <GalleriesManager
                  galleries={galleries}
                  setGalleries={setGalleries}
                  galleryItemFileRef={galleryItemFileRef}
                  uploadingItem={uploadingItem}
                  setUploadingItem={setUploadingItem}
                />
              )}
            </motion.div>
          )}

          {/* ══ TAB: ANALYTICS ═════════════════════════════ */}
          {tab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* CSV Export */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={handleExportCsv}
                  disabled={exporting}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-dark-700 text-gray-300 hover:text-white hover:bg-dark-600 transition-colors disabled:opacity-50 border border-white/10"
                >
                  <FiArrowDown size={14} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
                </button>
              </div>

              {/* Subscribers */}
              <div className="card p-5 mb-4 bg-gradient-to-r from-brand-500/10 to-purple-500/5 border-brand-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Suscriptores activos</p>
                    <p className="text-4xl font-black text-white">{analytics?.subscribers ?? 0}</p>
                  </div>
                  <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center">
                    <FiUsers size={24} className="text-brand-400" />
                  </div>
                </div>
              </div>

              {/* 30-day breakdown */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Tickets de shows', value: analytics?.totals?.show_tickets, accent: 'purple', icon: FiVideo },
                  { label: 'Ventas de fotos',  value: analytics?.totals?.photo_sales,  accent: 'pink',   icon: FiImage },
                  { label: 'Propinas',          value: analytics?.totals?.tips,          accent: 'green',  icon: FiStar },
                  { label: 'Suscripciones',     value: analytics?.totals?.subscriptions, accent: 'blue',   icon: FiUsers },
                ].map(({ label, value, accent, icon: Icon }) => (
                  <StatCard key={label} label={label} value={value} accent={accent} icon={Icon} />
                ))}
              </div>

              {/* Chart */}
              <div className="card p-5 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <FiBarChart2 size={14} className="text-brand-400" /> Últimos 30 días
                  </h3>
                  <span className="text-brand-400 font-black text-lg">${fmt(analytics?.totals?.thirty_days)}</span>
                </div>
                <p className="text-gray-600 text-xs mb-4">Ingresos netos (70% tuyo)</p>
                {analytics?.chart?.length > 0
                  ? <BarChart data={analytics.chart} />
                  : (
                    <div className="h-16 flex items-center justify-center">
                      <p className="text-gray-600 text-xs">Sin datos para el período</p>
                    </div>
                  )
                }
                {analytics?.chart?.length > 0 && (
                  <div className="flex justify-between mt-2">
                    <p className="text-gray-600 text-[10px]">{analytics.chart.slice(-14)[0]?.date}</p>
                    <p className="text-gray-600 text-[10px]">{analytics.chart.slice(-1)[0]?.date}</p>
                  </div>
                )}
              </div>

              {/* Platform fee info */}
              <div className="card p-4 border-white/5 bg-dark-700/30 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-500/15 rounded-xl flex items-center justify-center shrink-0">
                    <FiShield size={15} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">80% para ti · 20% plataforma</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Tus ingresos ya están calculados con la comisión descontada
                    </p>
                  </div>
                </div>
              </div>

              {/* Per-show performance */}
              {/* Post analytics */}
              {postAnalytics?.posts?.length > 0 && (
                <div className="card p-5 mb-4">
                  <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-1">
                    <FiGrid size={14} className="text-pink-400" /> Rendimiento de posts
                  </h3>
                  <div className="flex gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-white font-black text-lg">{postAnalytics.summary.total}</p>
                      <p className="text-gray-600 text-[10px]">Posts</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-black text-lg">{postAnalytics.summary.totalLikes}</p>
                      <p className="text-gray-600 text-[10px]">Likes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-black text-lg">{postAnalytics.summary.totalComments}</p>
                      <p className="text-gray-600 text-[10px]">Comentarios</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-black text-lg">{postAnalytics.summary.avgEngagement}</p>
                      <p className="text-gray-600 text-[10px]">Eng. promedio</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {postAnalytics.posts.slice(0, 8).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 bg-dark-700/50 rounded-xl p-2.5">
                        {p.media_url ? (
                          <img src={p.media_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center shrink-0">
                            <FiEdit3 size={14} className="text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-xs truncate">{p.caption || 'Sin caption'}</p>
                          <p className="text-gray-600 text-[10px] mt-0.5">
                            {new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                            {p.is_subscribers_only && ' · 🔒'}
                            {p.is_adult && ' · 🔞'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-white text-xs font-bold">{(p.likes_count || 0) + (p.comments_count || 0)}</p>
                          <p className="text-gray-600 text-[10px]">❤️{p.likes_count} 💬{p.comments_count}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data?.shows?.some(s => s.status === 'ended') ? (
                <div className="card p-5">
                  <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                    <FiVideo size={14} className="text-purple-400" /> Rendimiento por show
                  </h3>
                  <div className="space-y-2">
                    {data.shows.filter(s => s.status === 'ended').slice(0, 8).map((show, i) => {
                      const durationMin = show.started_at && show.ended_at
                        ? Math.round((new Date(show.ended_at) - new Date(show.started_at)) / 60000)
                        : null;
                      const usd = ((show.total_coins_earned || 0) * 0.04 * 0.8).toFixed(2);
                      return (
                        <div key={show.id || i} className="bg-dark-700/60 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-white text-sm font-semibold truncate flex-1">{show.title}</p>
                            <span className="text-green-400 font-bold text-sm shrink-0">${usd}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <FiUsers size={10} /> {show.viewer_count || 0} viewers
                            </span>
                            <span className="flex items-center gap-1">
                              <FiTrendingUp size={10} /> pico {show.peak_viewers || 0}
                            </span>
                            {durationMin !== null && (
                              <span className="flex items-center gap-1">
                                <FiClock size={10} /> {durationMin}m
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {data.shows.filter(s => s.status === 'ended').length > 8 && (
                    <p className="text-gray-600 text-xs text-center mt-3">
                      Mostrando los últimos 8 shows finalizados
                    </p>
                  )}
                </div>
              ) : (
                <div className="card p-8 text-center border-white/5">
                  <div className="w-12 h-12 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <FiVideo size={20} className="text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Sin shows finalizados</p>
                  <p className="text-gray-600 text-xs mt-1">Las estadísticas aparecerán cuando termines tu primer show</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ TAB: RETIROS ═══════════════════════════════ */}
          {tab === 'retiros' && (
            <motion.div key="retiros" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Balance disponible */}
              <div className="card p-5 mb-4 bg-gradient-to-r from-green-500/10 to-emerald-500/5 border-green-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Disponible para retirar</p>
                    <p className="text-3xl font-black text-white">${fmt(data?.earnings?.available_balance)}</p>
                    <p className="text-gray-500 text-xs mt-1">Total ganado: ${fmt(data?.earnings?.total_earned)}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center">
                    <FiArrowDown size={22} className="text-green-400" />
                  </div>
                </div>
              </div>

              {/* Income breakdown by source */}
              {analytics?.totals && (
                <div className="card p-5 mb-4">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2 text-sm">
                    <FiBarChart2 size={14} className="text-brand-400" /> Ingresos por tipo (30 días)
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Tickets de shows', value: analytics.totals.show_tickets, color: 'bg-purple-500', pct: 0 },
                      { label: 'Ventas de fotos',  value: analytics.totals.photo_sales,  color: 'bg-pink-500',   pct: 0 },
                      { label: 'Propinas',          value: analytics.totals.tips,          color: 'bg-green-500',  pct: 0 },
                      { label: 'Suscripciones',     value: analytics.totals.subscriptions, color: 'bg-blue-500',   pct: 0 },
                    ].map(item => {
                      const total = (parseFloat(analytics.totals.show_tickets || 0) + parseFloat(analytics.totals.photo_sales || 0) + parseFloat(analytics.totals.tips || 0) + parseFloat(analytics.totals.subscriptions || 0)) || 1;
                      const pct = Math.round((parseFloat(item.value || 0) / total) * 100);
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-400">{item.label}</span>
                            <span className="text-white font-semibold">${fmt(item.value)} <span className="text-gray-600 font-normal">({pct}%)</span></span>
                          </div>
                          <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={`h-full rounded-full ${item.color}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Si no tiene Stripe activo */}
              {!isStripeActive ? (
                <div className="card p-5 mb-4 border-yellow-500/20 bg-yellow-500/5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <FiCreditCard size={16} className="text-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-yellow-300 font-semibold text-sm">Cuenta Stripe no configurada</p>
                      <p className="text-gray-400 text-xs mt-1">Necesitas conectar tu cuenta Stripe para recibir pagos directos a tu banco.</p>
                      <Link
                        to="/become-creator"
                        className="inline-flex items-center gap-1.5 mt-3 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                      >
                        <FiArrowUpRight size={12} /> Conectar cuenta Stripe
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                /* Formulario de retiro via Stripe */
                <div className="card p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-brand-500/20 rounded-xl flex items-center justify-center">
                      <FiCreditCard size={13} className="text-brand-400" />
                    </div>
                    <h3 className="font-bold text-white">Retirar a tu cuenta Stripe</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 font-medium mb-1.5 block">Monto a retirar (mín. $10)</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                          <input
                            className="input-field pl-7"
                            type="number"
                            placeholder="Ej: 50.00"
                            min="10"
                            step="0.01"
                            value={withdrawForm.amount}
                            onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))}
                          />
                        </div>
                        <button
                          onClick={() => setWithdrawForm(f => ({ ...f, amount: fmt(data?.earnings?.available_balance) }))}
                          className="px-3 text-xs bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white rounded-xl transition-colors"
                        >
                          Todo
                        </button>
                      </div>
                    </div>

                    <div className="bg-dark-700/60 rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Monto solicitado</span>
                        <span className="text-white">${fmt(withdrawForm.amount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Comisión plataforma (ya descontada)</span>
                        <span className="text-green-400">$0.00</span>
                      </div>
                      <div className="border-t border-white/10 pt-1.5 flex justify-between text-sm">
                        <span className="text-gray-300 font-medium">Recibirás en Stripe</span>
                        <span className="text-white font-bold">${fmt(withdrawForm.amount || 0)}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleSubmitWithdrawal}
                      disabled={submittingWithdrawal || !withdrawForm.amount || parseFloat(withdrawForm.amount) < 10 || parseFloat(withdrawForm.amount) > parseFloat(data?.earnings?.available_balance || 0)}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {submittingWithdrawal
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><FiArrowDown size={14} /> Retirar con Stripe</>
                      }
                    </button>

                    <p className="text-gray-600 text-xs text-center">
                      Stripe transfiere directo a tu banco · normalmente 2-7 días hábiles
                    </p>
                  </div>
                </div>
              )}

              {/* Historial de retiros (creator_payouts) */}
              {data?.payouts?.length > 0 && (
                <div className="card p-5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <FiArrowUpRight size={14} className="text-brand-400" /> Historial de retiros
                  </h3>
                  <div className="space-y-2">
                    {data.payouts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          p.status === 'completed' ? 'bg-green-500/15' : 'bg-yellow-500/10'
                        }`}>
                          <FiArrowDown size={14} className={p.status === 'completed' ? 'text-green-400' : 'text-yellow-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-bold">${parseFloat(p.amount).toFixed(2)}</p>
                          <p className="text-gray-600 text-xs">
                            {new Date(p.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {p.payout_method && <span className="ml-1.5 capitalize">· {p.payout_method}</span>}
                          </p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold shrink-0 ${
                          p.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                          p.status === 'processing' ? 'bg-blue-500/15 text-blue-400' :
                          'bg-yellow-500/15 text-yellow-400'
                        }`}>
                          {p.status === 'completed' ? 'Completado' : p.status === 'processing' ? 'Procesando' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!data?.payouts?.length) && isStripeActive && (
                <div className="card p-8 text-center">
                  <div className="w-12 h-12 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <FiCreditCard size={20} className="text-gray-600" />
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Sin retiros todavía</p>
                  <p className="text-gray-600 text-xs mt-1">Cuando retires, el historial aparecerá aquí</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ TAB: SETTINGS ══════════════════════════════ */}
          {tab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Bio de creador */}
              <div className="card p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-brand-500/20 rounded-xl flex items-center justify-center">
                    <FiEdit3 size={13} className="text-brand-400" />
                  </div>
                  <h3 className="font-bold text-white">Bio de creador</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Aparece en tu perfil público como creador. Cuéntales a tus fans qué tipo de contenido haces.
                </p>
                <textarea
                  ref={bioRef}
                  className="input-field resize-none text-sm"
                  rows={3}
                  placeholder="Ej: Modelo fitness, shows de baile y yoga en vivo todos los martes…"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  maxLength={300}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-gray-600 text-xs">{bio.length}/300</p>
                  <button
                    onClick={handleSaveBio}
                    disabled={savingBio}
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingBio ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <FiCheck size={12} />}
                    Guardar
                  </button>
                </div>
              </div>

              {/* Precio suscripción */}
              <div className="card p-5 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <FiDollarSign size={13} className="text-green-400" />
                  </div>
                  <h3 className="font-bold text-white">Suscripción mensual</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Cobra a tus fans mensualmente por acceso a contenido exclusivo. Déjalo vacío para no tener suscripción.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                    <input
                      className="input-field pl-7"
                      type="number"
                      placeholder="Ej: 9.99"
                      value={subPrice}
                      onChange={e => setSubPrice(e.target.value)}
                      min="1"
                      max="500"
                      step="0.01"
                    />
                  </div>
                  <button
                    onClick={handleSaveSubPrice}
                    disabled={savingPrice}
                    className="btn-primary px-4 disabled:opacity-50"
                  >
                    {savingPrice ? '...' : 'Guardar'}
                  </button>
                </div>
                {subPrice && (
                  <p className="text-gray-500 text-xs mt-2">
                    Tus fans pagarán ${parseFloat(subPrice || 0).toFixed(2)}/mes · tú recibes ${(parseFloat(subPrice || 0) * 0.8).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Modo adulto */}
              <div className="card p-5 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <FiShield size={13} className="text-red-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-white">Modo adulto (18+)</h3>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Habilita contenido para adultos en shows y fotos de pago.{' '}
                          <strong className="text-gray-400">Tu perfil no aparecerá en el feed de matches.</strong>
                        </p>
                      </div>
                      <Toggle value={!!profile?.is_adult_creator} onChange={handleToggleAdult} accent="red" />
                    </div>
                    {profile?.is_adult_creator && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-xl"
                      >
                        <p className="text-red-300 text-xs font-medium">Modo adulto activo</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          Puedes publicar contenido 18+ en shows y fotos de pago. Tu perfil está excluido del matching.
                        </p>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stripe status */}
              <div className={`card p-5 mb-4 ${isStripeActive ? 'border-green-500/20 bg-green-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isStripeActive ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                    <FiDollarSign size={16} className={isStripeActive ? 'text-green-400' : 'text-yellow-400'} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${isStripeActive ? 'text-green-300' : 'text-yellow-300'}`}>
                      {isStripeActive ? 'Cuenta de pagos activa' : 'Cuenta de pagos no configurada'}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {isStripeActive ? 'Puedes cobrar y retirar tus ganancias' : 'Configura Stripe para recibir pagos'}
                    </p>
                  </div>
                  {!isStripeActive && (
                    <Link
                      to="/become-creator"
                      className="shrink-0 flex items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
                    >
                      Configurar <FiChevronRight size={12} />
                    </Link>
                  )}
                </div>
              </div>

              {/* Quick links */}
              <div className="card p-5">
                <h3 className="font-bold text-white mb-3 text-sm">Accesos rápidos</h3>
                <div className="space-y-1">
                  {[
                    { label: 'Ir a mis shows en vivo', to: '/shows', icon: FiVideo, color: 'text-purple-400' },
                    { label: 'Gestionar fotos de perfil', to: '/profile', icon: FiImage, color: 'text-pink-400' },
                    { label: 'Ver mi perfil público', to: `/profile/${profile?.id}`, icon: FiStar, color: 'text-brand-400' },
                  ].map(({ label, to, icon: Icon, color }) => (
                    <Link
                      key={to}
                      to={to}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-700 transition-colors group"
                    >
                      <Icon size={16} className={color} />
                      <span className="text-gray-300 text-sm flex-1">{label}</span>
                      <FiChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FAB crear show ───────────────────────────────── */}
      {tab === 'overview' && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowModal(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-br from-brand-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-500/30 z-40"
        >
          <FiPlus size={22} className="text-white" />
        </motion.button>
      )}

      {/* ══ MODAL CREAR SHOW ════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              className="card p-6 w-full max-w-md"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center">
                    <FiVideo size={17} className="text-brand-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Nuevo Show</h3>
                    <p className="text-gray-500 text-xs">Crea un show en vivo o programado</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 bg-dark-700 hover:bg-dark-600 rounded-xl flex items-center justify-center transition-colors"
                >
                  <FiX size={15} className="text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Título */}
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Título *</label>
                  <input
                    className="input-field"
                    placeholder="Ej: Sesión de baile 🔥"
                    value={newShow.title}
                    onChange={e => setNewShow(s => ({ ...s, title: e.target.value }))}
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Descripción <span className="text-gray-600">(opcional)</span></label>
                  <textarea
                    className="input-field resize-none text-sm"
                    rows={2}
                    placeholder="Cuéntales a tus fans qué verán…"
                    value={newShow.description}
                    onChange={e => setNewShow(s => ({ ...s, description: e.target.value }))}
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Tipo de show</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'broadcast', label: 'Broadcast', desc: 'Múltiples viewers' },
                      { key: 'private',   label: 'Privado 1-a-1', desc: 'Solo un viewer' },
                    ].map(({ key, label, desc }) => (
                      <button
                        key={key}
                        onClick={() => setNewShow(s => ({ ...s, show_type: key }))}
                        className={`p-3 rounded-xl text-left transition-all border ${
                          newShow.show_type === key
                            ? 'bg-brand-500/20 border-brand-500/40 text-white'
                            : 'bg-dark-700 border-white/5 text-gray-400 hover:border-white/15'
                        }`}
                      >
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs opacity-70 mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categoría */}
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">Categoría</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SHOW_CATEGORIES
                      .filter(c => c.key !== 'adult' || profile?.is_adult_creator)
                      .map(({ key, label, emoji }) => (
                        <button
                          key={key}
                          onClick={() => setNewShow(s => ({ ...s, category: key }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            newShow.category === key
                              ? 'bg-brand-500 text-white shadow-sm'
                              : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                          }`}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Precio y fecha */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-medium mb-1.5 block">Precio ticket</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                      <input
                        className="input-field pl-7 text-sm"
                        type="number"
                        placeholder="0 = gratis"
                        value={newShow.ticket_price}
                        onChange={e => setNewShow(s => ({ ...s, ticket_price: e.target.value }))}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1">
                      <FiCalendar size={10} /> Programar
                    </label>
                    <input
                      className="input-field text-sm"
                      type="datetime-local"
                      value={newShow.scheduled_at}
                      onChange={e => setNewShow(s => ({ ...s, scheduled_at: e.target.value }))}
                    />
                  </div>
                </div>

                {newShow.ticket_price > 0 && (
                  <p className="text-gray-500 text-xs bg-dark-700 rounded-xl px-3 py-2">
                    Tú recibirás ${(parseFloat(newShow.ticket_price) * 0.8).toFixed(2)} por ticket vendido (80%)
                  </p>
                )}

                {/* Meta de propinas */}
                <div>
                  <label className="text-xs text-gray-400 font-medium mb-1.5 flex items-center gap-1 block">
                    Meta de propinas <span className="text-gray-600">(opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🎯</span>
                    <input
                      className="input-field pl-8 text-sm"
                      type="number"
                      placeholder="Ej: 500 (coins)"
                      value={newShow.tip_goal}
                      onChange={e => setNewShow(s => ({ ...s, tip_goal: e.target.value }))}
                      min="0"
                    />
                  </div>
                  <p className="text-gray-600 text-xs mt-1">Muestra una barra de progreso a tus viewers</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1 py-2.5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateShow}
                  disabled={creatingShow || !newShow.title.trim()}
                  className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {creatingShow
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><FiVideo size={14} /> Crear Show</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
