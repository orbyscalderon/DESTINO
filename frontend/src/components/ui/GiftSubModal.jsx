import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { FiX, FiSearch, FiGift, FiShuffle, FiUser } from 'react-icons/fi';
import api from '../../lib/api';
import TierPicker from './TierPicker';

// Modal para regalarle una suscripción a otro usuario.
// Props: { creatorId, creatorName, onClose, onSuccess?, defaultRecipientId? }
export default function GiftSubModal({ creatorId, creatorName, onClose, onSuccess, defaultRecipientId }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [mode, setMode] = useState('specific'); // 'specific' | 'random'
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState([]);
  const [recipient, setRecipient] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myCoins, setMyCoins] = useState(null);

  useEffect(() => {
    api.get('/api/coins/balance').then(({ data }) => setMyCoins(data.balance ?? 0)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!defaultRecipientId) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/profiles/${defaultRecipientId}`);
        if (data?.profile) {
          setRecipient({
            id: data.profile.id,
            full_name: data.profile.full_name,
            avatar_url: data.profile.avatar_url,
          });
        }
      } catch {}
    })();
  }, [defaultRecipientId]);

  // Debounced search de matches/usuarios
  useEffect(() => {
    if (!recipientQuery || recipientQuery.length < 2 || recipient) {
      setRecipientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/api/profiles/search?q=${encodeURIComponent(recipientQuery)}&limit=8`);
        setRecipientResults(data?.profiles || data?.users || []);
      } catch {
        setRecipientResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [recipientQuery, recipient]);

  const coinsCost = selectedTier?.price ? Math.ceil(parseFloat(selectedTier.price) * 20) : 0;
  const hasRecipient = mode === 'random' || !!recipient?.id;
  const canSubmit = hasRecipient && selectedTier?.id && !submitting;
  const hasEnoughCoins = myCoins === null || myCoins >= coinsCost;

  const handleGift = async () => {
    if (!canSubmit) return;
    if (!hasEnoughCoins) {
      toast.error(`Necesitas ${coinsCost} coins (tienes ${myCoins})`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/api/creator/${creatorId}/gift-sub`, {
        recipientId: mode === 'random' ? 'random' : recipient.id,
        tierId: selectedTier.id,
        message: message.trim() || null,
      });
      const name = data?.recipient_name || recipient?.full_name || 'un fan';
      toast.success(
        data?.was_random
          ? `🎲🎁 ¡Regalaste ${selectedTier.name} a ${name}!`
          : `🎁 ¡Regalaste ${selectedTier.name} a ${name}!`
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      if (err.response?.data?.code === 'INSUFFICIENT_COINS') {
        toast.error(`Coins insuficientes. Necesitas ${err.response.data.required || coinsCost}.`);
      } else if (err.response?.data?.code === 'NO_ELIGIBLE_FANS') {
        toast.error(err.response.data.error || 'Sin fans elegibles para regalo aleatorio');
      } else {
        toast.error(err.response?.data?.error || 'Error al regalar suscripción');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="bg-dark-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-dark-900 px-5 py-4 border-b border-dark-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiGift className="text-pink-400" size={20} />
              <h3 className="text-white font-bold">Regalar suscripción</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Cerrar">
              <FiX size={20} />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <p className="text-sm text-gray-400">
              Regala una suscripción mensual a <span className="text-white font-semibold">{creatorName}</span> a otro usuario. Se paga con coins.
            </p>

            {/* Paso 1: destinatario */}
            <div>
              <p className="text-xs text-gray-400 mb-2">1. ¿Para quién?</p>

              {/* Toggle Específico / Aleatorio */}
              <div className="grid grid-cols-2 gap-2 mb-3 bg-dark-800 rounded-xl p-1">
                <button
                  onClick={() => setMode('specific')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === 'specific'
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FiUser size={12} /> Elegir persona
                </button>
                <button
                  onClick={() => { setMode('random'); setRecipient(null); setRecipientQuery(''); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === 'random'
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FiShuffle size={12} /> Aleatorio 🎲
                </button>
              </div>

              {mode === 'random' ? (
                <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2" aria-hidden="true">🎲</div>
                  <p className="text-white font-semibold text-sm mb-1">Regalo sorpresa</p>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    El sistema elegirá al azar a uno de los seguidores de {creatorName} que aún no esté suscrito.
                    La persona recibirá una notificación con tu nombre.
                  </p>
                </div>
              ) : recipient ? (
                <div className="flex items-center gap-3 bg-dark-700 rounded-xl p-3">
                  <img
                    src={recipient.avatar_url || '/avatar-placeholder.png'}
                    alt={`Avatar de ${recipient.full_name || 'usuario'}`}
                    className="w-10 h-10 rounded-full object-cover bg-dark-600"
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{recipient.full_name}</p>
                  </div>
                  <button
                    onClick={() => { setRecipient(null); setRecipientQuery(''); }}
                    className="text-gray-400 hover:text-white text-xs"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                      type="text"
                      value={recipientQuery}
                      onChange={e => setRecipientQuery(e.target.value)}
                      placeholder="Busca por nombre..."
                      className="w-full pl-9 pr-3 py-2 bg-dark-700 rounded-lg text-white text-sm"
                    />
                  </div>
                  {recipientResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {recipientResults.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setRecipient(u); setRecipientQuery(''); setRecipientResults([]); }}
                          className="w-full flex items-center gap-3 bg-dark-800 hover:bg-dark-700 rounded-lg p-2"
                        >
                          <img src={u.avatar_url || '/avatar-placeholder.png'} alt={`Avatar de ${u.full_name || 'usuario'}`} className="w-8 h-8 rounded-full object-cover bg-dark-600" />
                          <span className="text-white text-sm">{u.full_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Paso 2: tier */}
            <div>
              <p className="text-xs text-gray-400 mb-2">2. Elige nivel</p>
              <TierPicker
                creatorId={creatorId}
                selectedTierId={selectedTier?.id}
                onSelect={(t) => setSelectedTier(t)}
              />
            </div>

            {/* Paso 3: mensaje opcional */}
            <div>
              <p className="text-xs text-gray-400 mb-2">3. Mensaje (opcional)</p>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="¡Espero que disfrutes el contenido!"
                className="w-full bg-dark-700 rounded-lg px-3 py-2 text-white text-sm"
              />
              <p className="text-[10px] text-gray-500 text-right mt-1">{message.length}/200</p>
            </div>

            {/* Resumen + botón */}
            {selectedTier && (
              <div className="bg-dark-800 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Para</span>
                  <span className="text-white">
                    {mode === 'random' ? '🎲 Fan aleatorio' : recipient?.full_name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tier</span>
                  <span className="text-white">{selectedTier.badge_emoji} {selectedTier.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Costo</span>
                  <span className="text-white font-bold">🪙 {coinsCost.toLocaleString()} coins</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Tu saldo</span>
                  <span className={hasEnoughCoins ? '' : 'text-red-400'}>
                    🪙 {myCoins === null ? '...' : myCoins.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleGift}
              disabled={!canSubmit || !hasEnoughCoins}
              className="w-full btn-primary py-3 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FiGift size={16} />
              {submitting ? 'Procesando...' : (hasEnoughCoins ? 'Regalar suscripción' : 'Coins insuficientes')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
