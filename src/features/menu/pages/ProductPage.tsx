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
      <div className="relative">
        <SmartImage
          src={product.image_url}
          alt={product.name}
          ratio="4/3"
          priority
          className="max-h-[46vh] w-full"
          fallbackLabel={product.name}
        />
        <Link
          to={`/r/${slug}`}
          aria-label="Voltar ao cardápio"
          className="absolute left-3 top-3 flex size-10 items-center justify-center rounded-full bg-paper/90 backdrop-blur"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="flex flex-wrap items-center gap-1.5 pt-4">
          {product.categories && (
            <Link
              to={`/r/${slug}/categoria/${product.categories.slug}`}
              className="text-[13px] text-muted underline underline-offset-2"
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

        <h1 className="mt-1.5 font-display text-[30px] leading-tight">{product.name}</h1>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="tabular font-display text-[24px]">
            {formatMoney(product.price_cents, restaurant.currency)}
          </span>
          {product.compare_at_price_cents && (
            <span className="tabular text-[15px] text-faint line-through">
              {formatMoney(product.compare_at_price_cents, restaurant.currency)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{product.description}</p>
        )}

        {/* Chamada de AR: única aplicação do gradiente de brasa na página */}
        {arAvailable && model && (
          <div className="mt-5 rounded-[10px] border border-hairline p-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-px w-6 shrink-0 ember-rule" aria-hidden />
              <div className="min-w-0">
                <p className="font-display text-[19px]">Ver na minha mesa</p>
                <p className="mt-0.5 text-[14px] text-muted">
                  O prato aparece na sua mesa pela câmera, em tamanho real.
                </p>
                <p className="tabular mt-1.5 text-[13px] text-faint">
                  {formatDimensions(model)} · escala aproximada 1:1
                </p>
              </div>
            </div>
            <Button
              variant="ember"
              size="lg"
              fullWidth
              className="mt-4"
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
          <section className="mt-6 border-t border-hairline pt-5">
            {product.ingredients.length > 0 && (
              <>
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Ingredientes
                </h2>
                <p className="mt-1.5 text-[15px]">{product.ingredients.join(', ')}</p>
              </>
            )}
            {product.allergens.length > 0 && (
              <p className="mt-3 text-[14px] text-warning">
                <strong className="font-semibold">Contém:</strong> {product.allergens.join(', ')}
              </p>
            )}
            <dl className="tabular mt-3 flex gap-5 text-[13px] text-muted">
              {product.prep_time_minutes !== null && (
                <div>
                  <dt className="inline">Preparo </dt>
                  <dd className="inline font-medium text-ink">{product.prep_time_minutes} min</dd>
                </div>
              )}
              {product.calories !== null && product.calories > 0 && (
                <div>
                  <dt className="inline">Aprox. </dt>
                  <dd className="inline font-medium text-ink">{product.calories} kcal</dd>
                </div>
              )}
            </dl>
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
