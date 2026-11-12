import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { CategoryNav } from '../components/CategoryNav';
import { MenuIcon } from '../components/MenuIcon';
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
      window.scrollTo(0, 0);
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
    <main className="dining-wrap dining-category">
      <Link to={`/r/${slug}`} className="dining-back"><MenuIcon name="left" /> Cardápio completo</Link>
      <header className="dining-category-title">
        <h1>{category.name}</h1>
        {category.description && <p>{category.description}</p>}
      </header>
      <CategoryNav active={category.slug} />
      {items.length ? <div className="dish-list">
        {items.map((product) => <ProductCard key={product.id} product={product} slug={slug} currency={restaurant.currency} />)}
      </div> : <EmptyState title="Categoria vazia" description="Nenhum prato publicado nesta categoria por enquanto." />}
    </main>
  );
}
