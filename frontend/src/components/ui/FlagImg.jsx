export default function FlagImg({ code, className = 'w-6 h-4 rounded-sm object-cover' }) {
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code}
      className={className}
      loading="lazy"
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}
