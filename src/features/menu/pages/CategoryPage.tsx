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
  const categoryIndex = categories.findIndex((item) => item.id === category.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-4">
      <header className="relative overflow-hidden bg-ink px-5 pb-6 pt-5 text-paper sm:px-7 sm:pb-8">
        <span className="absolute -right-2 -top-5 font-display text-[110px] leading-none text-paper/[0.04]" aria-hidden>
          {String(categoryIndex + 1).padStart(2, '0')}
        </span>
        <Link
          to={`/r/${slug}`}
          className="relative inline-flex min-h-11 items-center gap-1.5 text-[13px] text-paper/60 hover:text-paper"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Cardápio completo
        </Link>
        <p className="menu-kicker relative mt-5 text-ember">Seção {String(categoryIndex + 1).padStart(2, '0')}</p>
        <h1 className="relative mt-3 font-display text-[38px] sm:text-5xl">{category.name}</h1>
        {category.description && <p className="relative mt-3 max-w-lg text-[15px] text-paper/60">{category.description}</p>}
        <p className="relative mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/40">
          {items.length} {items.length === 1 ? 'item' : 'itens'} nesta seção
        </p>
      </header>

      <nav aria-label="Outras categorias" className="scroll-x -mx-4 mt-4 flex gap-2 border-b border-hairline px-4 pb-4">
        {categories.map((item, index) => (
          <Link
            key={item.id}
            to={`/r/${slug}/categoria/${item.slug}`}
            aria-current={item.id === category.id ? 'page' : undefined}
            className="relative shrink-0 snap-start border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold data-[active=true]:border-ink data-[active=true]:bg-ink data-[active=true]:text-paper"
            data-active={item.id === category.id}
          >
            <span className="mr-2 font-mono text-[9px] opacity-55">{String(index + 1).padStart(2, '0')}</span>
            {item.name}
            {item.id === category.id && (
              <span className="ember-rule absolute inset-x-3 -bottom-px h-[2px]" aria-hidden />
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
