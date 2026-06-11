// Empty state con personalidad — emoji flotante + título + descripción opcional + CTA.
// Reemplaza patrones tipo:
//   <p className="text-center py-12 text-gray-500">Sin nada aún</p>
//
// Props:
//   emoji:  string (default 🌙)
//   title:  string
//   desc:   string (opcional)
//   action: ReactNode (botón o link)

export default function EmptyState({ emoji = '🌙', title, desc, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{emoji}</div>
      <p className="empty-state-title">{title}</p>
      {desc && <p className="empty-state-desc">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
