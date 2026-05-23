// Componente base de skeleton pulsante
export function Skeleton({ className = '' }) {
  return (
    <div className={`bg-dark-700 rounded-xl animate-pulse ${className}`} />
  );
}

// Skeleton de tarjeta de match en la lista de mensajes
export function MatchRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-white/5">
      <Skeleton className="w-14 h-14 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32 rounded-full" />
        <Skeleton className="h-3 w-48 rounded-full" />
      </div>
      <Skeleton className="h-3 w-10 rounded-full shrink-0" />
    </div>
  );
}

// Skeleton de SwipeCard
export function SwipeCardSkeleton() {
  return (
    <div className="relative rounded-3xl overflow-hidden bg-dark-800 border border-white/5 aspect-[3/4] w-full">
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className="absolute bottom-0 inset-x-0 p-5 space-y-2">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-4 w-28 rounded-full" />
      </div>
    </div>
  );
}

// Skeleton de fila de show
export function ShowRowSkeleton() {
  return (
    <div className="card p-4 flex items-start gap-4">
      <Skeleton className="w-20 h-20 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-4 w-3/4 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
        <Skeleton className="h-3 w-1/3 rounded-full" />
      </div>
    </div>
  );
}

// Lista de skeletons de matches
export function MatchListSkeleton({ count = 6 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => <MatchRowSkeleton key={i} />)}
    </div>
  );
}

// Skeleton de post en Momentos
export function PostCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-2.5 w-16 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-3/4 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
        <div className="flex gap-4 mt-3">
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// Skeleton de resultado de búsqueda
export function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 card p-3">
      <Skeleton className="w-11 h-11 rounded-full shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-20 rounded-full" />
      </div>
    </div>
  );
}

// Skeleton de tarjeta de show (grid 2 columnas)
export function ShowCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden">
      <Skeleton className="aspect-[3/4] rounded-2xl rounded-b-none" />
      <div className="p-2.5 space-y-1.5 bg-dark-800 rounded-b-2xl border border-white/5 border-t-0">
        <Skeleton className="h-2.5 w-3/4 rounded-full" />
        <Skeleton className="h-2 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

// Skeleton de fila de notificación
export function NotifRowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 border-b border-white/5">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-3 w-3/4 rounded-full" />
        <Skeleton className="h-2.5 w-1/2 rounded-full" />
      </div>
      <Skeleton className="h-2.5 w-8 rounded-full shrink-0 mt-1" />
    </div>
  );
}
