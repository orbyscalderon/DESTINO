import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiLock, FiCheck, FiPlayCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PromoCodeInput from '../components/ui/PromoCodeInput.jsx';
import SuccessConfetti from '../components/ui/SuccessConfetti.jsx';

export default function VideoSeriesView() {
  const { id } = useParams();
  const [series, setSeries] = useState(null);
  const [items, setItems] = useState([]);
  const [locked, setLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [promo, setPromo] = useState(null);
  const [celebrate, setCelebrate] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/api/adult-video/series/s/${id}`);
      setSeries(r.data?.series);
      setItems(r.data?.items || []);
      setLocked(!!r.data?.locked);
    } catch { toast.error('Error cargando'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const finalPrice = (() => {
    if (!series) return 0;
    if (!promo || promo.type !== 'collection') return series.price_coins;
    if (promo.discount_pct) return Math.max(0, Math.round(series.price_coins * (1 - promo.discount_pct / 100)));
    if (promo.discount_coins) return Math.max(0, series.price_coins - promo.discount_coins);
    return series.price_coins;
  })();

  const buy = async () => {
    setBuying(true);
    try {
      await api.post(`/api/adult-video/series/${id}/purchase`, promo ? { promo_code: promo.code } : {});
      toast.success('¡Serie desbloqueada! 🎬');
      setCelebrate(true);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally { setBuying(false); }
  };

  if (loading) return <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>;

  if (!series) return <div className="min-h-screen bg-dark-900 text-gray-400 flex items-center justify-center">Serie no encontrada</div>;

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <SuccessConfetti show={celebrate} onDone={() => setCelebrate(false)} />
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="glass-strong rounded-2xl border border-white/5 overflow-hidden mb-6">
          {series.cover_url && (
            <div className="aspect-video bg-dark-800 relative">
              <img src={series.cover_url} alt="" className="w-full h-full object-cover" />
              {locked && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center">
                  <div className="text-center">
                    <FiLock size={48} className="mx-auto text-white mb-2" />
                    <p className="text-white font-bold">Serie bloqueada</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="p-6">
            <h1 className="text-2xl font-black text-white mb-2">{series.title}</h1>
            {series.description && <p className="text-gray-400 text-sm mb-4">{series.description}</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="text-gray-500 text-sm">
                {series.videos_count} videos
                {series.is_adult && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">18+</span>}
              </p>
              {locked && series.is_paid ? (
                <button onClick={buy} disabled={buying}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold disabled:opacity-50">
                  {buying ? 'Procesando…' : (
                    <>
                      Comprar por {finalPrice} coins
                      {promo && finalPrice !== series.price_coins && (
                        <span className="ml-2 text-xs opacity-70 line-through">{series.price_coins}</span>
                      )}
                    </>
                  )}
                </button>
              ) : !locked && (
                <span className="inline-flex items-center gap-1 text-emerald-400 text-sm font-bold">
                  <FiCheck size={14} /> Acceso completo
                </span>
              )}
            </div>
            {locked && series.is_paid && (
              <div className="mt-4">
                <PromoCodeInput type="collection" onRedeem={setPromo} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {items.map((it, i) => (
            <Link
              key={it.video?.id}
              to={!locked ? `/explore/v/${it.video?.id}` : '#'}
              className={`glass-strong rounded-xl p-3 border border-white/5 flex items-center gap-3 ${locked ? 'opacity-60 pointer-events-none' : 'hover:bg-white/[0.04]'}`}
            >
              <span className="text-xl font-black text-gray-600 w-8 text-center">{i + 1}</span>
              {it.video?.thumbnail_url && (
                <img src={it.video.thumbnail_url} className="w-20 h-12 rounded object-cover shrink-0" alt="" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{it.episode_title || it.video?.title}</p>
                <p className="text-[10px] text-gray-500 font-mono">
                  {Math.floor((it.video?.duration_seconds || 0) / 60)}:{((it.video?.duration_seconds || 0) % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <FiPlayCircle className="text-gray-500" size={18} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
