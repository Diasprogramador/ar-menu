import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useMenu } from '../MenuContext';
import { getProductDetail } from '../menuService';
import { validateAddonSelection, useCartStore } from '@/features/cart/cartStore';
import { Badge, Button, EmptyState, ErrorState, Skeleton, SmartImage, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { track, trackOnce } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatDimensions, formatMoney } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import type { ProductAddon, ProductDetail } from '@/types/database';

/**
 * Página do prato.
 *
 * O bundle de 3D/AR entra por `lazy`: quem só quer ler a descrição não baixa o
 * three.js. O download começa quando o cliente toca em "Ver na minha mesa".
 */
const ARExperience = lazy(() =>
  import('@/features/ar/ARExperience').then((module) => ({ default: module.ARExperience })),
);

export default function ProductPage() {
  const { restaurant, isOpen } = useMenu();
  const { slug = '', productSlug = '' } = useParams();
  const navigate = useNavigate();
  const addItem = useCartStore((store) => store.addItem);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [arOpen, setArOpen] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const detail = await getProductDetail(restaurant.id, productSlug);
      if (!detail) {
        setState('missing');
        return;
      }
      setProduct(detail);
      setState('ready');
      trackOnce(restaurant.id, 'product_viewed', { productId: detail.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir este prato.');
      setState('error');
    }
  }, [restaurant.id, productSlug]);

  useEffect(() => {
    void load();
    window.scrollTo(0, 0);
  }, [load]);

  const model = product?.product_models ?? null;
  const arAvailable = Boolean(model?.ar_enabled && model.model_url);

  useSeo({
    title: product ? `${product.name} — ${restaurant.name}` : restaurant.name,
    description:
      product?.description ??
      `Veja ${product?.name ?? 'este prato'} em realidade aumentada antes de pedir.`,
    image: product?.image_url ?? restaurant.cover_url,
    canonicalPath: `/r/${restaurant.slug}/produto/${productSlug}`,
    structuredData: product
      ? {
          '@context': 'https://schema.org',
          '@type': 'MenuItem',
          name: product.name,
          description: product.description ?? undefined,
          image: product.image_url ?? undefined,
          offers: {
            '@type': 'Offer',
            price: (product.price_cents / 100).toFixed(2),
            priceCurrency: restaurant.currency,
            availability: product.is_available
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
        }
      : null,
  });

  const addonGroups = useMemo(() => groupAddons(product?.product_addons ?? []), [product]);

  const totalCents = useMemo(() => {
    if (!product) return 0;
    const addonsCents = (product.product_addons ?? [])
      .filter((addon) => selectedAddons.includes(addon.id))
      .reduce((sum, addon) => sum + addon.price_cents, 0);
    return (product.price_cents + addonsCents) * quantity;
  }, [product, selectedAddons, quantity]);

  const handleAddToCart = useCallback(() => {
    if (!product) return;

    const check = validateAddonSelection(product.product_addons ?? [], selectedAddons);
    if (!check.valid) {
      toast(check.message ?? 'Revise as opções do prato.', 'error');
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      imageUrl: product.image_url,
      unitPriceCents: product.price_cents,
      quantity,
      notes,
      addons: (product.product_addons ?? [])
        .filter((addon) => selectedAddons.includes(addon.id))
        .map((addon) => ({ id: addon.id, name: addon.name, price_cents: addon.price_cents })),
    });

    void track(restaurant.id, 'product_added_to_cart', {
      productId: product.id,
      metadata: { quantity, from_ar: arOpen },
    });

    setArOpen(false);
    toast(`${product.name} adicionado ao pedido`, 'success');
    navigate(`/r/${slug}`);
  }, [product, selectedAddons, quantity, notes, addItem, restaurant.id, arOpen, navigate, slug]);

  if (state === 'loading') return <ProductSkeleton />;
  if (state === 'missing') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Prato não encontrado"
          description="Ele pode ter saído do cardápio."
          action={
            <Link to={`/r/${slug}`} className="text-[15px] underline underline-offset-4">
              Voltar ao cardápio
            </Link>
          }
        />
      </main>
    );
  }
  if (state === 'error' || !product) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message={errorMessage} onRetry={() => void load()} />
      </main>
    );
  }

  const unavailable = !product.is_available;

  return (
    <main className="pb-32">
      <div className="relative mx-auto max-w-5xl overflow-hidden bg-ink">
        <SmartImage
          src={product.image_url}
          alt={product.name}
          ratio="5/4"
          priority
          className="max-h-[58vh] min-h-80 w-full bg-ink"
          fallbackLabel={product.name}
        />
        <Link
          to={`/r/${slug}`}
          aria-label="Voltar ao cardápio"
          className="absolute left-4 top-4 flex size-11 items-center justify-center border border-paper/20 bg-ink/70 text-paper backdrop-blur"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/75 to-transparent" />
        <p className="pointer-events-none absolute bottom-4 right-4 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/50">
          Retrato do modelo em AR
        </p>
      </div>

      <div className="relative mx-auto -mt-1 w-full max-w-3xl bg-paper px-4 sm:-mt-8 sm:px-7 sm:pt-1">
        <div className="flex flex-wrap items-center gap-2 pt-5">
          {product.categories && (
            <Link
              to={`/r/${slug}/categoria/${product.categories.slug}`}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ember-deep"
            >
              {product.categories.name}
            </Link>
          )}
          {product.badges.map((badge) => (
            <Badge key={badge} tone={badge === 'Promoção' ? 'ember' : 'neutral'}>
              {badge}
            </Badge>
          ))}
        </div>

        <h1 className="mt-3 max-w-2xl font-display text-[38px] leading-[1.02] sm:text-5xl">{product.name}</h1>

        <div className="menu-price-tab ml-3 mt-4 flex items-baseline gap-2">
          <span className="tabular font-display text-[26px]">
            {formatMoney(product.price_cents, restaurant.currency)}
          </span>
          {product.compare_at_price_cents && (
            <span className="tabular text-[15px] text-faint line-through">
              {formatMoney(product.compare_at_price_cents, restaurant.currency)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft">{product.description}</p>
        )}

        {(product.prep_time_minutes !== null || (product.calories !== null && product.calories > 0)) && (
          <dl className="mt-6 grid grid-cols-2 border-y border-hairline py-4">
            {product.prep_time_minutes !== null && (
              <div className="border-r border-hairline pr-4">
                <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Tempo de preparo</dt>
                <dd className="mt-1 font-display text-[20px]">{product.prep_time_minutes} minutos</dd>
              </div>
            )}
            {product.calories !== null && product.calories > 0 && (
              <div className="pl-4">
                <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Valor aproximado</dt>
                <dd className="mt-1 font-display text-[20px]">{product.calories} kcal</dd>
              </div>
            )}
          </dl>
        )}

        {/* Chamada de AR: única aplicação do gradiente de brasa na página */}
        {arAvailable && model && (
          <div className="menu-ar-panel menu-cut mt-7 p-5 text-paper sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center border border-ember/40 bg-ember/10 text-ember" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
                  <ellipse cx="12" cy="12" rx="4.5" ry="2.5" />
                  <path d="M7.5 12v3c0 1.4 2 2.5 4.5 2.5s4.5-1.1 4.5-2.5v-3" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="menu-kicker text-ember">Escala real</p>
                <p className="mt-2 font-display text-[24px]">Veja na sua mesa</p>
                <p className="mt-1 text-[14px] text-paper/60">
                  Abra a câmera e confira o volume do prato antes de pedir.
                </p>
                <p className="tabular mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-paper/40">
                  {formatDimensions(model)} · escala aproximada 1:1
                </p>
              </div>
            </div>
            <Button
              variant="ember"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => {
                setArOpen(true);
                void track(restaurant.id, 'product_ar_opened', { productId: product.id });
              }}
            >
              Ver na minha mesa
            </Button>
          </div>
        )}

        {(product.ingredients.length > 0 || product.allergens.length > 0) && (
          <section className="mt-8 border-t border-ink pt-5">
            {product.ingredients.length > 0 && (
              <>
                <h2 className="font-display text-[22px]">
                  Ingredientes
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {product.ingredients.map((ingredient) => (
                    <li key={ingredient} className="border border-hairline bg-surface px-3 py-1.5 text-[13px] text-ink-soft">
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {product.allergens.length > 0 && (
              <p className="mt-4 border-l-2 border-warning bg-[#FBF0DE] px-3 py-2 text-[13px] text-warning">
                <strong className="font-semibold">Contém:</strong> {product.allergens.join(', ')}
              </p>
            )}
          </section>
        )}

        {addonGroups.map(([groupName, addons]) => (
          <section key={groupName} className="mt-6 border-t border-hairline pt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[19px]">{groupName}</h2>
              <span className="text-[13px] text-muted">
                {addons.some((addon) => addon.is_required) ? 'Obrigatório' : 'Opcional'}
              </span>
            </div>
            <div className="mt-2 divide-y divide-hairline">
              {addons.map((addon) => {
                const checked = selectedAddons.includes(addon.id);
                return (
                  <label
                    key={addon.id}
                    className="flex cursor-pointer items-center gap-3 py-3 text-[15px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedAddons((current) =>
                          event.target.checked
                            ? [...current, addon.id]
                            : current.filter((id) => id !== addon.id),
                        )
                      }
                      className="size-5 shrink-0 accent-[#14110F]"
                    />
                    <span className="flex-1">{addon.name}</span>
                    <span className="tabular text-[14px] text-muted">
                      + {formatMoney(addon.price_cents, restaurant.currency)}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        <section className="mt-6 border-t border-hairline pt-5">
          <label htmlFor="product-notes" className="font-display text-[19px]">
            Alguma observação?
          </label>
          <Textarea
            id="product-notes"
            value={notes}
            maxLength={200}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: sem cebola, ponto da carne ao ponto"
            className="mt-2"
          />
        </section>
      </div>

      {/* Barra de ação */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper/97 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <div className="flex h-12 items-center rounded-[8px] border border-hairline">
            <button
              type="button"
              aria-label="Diminuir quantidade"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1}
              className="flex size-12 items-center justify-center text-xl disabled:opacity-35"
            >
              −
            </button>
            <span className="tabular w-7 text-center text-[15px] font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Aumentar quantidade"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
              className="flex size-12 items-center justify-center text-xl"
            >
              +
            </button>
          </div>

          <Button
            size="lg"
            className={cn('flex-1', unavailable && 'pointer-events-none')}
            disabled={unavailable || !isOpen}
            onClick={handleAddToCart}
          >
            {unavailable
              ? 'Indisponível hoje'
              : !isOpen
                ? 'Restaurante fechado'
                : `Adicionar · ${formatMoney(totalCents, restaurant.currency)}`}
          </Button>
        </div>
      </div>

      {arOpen && model && (
        <Suspense fallback={<ARLoadingScreen />}>
          <ARExperience
            product={product}
            model={model}
            currency={restaurant.currency}
            onClose={() => setArOpen(false)}
            onAddToCart={handleAddToCart}
            onEvent={(event) => {
              if (event === 'ready') {
                void track(restaurant.id, 'product_ar_ready', { productId: product.id });
              }
              if (event === 'placed') {
                void track(restaurant.id, 'product_ar_placed', { productId: product.id });
              }
              if (event === 'failed') {
                void track(restaurant.id, 'product_ar_failed', { productId: product.id });
              }
              if (event === '3d') {
                void track(restaurant.id, 'product_3d_opened', { productId: product.id });
              }
              if (event === 'exited') {
                void track(restaurant.id, 'product_ar_exited', { productId: product.id });
              }
            }}
          />
        </Suspense>
      )}
    </main>
  );
}

function groupAddons(addons: ProductAddon[]): [string, ProductAddon[]][] {
  const groups = new Map<string, ProductAddon[]>();
  for (const addon of addons) {
    const list = groups.get(addon.group_name) ?? [];
    list.push(addon);
    groups.set(addon.group_name, list);
  }
  return [...groups.entries()];
}

function ProductSkeleton() {
  return (
    <main className="pb-20">
      <Skeleton className="h-64 w-full rounded-none" />
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="mt-4 h-28 w-full rounded-[10px]" />
      </div>
    </main>
  );
}

function ARLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-ink text-paper">
      <div className="h-px w-16 ember-rule" />
      <p className="text-sm text-paper/70">Preparando a realidade aumentada…</p>
    </div>
  );
}
