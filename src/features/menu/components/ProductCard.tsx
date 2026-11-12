import { Link } from 'react-router-dom';
import { SmartImage } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import type { ProductWithModel } from '@/types/database';
import { hasARExperience } from '../menuService';
import { MenuIcon } from './MenuIcon';

export function ProductCard({ product, slug, currency, variant = 'row' }: {
  product: ProductWithModel;
  slug: string;
  currency: string;
  variant?: 'row' | 'tile';
}) {
  return (
    <Link to={`/r/${slug}/produto/${product.slug}`} className={`dish-card dish-${variant}`}>
      {product.image_url && (
        <div className="dish-photo">
          <SmartImage src={product.image_url} alt="" ratio="4/3" fallbackLabel={product.name} />
          {hasARExperience(product) && <span className="dish-ar" aria-label="Realidade aumentada"><MenuIcon name="ar" /> AR</span>}
        </div>
      )}
      <div className="dish-copy">
        <h3>{product.name}</h3>
        {variant === 'row' && product.badges.length > 0 && <p className="dish-labels">{product.badges.join(' · ')}</p>}
        {product.description && <p className="dish-description">{product.description}</p>}
        <div className="dish-price">
          <strong>{formatMoney(product.price_cents, currency)}</strong>
          {product.compare_at_price_cents !== null && <del>{formatMoney(product.compare_at_price_cents, currency)}</del>}
          {product.prep_time_minutes !== null && <span>· &nbsp;{product.prep_time_minutes} min</span>}
        </div>
        {!product.is_available && <small>Indisponível hoje</small>}
      </div>
    </Link>
  );
}
