import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { hasARExperience, searchProducts } from '../menuService';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, SmartImage } from '@/components/ui';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
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
      <header className="relative overflow-hidden bg-ink text-paper">
        <SmartImage
          src={restaurant.cover_url}
          alt=""
          ratio="16/9"
          priority
          className="max-h-72 min-h-64 w-full sm:max-h-96"
          imgClassName="opacity-70 saturate-[0.85]"
          fallbackLabel={restaurant.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
        <div className="absolute right-0 top-0 h-24 w-24 border-l-[24px] border-t-[24px] border-l-transparent border-t-ember/90" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl items-end gap-4 p-5 sm:p-8">
          {restaurant.logo_url && (
            <img
              src={restaurant.logo_url}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 border border-paper/15 bg-ink/65 object-contain p-1 backdrop-blur-sm sm:size-16"
            />
          )}
          <div className="min-w-0 flex-1">
          <p className="menu-kicker text-paper/60">Menu da casa</p>
          <h1 className="mt-2 font-display text-[38px] leading-none text-paper sm:text-5xl">
            {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-paper/70 sm:text-[15px]">
              {restaurant.description}
            </p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-paper/55">
            <span
              className={cn('size-1.5 rounded-full', isOpen ? 'bg-positive' : 'bg-faint')}
              aria-hidden
            />
            {isOpen ? 'Aberto agora' : 'Fechado agora'}
            {arProducts.length > 0 && (
              <>
                <span aria-hidden>·</span>
                 {products.length} itens · {arProducts.length} em AR
              </>
            )}
          </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4">
        {/* Busca */}
        <div className="sticky top-0 z-30 -mx-4 border-b border-hairline bg-paper/92 px-4 py-3 backdrop-blur-xl">
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
              className="h-12 w-full border border-hairline bg-paper pl-10 pr-3 text-[15px] outline-none placeholder:text-faint focus:border-ink"
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
            <nav aria-label="Categorias" className="scroll-x -mx-4 flex gap-2 border-b border-hairline px-4 pb-4 pt-1">
              {categories.map((category, index) => (
                <Link
                  key={category.id}
                  to={`/r/${slug}/categoria/${category.slug}`}
                  className="group shrink-0 snap-start border border-hairline bg-paper px-3.5 py-2 text-[13px] font-semibold transition-colors hover:border-ink"
                >
                  <span className="mr-2 font-mono text-[10px] text-ember-deep">{String(index + 1).padStart(2, '0')}</span>
                  {category.name}
                </Link>
              ))}
            </nav>

            {featured.length > 0 && (
              <Strip eyebrow="Seleção da casa" title="Comece por estes" products={featured} slug={slug} currency={restaurant.currency} />
            )}

            {arProducts.length > 0 && <ARStrip products={arProducts} slug={slug} currency={restaurant.currency} />}

            {promos[0] && <PromoCallout product={promos[0]} slug={slug} currency={restaurant.currency} />}

            {/* Cardápio completo */}
            {categories.map((category) => {
              const items = products.filter((product) => product.category_id === category.id);
              if (items.length === 0) return null;

              const categoryNumber = categories.indexOf(category) + 1;
              return (
                <section key={category.id} className="pt-12" id={category.slug}>
                  <div className="flex items-end justify-between border-b border-ink pb-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember-deep">Seção {String(categoryNumber).padStart(2, '0')}</p>
                      <h2 className="mt-1 font-display text-[28px]">{category.name}</h2>
                    </div>
                    <Link
                      to={`/r/${slug}/categoria/${category.slug}`}
                      className="pb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted"
                    >
                      Ver todos
                    </Link>
                  </div>
                  {category.description && (
                    <p className="mt-3 max-w-lg text-[14px] text-muted">{category.description}</p>
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
  eyebrow,
  title,
  products,
  slug,
  currency,
}: {
  eyebrow: string;
  title: string;
  products: Parameters<typeof ProductCard>[0]['product'][];
  slug: string;
  currency: string;
}) {
  return (
    <section className="pt-10">
      <p className="menu-kicker text-ember-deep">{eyebrow}</p>
      <h2 className="mt-2 font-display text-[30px]">{title}</h2>
      <div className="scroll-x -mx-4 mt-4 flex gap-4 px-4 pb-2">
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
    <section className="menu-ar-panel -mx-4 mt-12 overflow-hidden px-4 py-8 text-paper sm:mx-0 sm:px-6">
      <p className="menu-kicker text-ember">Experiência AR</p>
      <div className="mt-3 flex items-end justify-between gap-5">
        <div>
          <h2 className="font-display text-[30px]">Leve o prato à sua mesa</h2>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-paper/60">
            Abra a câmera, confira o tamanho real e observe cada detalhe antes de escolher.
          </p>
        </div>
        <span className="hidden font-display text-5xl italic text-paper/10 sm:block" aria-hidden>1:1</span>
      </div>
      <div className="scroll-x -mx-4 mt-5 flex gap-4 px-4 pb-1 sm:-mx-6 sm:px-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} slug={slug} currency={currency} variant="tile" inverse />
        ))}
      </div>
    </section>
  );
}

function PromoCallout({
  product,
  slug,
  currency,
}: {
  product: Parameters<typeof ProductCard>[0]['product'];
  slug: string;
  currency: string;
}) {
  return (
    <Link
      to={`/r/${slug}/produto/${product.slug}`}
      className="mt-10 grid overflow-hidden border border-wine/20 bg-[#6F1D1B] text-paper sm:grid-cols-[1fr_14rem]"
    >
      <div className="flex flex-col justify-center p-5 sm:p-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-paper/55">Preço especial</p>
        <h2 className="mt-2 font-display text-[27px]">{product.name}</h2>
        <p className="mt-2 text-[14px] text-paper/65">Uma escolha da casa por tempo limitado.</p>
        <p className="mt-4 font-display text-[22px]">{formatMoney(product.price_cents, currency)}</p>
      </div>
      <SmartImage src={product.image_url} alt={product.name} ratio="5/3" className="min-h-44 bg-ink sm:min-h-full" fallbackLabel={product.name} />
    </Link>
  );
}
