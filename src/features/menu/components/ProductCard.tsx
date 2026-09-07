import { Link } from 'react-router-dom';

import { hasARExperience } from '../menuService';
import { Badge, SmartImage } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { ProductWithModel } from '@/types/database';

/**
 * Cartão de prato.
 *
 * Duas variantes: `row` para listas longas (a foto compete menos com o texto e
 * cabem mais itens na dobra) e `tile` para as faixas de destaque, onde a foto é
 * o argumento de venda.
 *
 * O selo de AR é discreto de propósito: a chamada forte fica na página do
 * produto, onde o cliente já demonstrou interesse.
 */
export function ProductCard({
  product,
  slug,
  currency,
  variant = 'row',
}: {
  product: ProductWithModel;
  slug: string;
  currency: string;
  variant?: 'row' | 'tile';
}) {
  const unavailable = !product.is_available;
  const showAR = hasARExperience(product);
  const promo = product.compare_at_price_cents !== null;

  if (variant === 'tile') {
    return (
      <Link
        to={`/r/${slug}/produto/${product.slug}`}
        className={cn(
          'group block w-44 shrink-0 scroll-ml-4 snap-start sm:w-52',
          unavailable && 'opacity-55',
        )}
        aria-disabled={unavailable}
      >
        <div className="relative overflow-hidden rounded-[8px]">
          <SmartImage
            src={product.image_url}
            alt={product.name}
            ratio="1/1"
            fallbackLabel={product.name}
            imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {showAR && (
            <span className="absolute left-2 top-2 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
              style={{ background: 'var(--ember-gradient)' }}>
              AR
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-[15px] font-medium leading-snug">{product.name}</p>
        <p className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          <span className="font-medium text-ink">{formatMoney(product.price_cents, currency)}</span>
          {product.prep_time_minutes !== null && <span>· {product.prep_time_minutes} min</span>}
        </p>
      </Link>
    );
  }

  return (
    <Link
      to={`/r/${slug}/produto/${product.slug}`}
      className={cn(
        'group flex gap-3 border-b border-hairline py-4 transition-colors last:border-b-0 hover:bg-surface/60',
        unavailable && 'opacity-55',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-[16px] font-semibold leading-tight">{product.name}</h3>
          {product.badges.map((badge) => (
            <Badge key={badge} tone={badge === 'Promoção' ? 'ember' : 'neutral'}>
              {badge}
            </Badge>
          ))}
        </div>

        {product.description && (
          <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-muted">
            {product.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular text-[15px] font-semibold">
            {formatMoney(product.price_cents, currency)}
          </span>
          {promo && (
            <span className="tabular text-[13px] text-faint line-through">
              {formatMoney(product.compare_at_price_cents!, currency)}
            </span>
          )}
          {product.prep_time_minutes !== null && (
            <span className="tabular flex items-center gap-1 text-[13px] text-muted">
              <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="10" cy="10" r="7" />
                <path d="M10 6v4.2l2.6 1.6" strokeLinecap="round" />
              </svg>
              {product.prep_time_minutes} min
            </span>
          )}
          {unavailable && <span className="text-[13px] text-danger">Indisponível hoje</span>}
        </div>

        {showAR && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-ember-deep">
            <span className="inline-block h-px w-4 ember-rule" aria-hidden />
            Ver na sua mesa
          </p>
        )}
      </div>

      <SmartImage
        src={product.image_url}
        alt={product.name}
        ratio="1/1"
        className="size-24 shrink-0 rounded-[8px] sm:size-28"
        fallbackLabel={product.name}
        imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
      />
    </Link>
  );
}
