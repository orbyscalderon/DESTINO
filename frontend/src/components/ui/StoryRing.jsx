// Anillo de story alrededor de un avatar
export default function StoryRing({ hasUnseen, isOwn, size = 44, children }) {
  const ring = hasUnseen
    ? 'p-[2px] bg-gradient-to-tr from-brand-500 to-yellow-400'
    : isOwn
    ? 'p-[2px] bg-gradient-to-tr from-dark-600 to-dark-500'
    : 'p-[2px] bg-dark-600';

  return (
    <div className={`rounded-full ${ring}`} style={{ width: size + 4, height: size + 4 }}>
      <div className="w-full h-full rounded-full bg-dark-900 p-[2px]">
        {children}
      </div>
    </div>
  );
}
