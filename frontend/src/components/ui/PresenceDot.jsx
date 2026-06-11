// Dot indicador de presencia (online/offline). Verde con halo pulsante cuando
// online, gris simple cuando offline. Para mostrar SOBRE un avatar:
//   <div className="relative">
//     <img className="w-10 h-10 rounded-full" ... />
//     <PresenceDot online={user.is_online} />
//   </div>

export default function PresenceDot({ online = true, size = 'md' }) {
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };
  if (!online) {
    return (
      <span
        className={`absolute bottom-0 right-0 ${sizes[size] || sizes.md}
                    rounded-full bg-gray-500 ring-2 ring-dark-900`}
      />
    );
  }
  return <span className={`presence-dot ${sizes[size] || sizes.md}`} />;
}
