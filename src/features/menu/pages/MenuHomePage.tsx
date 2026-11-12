import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { hasARExperience, searchProducts } from '../menuService';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '@/components/ui';
import { track } from '@/lib/analytics';
import { MenuIcon } from '../components/MenuIcon';
import { CategoryNav } from '../components/CategoryNav';
import type { ProductWithModel } from '@/types/database';
import { useSeo } from '@/lib/seo';

/**
 * Página inicial do cardápio.
 *
 * Ordem pensada para quem chegou pelo QR Code e está com fome: identidade do
 * restaurante, busca, atalho de categorias, os pratos que valem a foto grande
 * (destaques e promoções) e, abaixo, o cardápio completo por categoria.
 */
export default function MenuHomePage() {
  const { restaurant, categories, products, isOpen } = useMenu();
  const { slug = '' } = useParams();
  const [query, setQuery] = useState('');

  useSeo({
    title: `${restaurant.name} — cardápio digital`,
    description:
      restaurant.description ??
      `Veja o cardápio de ${restaurant.name} e visualize os pratos em realidade aumentada antes de pedir.`,
    image: restaurant.cover_url,
    canonicalPath: `/r/${restaurant.slug}`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: restaurant.name,
      description: restaurant.description ?? undefined,
      image: restaurant.cover_url ?? undefined,
      address: restaurant.address ?? undefined,
      telephone: restaurant.phone ?? undefined,
      servesCuisine: categories.map((category) => category.name),
      hasMenu: {
        '@type': 'Menu',
        hasMenuSection: categories.map((category) => ({
          '@type': 'MenuSection',
          name: category.name,
          hasMenuItem: products
            .filter((product) => product.category_id === category.id)
            .map((product) => ({
              '@type': 'MenuItem',
              name: product.name,
              description: product.description ?? undefined,
              offers: {
                '@type': 'Offer',
                price: (product.price_cents / 100).toFixed(2),
                priceCurrency: restaurant.currency,
              },
            })),
        })),
      },
    },
  });

  const [filter, setFilter] = useState('all');
  const searching = query.trim().length >= 2;
  const results = useMemo(() => {
    const matches = searching ? searchProducts(products, query) : products;
    if (filter === 'promo') return matches.filter((product) => product.is_available && product.compare_at_price_cents !== null);
    if (filter === 'ar') return matches.filter((product) => product.is_available && hasARExperience(product));
    return matches;
  }, [products, query, searching, filter]);

  const featured = products.filter((product) => product.is_featured && product.is_available);
  const [failedCovers, setFailedCovers] = useState<string[]>([]);
  const cover = [restaurant.cover_url, products.find((product) => product.image_url)?.image_url]
    .find((url) => url && !failedCovers.includes(url));

  return (
    <main className="dining-wrap">
      <header className={cover ? 'dining-cover' : 'dining-cover dining-cover-text'}>
        <div className="dining-intro">
          <span className="dining-status"><i data-open={isOpen} />{isOpen ? 'Aberto agora' : 'Fechado agora'}</span>
          <h1>Cardápio</h1>
          {restaurant.description && <p>{restaurant.description}</p>}
          {restaurant.address && <address><MenuIcon name="pin" />{restaurant.address}</address>}
        </div>
        {cover && <img className="dining-cover-image" src={cover} alt="" fetchPriority="high" onError={() => setFailedCovers((urls) => [...urls, cover])} />}
      </header>

      <div className="dining-tools">
        <CategoryNav />
        <div className="dining-find">
          <label className="dining-search">
            <MenuIcon name="search" />
            <input type="search" aria-label="Buscar prato ou ingrediente" placeholder="Buscar no cardápio" value={query}
              onChange={(event) => {
                const term = event.target.value;
                setQuery(term);
                if (term.trim().length === 3) void track(restaurant.id, 'search_performed', { metadata: { term: term.trim().slice(0, 40) } });
              }}
            />
          </label>
          <select className="dining-filter" aria-label="Filtrar pratos" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Filtrar</option>
            <option value="promo">Promoções</option>
            <option value="ar">Pratos em AR</option>
          </select>
        </div>
      </div>
      {searching || filter !== 'all' ? (
        <section className="dining-section" aria-live="polite">
          {results.length ? <>
            <h2>{results.length} {results.length === 1 ? 'resultado' : 'resultados'}</h2>
            <div className="dish-list">
              {results.map((product) => <ProductCard key={product.id} product={product} slug={slug} currency={restaurant.currency} />)}
            </div>
          </> : <EmptyState title="Nenhum prato encontrado" description="Tente outro ingrediente ou ajuste o filtro." />}
        </section>
      ) : (
        <>
          {featured.length > 0 && <FeaturedDishes products={featured} slug={slug} currency={restaurant.currency} />}
          {categories.map((category) => {
            const items = products.filter((product) => product.category_id === category.id);
            if (!items.length) return null;
            return (
              <section className="dining-section" key={category.id} id={category.slug}>
                <div className="dining-heading">
                  <h2>{category.name}</h2>
                  <Link className="dining-more" to={`/r/${slug}/categoria/${category.slug}`}>Ver todos <MenuIcon name="right" /></Link>
                </div>
                {category.description && <p className="dining-subtitle">{category.description}</p>}
                <div className="dish-list">
                  {items.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} slug={slug} currency={restaurant.currency} />)}
                </div>
              </section>
            );
          })}
          {!products.length && <EmptyState title="Cardápio em preparo" description="Este restaurante ainda não publicou os pratos." />}
        </>
      )}
    </main>
  );
}

function FeaturedDishes({ products, slug, currency }: { products: ProductWithModel[]; slug: string; currency: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const update = () => setEdges({ start: node.scrollLeft < 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    node.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', update);
    };
  }, [products.length]);

  return (
    <section className="dining-section">
      <div className="dining-heading">
        <h2>Destaques da casa</h2>
        {!(edges.start && edges.end) && <div className="dish-paging">
          <button aria-label="Destaques anteriores" disabled={edges.start} onClick={() => rail.current?.scrollBy({ left: -rail.current.clientWidth })}><MenuIcon name="left" /></button>
          <button aria-label="Próximos destaques" disabled={edges.end} onClick={() => rail.current?.scrollBy({ left: rail.current.clientWidth })}><MenuIcon name="right" /></button>
        </div>}
      </div>
      <div className="dish-rail" ref={rail}>
        {products.map((product) => <ProductCard key={product.id} product={product} slug={slug} currency={currency} variant="tile" />)}
      </div>
    </section>
  );
}
