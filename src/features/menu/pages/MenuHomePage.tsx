import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { hasARExperience, searchProducts } from '../menuService';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, SmartImage } from '@/components/ui';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
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

  const searchResults = useMemo(() => searchProducts(products, query), [products, query]);
  const searching = query.trim().length >= 2;

  const featured = products.filter((product) => product.is_featured && product.is_available);
  const promos = products.filter(
    (product) => product.compare_at_price_cents !== null && product.is_available,
  );
  const arProducts = products.filter((product) => hasARExperience(product) && product.is_available);

  return (
    <main>
      {/* Capa */}
      <header className="relative">
        <SmartImage
          src={restaurant.cover_url}
          alt=""
          ratio="16/9"
          priority
          className="max-h-52 w-full sm:max-h-72"
          fallbackLabel={restaurant.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/92 via-ink/55 to-ink/10" />
        <div className="absolute inset-x-0 bottom-0 flex items-start gap-3 p-4 sm:p-6">
          {restaurant.logo_url && (
            <img
              src={restaurant.logo_url}
              alt=""
              width={56}
              height={56}
              className="size-12 shrink-0 rounded-[10px] border border-paper/15 bg-ink/60 object-contain p-1 backdrop-blur-sm sm:size-14"
            />
          )}
          <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-none text-paper sm:text-4xl">
            {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="mt-2 max-w-lg text-[14px] leading-snug text-paper/80">
              {restaurant.description}
            </p>
          )}
          <p className="mt-2 flex items-center gap-2 text-[13px] text-paper/70">
            <span
              className={cn('size-1.5 rounded-full', isOpen ? 'bg-positive' : 'bg-faint')}
              aria-hidden
            />
            {isOpen ? 'Aberto agora' : 'Fechado agora'}
            {arProducts.length > 0 && (
              <>
                <span aria-hidden>·</span>
                {arProducts.length} {arProducts.length === 1 ? 'prato' : 'pratos'} em AR
              </>
            )}
          </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4">
        {/* Busca */}
        <div className="sticky top-0 z-30 -mx-4 bg-paper/95 px-4 py-3 backdrop-blur">
          <label className="sr-only" htmlFor="menu-search">
            Buscar no cardápio
          </label>
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13.2 13.2L17 17" strokeLinecap="round" />
            </svg>
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value.trim().length === 3) {
                  void track(restaurant.id, 'search_performed', {
                    metadata: { term: event.target.value.trim().slice(0, 40) },
                  });
                }
              }}
              placeholder="Buscar prato ou ingrediente"
              className="h-11 w-full rounded-[8px] border border-hairline bg-surface pl-9 pr-3 text-[15px] outline-none placeholder:text-faint focus:border-ink focus:bg-paper"
            />
          </div>
        </div>

        {searching ? (
          <section className="pb-8" aria-live="polite">
            <p className="pb-2 pt-1 text-[13px] text-muted">
              {searchResults.length === 0
                ? 'Nenhum resultado'
                : `${searchResults.length} ${searchResults.length === 1 ? 'prato encontrado' : 'pratos encontrados'}`}
            </p>
            {searchResults.length === 0 ? (
              <EmptyState
                title="Nenhum prato encontrado"
                description={`Não achamos nada para "${query.trim()}". Tente outro nome ou navegue pelas categorias.`}
              />
            ) : (
              searchResults.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  slug={slug}
                  currency={restaurant.currency}
                />
              ))
            )}
          </section>
        ) : (
          <>
            {/* Atalho de categorias */}
            <nav aria-label="Categorias" className="scroll-x -mx-4 flex gap-2 px-4 pb-1">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/r/${slug}/categoria/${category.slug}`}
                  className="shrink-0 snap-start rounded-full border border-hairline px-3.5 py-1.5 text-[14px] font-medium transition-colors hover:border-ink"
                >
                  {category.name}
                </Link>
              ))}
            </nav>

            {arProducts.length > 0 && <ARStrip products={arProducts} slug={slug} currency={restaurant.currency} />}

            {featured.length > 0 && (
              <Strip title="Mais pedidos" products={featured} slug={slug} currency={restaurant.currency} />
            )}

            {promos.length > 0 && (
              <Strip title="Promoções" products={promos} slug={slug} currency={restaurant.currency} />
            )}

            {/* Cardápio completo */}
            {categories.map((category) => {
              const items = products.filter((product) => product.category_id === category.id);
              if (items.length === 0) return null;

              return (
                <section key={category.id} className="pt-8" id={category.slug}>
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-[22px]">{category.name}</h2>
                    <Link
                      to={`/r/${slug}/categoria/${category.slug}`}
                      className="text-[13px] text-muted underline underline-offset-2"
                    >
                      Ver todos
                    </Link>
                  </div>
                  {category.description && (
                    <p className="mt-1 text-[14px] text-muted">{category.description}</p>
                  )}
                  <div className="mt-2">
                    {items.slice(0, 4).map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        slug={slug}
                        currency={restaurant.currency}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {categories.length === 0 && (
              <EmptyState
                title="Cardápio em preparo"
                description="Este restaurante ainda não publicou os pratos."
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Strip({
  title,
  products,
  slug,
  currency,
}: {
  title: string;
  products: Parameters<typeof ProductCard>[0]['product'][];
  slug: string;
  currency: string;
}) {
  return (
    <section className="pt-7">
      <h2 className="font-display text-[22px]">{title}</h2>
      <div className="scroll-x -mx-4 mt-3 flex gap-3 px-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} slug={slug} currency={currency} variant="tile" />
        ))}
      </div>
    </section>
  );
}

/**
 * Faixa dedicada à realidade aumentada.
 *
 * Recebe tratamento visual próprio porque é o diferencial do produto — e
 * porque, no teste com clientes, ninguém procura por AR: é preciso oferecer.
 */
function ARStrip({
  products,
  slug,
  currency,
}: {
  products: Parameters<typeof ProductCard>[0]['product'][];
  slug: string;
  currency: string;
}) {
  return (
    <section className="mt-6 rounded-[10px] border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="h-px w-6 ember-rule" aria-hidden />
        <h2 className="font-display text-[20px]">Veja antes de pedir</h2>
      </div>
      <p className="mt-1 text-[14px] text-muted">
        Estes pratos aparecem na sua mesa em tamanho real pela câmera do celular.
      </p>
      <div className="scroll-x -mx-4 mt-3 flex gap-3 px-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} slug={slug} currency={currency} variant="tile" />
        ))}
      </div>
    </section>
  );
}
