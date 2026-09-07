import { Skeleton } from '@/components/ui';

/**
 * Espera de um bundle carregado por `lazy`.
 *
 * Desenha a silhueta de um cardápio em vez de um spinner: em rede móvel, ver a
 * forma do que vem a seguir é mais informativo do que um círculo girando.
 */
export function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Skeleton className="h-40 w-full rounded-[10px]" />
      <div className="mt-5 flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-24 shrink-0 rounded-[8px]" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Carregando
      </span>
    </div>
  );
}
