import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCopy, FiGift, FiUsers, FiCheck, FiShare2 } from 'react-icons/fi';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

export default function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/api/referrals/code')
      .then(r => setData(r.data))
      .catch(() => toast.error('Error cargando programa de referidos'))
      .finally(() => setLoading(false));
  }, []);

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copiado al portapapeles');
  };

  const share = async () => {
    const url = data?.share_url;
    if (navigator.share) {
      try { await navigator.share({ title: 'Únete a Destino TV', text: `Usa mi código ${data?.code} para unirte`, url }); }
      catch {}
    } else {
      copy(url);
    }
  };

  const handleApply = async () => {
    const code = applyCode.trim().toUpperCase();
    if (!code) return;
    setApplying(true);
    try {
      const { data } = await api.post('/api/referrals/apply', { code });
      toast.success(data.message || 'Código aplicado');
      setApplyCode('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aplicar código');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen px-4 pt-8 pb-28 max-w-lg mx-auto relative">
      <div className="absolute top-12 right-0 w-64 h-64 bg-brand-500/6 rounded-full blur-3xl pointer-events-none animate-float -z-10" />
      <div className="flex items-center gap-3 mb-6">
        <Link to="/profile" className="text-gray-400 hover:text-white hover:bg-white/5 p-1.5 -m-1 rounded-lg transition-colors"><FiArrowLeft size={20} /></Link>
        <h1 className="text-2xl lg:text-3xl font-black gradient-text">Invita y gana</h1>
      </div>

      {/* Hero card */}
      <div className="card p-6 mb-6 text-center bg-gradient-to-br from-brand-500/15 to-accent-500/8 border-brand-500/30 shadow-glow-sm">
        <FiGift className="text-brand-400 mx-auto mb-3 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]" size={36} />
        <p className="text-lg font-bold text-white mb-1">50 coins por cada amigo</p>
        <p className="text-gray-400 text-sm">Recibe 50 coins cuando tu amigo haga su primera compra</p>
      </div>

      {/* Tu código */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-gray-500 uppercase font-bold tracking-wide mb-2">Tu código</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-center">
            <p className="text-2xl font-black gradient-text tracking-widest">{data?.code}</p>
          </div>
          <button onClick={() => copy(data?.code)}
            className="w-12 h-12 rounded-xl bg-dark-700 hover:bg-dark-600 flex items-center justify-center text-gray-300 shrink-0">
            {copied ? <FiCheck size={18} className="text-green-400" /> : <FiCopy size={18} />}
          </button>
        </div>
        <button onClick={share}
          className="btn-primary w-full mt-3 flex items-center justify-center gap-2">
          <FiShare2 size={16} /> Compartir link
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card p-3 text-center">
          <FiUsers className="text-blue-400 mx-auto mb-1" size={16} />
          <p className="text-xl font-black text-white">{data?.total_referrals || 0}</p>
          <p className="text-[10px] text-gray-500 uppercase">Invitados</p>
        </div>
        <div className="card p-3 text-center">
          <FiCheck className="text-green-400 mx-auto mb-1" size={16} />
          <p className="text-xl font-black text-white">{data?.rewarded_referrals || 0}</p>
          <p className="text-[10px] text-gray-500 uppercase">Activos</p>
        </div>
        <div className="card p-3 text-center bg-yellow-500/5 border-yellow-500/20">
          <FiGift className="text-yellow-400 mx-auto mb-1" size={16} />
          <p className="text-xl font-black text-white">{data?.coins_earned || 0}</p>
          <p className="text-[10px] text-gray-500 uppercase">Coins</p>
        </div>
      </div>

      {/* Cómo funciona */}
      <div className="card p-5 mb-4">
        <h3 className="text-sm font-bold text-white mb-3">¿Cómo funciona?</h3>
        <ol className="space-y-2 text-xs text-gray-300">
          <li className="flex gap-2"><span className="text-brand-400 font-bold">1.</span> Comparte tu código con un amigo</li>
          <li className="flex gap-2"><span className="text-brand-400 font-bold">2.</span> Tu amigo se registra y lo usa</li>
          <li className="flex gap-2"><span className="text-brand-400 font-bold">3.</span> Cuando hace su primera compra de coins, ambos ganan</li>
        </ol>
      </div>

      {/* Aplicar código (si todavía no lo aplicaste) */}
      <div className="card p-5">
        <p className="text-xs text-gray-500 uppercase font-bold tracking-wide mb-2">¿Tienes un código?</p>
        <div className="flex gap-2">
          <input
            className="input-field flex-1 py-2 text-sm uppercase tracking-widest"
            placeholder="ABC123"
            value={applyCode}
            onChange={e => setApplyCode(e.target.value.toUpperCase().substring(0, 10))}
            maxLength={10}
          />
          <button onClick={handleApply} disabled={applying || !applyCode}
            className="btn-secondary px-4 text-sm font-bold disabled:opacity-40">
            {applying ? '…' : 'Aplicar'}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-2">Solo puedes aplicar un código y por una sola vez</p>
      </div>
    </div>
  );
}
