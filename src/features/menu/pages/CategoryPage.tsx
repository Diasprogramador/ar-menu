import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { ProductCard } from '../components/ProductCard';
import NotFoundPage from '@/components/NotFoundPage';
import { EmptyState } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useSeo } from '@/lib/seo';

export default function CategoryPage() {
  const { restaurant, categories, products } = useMenu();
  const { slug = '', categorySlug = '' } = useParams();

  const category = categories.find((item) => item.slug === categorySlug);

  useEffect(() => {
    if (category) {
      void track(restaurant.id, 'category_viewed', { metadata: { category: category.slug } });
    }
  }, [restaurant.id, category]);

  useSeo({
    title: category ? `${category.name} — ${restaurant.name}` : `Categoria — ${restaurant.name}`,
    description:
      category?.description ?? `Pratos da categoria ${category?.name ?? ''} em ${restaurant.name}.`,
    canonicalPath: `/r/${restaurant.slug}/categoria/${categorySlug}`,
  });

  if (!category) return <NotFoundPage />;

  const items = products.filter((product) => product.category_id === category.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-4">
      <Link
        to={`/r/${slug}`}
        className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Cardápio
      </Link>

      <h1 className="mt-3 font-display text-[30px]">{category.name}</h1>
      {category.description && <p className="mt-1 text-[15px] text-muted">{category.description}</p>}

      <nav aria-label="Outras categorias" className="scroll-x -mx-4 mt-4 flex gap-2 px-4">
        {categories.map((item) => (
          <Link
            key={item.id}
            to={`/r/${slug}/categoria/${item.slug}`}
            aria-current={item.id === category.id ? 'page' : undefined}
            className="relative shrink-0 snap-start rounded-full border border-hairline px-3.5 py-1.5 text-[14px] font-medium data-[active=true]:border-ink"
            data-active={item.id === category.id}
          >
            {item.name}
            {item.id === category.id && (
              <span className="ember-rule absolute inset-x-3 -bottom-px h-[2px] rounded-full" aria-hidden />
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState
            title="Categoria vazia"
            description="Nenhum prato publicado nesta categoria por enquanto."
          />
        ) : (
          items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              slug={slug}
              currency={restaurant.currency}
            />
          ))
        )}
      </div>
    </main>
  );
}
