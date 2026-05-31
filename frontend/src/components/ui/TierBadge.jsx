// Pequeño badge que se muestra junto al nombre de un usuario cuando está
// suscrito a un creador con tier. Recibe { emoji, color, name } o `tier` object.
export default function TierBadge({ tier, emoji, color, name, size = 'sm', showName = false, title }) {
  const e = emoji || tier?.badge_emoji;
  const c = color || tier?.badge_color || '#888';
  const n = name  || tier?.name;
  if (!e) return null;

  const sizes = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      title={title || (n ? `Tier: ${n}` : 'Suscriptor')}
      className={`inline-flex items-center gap-1 rounded-full font-bold ${sizes[size] || sizes.sm}`}
      style={{
        backgroundColor: `${c}22`,
        color: c,
        border: `1px solid ${c}55`,
      }}
    >
      <span>{e}</span>
      {showName && n && <span>{n}</span>}
    </span>
  );
}
