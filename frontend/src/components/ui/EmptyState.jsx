// Empty state con personalidad — illustration custom SVG (preferido) o emoji
// como fallback, título y descripción opcional, CTA.
//
// Props:
//   illustration: ReactNode — preferido. Componente SVG de ./illustrations
//   emoji:        string fallback si no hay illustration (default 🌙)
//   title:        string
//   desc:         string (opcional)
//   action:       ReactNode (botón o link)

export default function EmptyState({ illustration, emoji = '🌙', title, desc, action }) {
  return (
    <div className="empty-state">
      {illustration ? (
        <div className="animate-float select-none">{illustration}</div>
      ) : (
        <div className="empty-state-icon">{emoji}</div>
      )}
      <p className="empty-state-title">{title}</p>
      {desc && <p className="empty-state-desc">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
