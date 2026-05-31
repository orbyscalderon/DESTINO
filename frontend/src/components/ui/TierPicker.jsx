import { useEffect, useState } from 'react';
import { FiCheck } from 'react-icons/fi';
import api from '../../lib/api';

// Muestra los tiers disponibles del creador. El usuario hace click en uno
// y se llama onSelect(tier) — el padre se encarga de abrir el flow de pago.
//
// Si el creador no tiene tiers definidos, muestra el precio legacy único
// como si fuera un tier sin badge.
export default function TierPicker({ creatorId, onSelect, selectedTierId }) {
  const [tiers, setTiers] = useState([]);
  const [legacyPrice, setLegacyPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/creator/${creatorId}/tiers`);
        if (cancel) return;
        setTiers(data.tiers || []);
        setLegacyPrice(data.legacy_price ?? null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [creatorId]);

  if (loading) return <div className="text-gray-500 text-sm text-center py-4">Cargando opciones...</div>;

  if (tiers.length === 0 && legacyPrice !== null) {
    return (
      <button
        onClick={() => onSelect({ legacy: true, price: legacyPrice })}
        className="w-full rounded-xl p-4 bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20 transition-colors text-left"
      >
        <p className="text-white font-semibold">Suscripción mensual</p>
        <p className="text-2xl font-bold text-brand-400 mt-1">
          ${legacyPrice.toFixed(2)}<span className="text-xs text-gray-400">/mes</span>
        </p>
      </button>
    );
  }

  if (tiers.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-4">Este creador no tiene suscripción disponible.</p>;
  }

  return (
    <div className="space-y-2">
      {tiers.map(tier => {
        const isSel = selectedTierId === tier.id;
        return (
          <button
            key={tier.id}
            onClick={() => onSelect(tier)}
            className="w-full rounded-xl p-4 text-left transition-all relative border-2"
            style={{
              borderColor: isSel ? tier.badge_color : `${tier.badge_color}55`,
              backgroundColor: `${tier.badge_color}${isSel ? '20' : '10'}`,
            }}
          >
            {isSel && (
              <div
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: tier.badge_color }}
              >
                <FiCheck className="text-white" size={14} />
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{tier.badge_emoji}</span>
              <span className="font-bold text-white">{tier.name}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: tier.badge_color }}>
              ${parseFloat(tier.price).toFixed(2)}
              <span className="text-xs text-gray-500">/mes</span>
            </p>
            {tier.description && (
              <p className="text-sm text-gray-400 mt-2">{tier.description}</p>
            )}
            {tier.perks && (
              <div className="mt-2 space-y-1">
                {tier.perks.discount_pct_ppv > 0 && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    {tier.perks.discount_pct_ppv}% descuento en PPV
                  </div>
                )}
                {tier.perks.free_messages_per_day > 0 && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    {tier.perks.free_messages_per_day} mensajes gratis/día
                  </div>
                )}
                {tier.perks.exclusive_content && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    Posts exclusivos del tier
                  </div>
                )}
                {tier.perks.exclusive_shows && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    Acceso gratis a shows pagados
                  </div>
                )}
                {tier.perks.priority_dm && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    Mensajes destacados con badge
                  </div>
                )}
                {tier.perks.custom_emoji && (
                  <div className="text-xs text-gray-300 flex items-center gap-1.5">
                    <span style={{ color: tier.badge_color }}>✓</span>
                    Emoji especial en shows
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
