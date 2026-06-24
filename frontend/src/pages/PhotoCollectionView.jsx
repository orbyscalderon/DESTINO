import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiLock, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import PromoCodeInput from '../components/ui/PromoCodeInput.jsx';
import SuccessConfetti from '../components/ui/SuccessConfetti.jsx';

export default function PhotoCollectionView() {
  const { id } = useParams();
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [locked, setLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [promo, setPromo] = useState(null);
  const [celebrate, setCelebrate] = useState(false);

  const finalPrice = (() => {
    if (!collection) return 0;
    if (!promo || promo.type !== 'collection') return collection.price_coins;
    if (promo.applies_to_id && promo.applies_to_id !== collection.id) return collection.price_coins;
    if (promo.discount_pct) return Math.max(0, Math.round(collection.price_coins * (1 - promo.discount_pct / 100)));
    if (promo.discount_coins) return Math.max(0, collection.price_coins - promo.discount_coins);
    return collection.price_coins;
  })();

  const load = async () => {
    try {
      const r = await api.get(`/api/creator-monetization/collections/c/${id}`);
      setCollection(r.data?.collection);
      setItems(r.data?.items || []);
      setLocked(r.data?.locked !== false);
    } catch { toast.error('Error cargando'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const buy = async () => {
    setBuying(true);
    try {
      await api.post(`/api/creator-monetization/collections/${id}/purchase`, {
        ...(promo ? { promo_code: promo.code } : {}),
      });
      toast.success('¡Colección desbloqueada! ✨');
      setCelebrate(true);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error');
    } finally { setBuying(false); }
  };

  if (loading) return <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>;

  if (!collection) return <div className="min-h-screen bg-dark-900 flex items-center justify-center text-gray-400">No encontrada</div>;

  return (
    <div className="min-h-screen bg-dark-900 hero-mesh px-5 py-8 lg:px-16 lg:py-12">
      <SuccessConfetti show={celebrate} onDone={() => setCelebrate(false)} />
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 mb-8">
          <FiArrowLeft size={16} /> Volver
        </Link>

        <div className="glass-strong rounded-2xl border border-white/5 overflow-hidden mb-6">
          {collection.cover_url && (
            <div className="aspect-video bg-dark-800 relative">
              <img loading="lazy" src={collection.cover_url} alt="" className="w-full h-full object-cover" />
              {locked && <div className="absolute inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center">
                <div className="text-center">
                  <FiLock size={48} className="mx-auto text-white mb-2" />
                  <p className="text-white font-bold">Colección bloqueada</p>
                </div>
              </div>}
            </div>
          )}
          <div className="p-6">
            <h1 className="text-2xl font-black text-white mb-2">{collection.title}</h1>
            {collection.description && <p className="text-gray-400 text-sm mb-4">{collection.description}</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="text-gray-500 text-sm">
                {collection.items_count} foto{collection.items_count !== 1 ? 's' : ''}
                {collection.is_adult && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">18+</span>}
              </p>
              {locked ? (
                <button onClick={buy} disabled={buying}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold disabled:opacity-50">
                  {buying ? 'Procesando…' : (
                    <>
                      Comprar por {finalPrice} coins
                      {promo && finalPrice !== collection.price_coins && (
                        <span className="ml-2 text-xs opacity-70 line-through">{collection.price_coins}</span>
                      )}
                    </>
                  )}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-400 text-sm font-bold">
                  <FiCheck size={14} /> Comprado
                </span>
              )}
            </div>
            {locked && (
              <div className="mt-4">
                <PromoCodeInput type="collection" onRedeem={setPromo} />
              </div>
            )}
          </div>
        </div>

        {!locked && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {items.map(it => (
              <div key={it.id} className="aspect-square rounded-xl overflow-hidden bg-dark-800">
                <img loading="lazy" src={it.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
