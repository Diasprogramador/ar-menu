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
  inverse = false,
}: {
  product: ProductWithModel;
  slug: string;
  currency: string;
  variant?: 'row' | 'tile';
  inverse?: boolean;
}) {
  const unavailable = !product.is_available;
  const showAR = hasARExperience(product);
  const promo = product.compare_at_price_cents !== null;

  if (variant === 'tile') {
    return (
      <Link
        to={`/r/${slug}/produto/${product.slug}`}
        className={cn(
          'group block w-64 shrink-0 scroll-ml-4 snap-start sm:w-72',
          unavailable && 'opacity-55',
        )}
        aria-disabled={unavailable}
      >
        <div className="menu-cut relative overflow-hidden bg-ink">
          <SmartImage
            src={product.image_url}
            alt={product.name}
            ratio="5/4"
            fallbackLabel={product.name}
            imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {showAR && (
            <span className="absolute left-3 top-3 border border-paper/25 bg-ink/70 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-paper backdrop-blur-sm">
              Vista em AR
            </span>
          )}
        </div>
        <p className={cn('mt-3 line-clamp-2 font-display text-[20px] leading-tight', inverse && 'text-paper')}>{product.name}</p>
        <p className={cn('tabular mt-1 flex items-center gap-2 text-[13px] text-muted', inverse && 'text-paper/50')}>
          <span className={cn('font-semibold text-ink', inverse && 'text-paper')}>{formatMoney(product.price_cents, currency)}</span>
          {product.prep_time_minutes !== null && <span>· {product.prep_time_minutes} min</span>}
        </p>
      </Link>
    );
  }

  return (
    <Link
      to={`/r/${slug}/produto/${product.slug}`}
      className={cn(
        'group grid grid-cols-[1fr_7rem] gap-4 border-b border-hairline py-5 transition-colors last:border-b-0 sm:grid-cols-[1fr_8rem]',
        unavailable && 'opacity-55',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-display text-[20px] leading-tight">{product.name}</h3>
          {product.badges.map((badge) => (
            <Badge key={badge} tone={badge === 'Promoção' ? 'ember' : 'neutral'}>
              {badge}
            </Badge>
          ))}
        </div>

        {product.description && (
            <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-muted">
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
        className="menu-cut h-28 w-28 shrink-0 bg-ink sm:h-32 sm:w-32"
        fallbackLabel={product.name}
        imgClassName="transition-transform duration-500 group-hover:scale-[1.04]"
      />
    </Link>
  );
}
