import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  deleteProductModel,
  getProduct,
  listCategories,
  saveProduct,
  saveProductModel,
  STORAGE_LIMITS,
  uploadFile,
  type ProductInput,
} from '../adminService';
import { PageHeader } from '../components/AdminPrimitives';
import { AddonsEditor } from '../components/AddonsEditor';
import { ARModelEditor } from '../components/ARModelEditor';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, ErrorState, Field, Input, Panel, Select, Skeleton, SmartImage, Switch, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { cn } from '@/lib/cn';
import { slugify } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';
import type { ProductModel } from '@/types/database';

type Tab = 'detalhes' | 'ar' | 'adicionais';

/**
 * Editor de produto.
 *
 * Três abas porque são três tarefas distintas com públicos diferentes de
 * atenção: o texto do cardápio, a configuração 3D/AR (que exige medir o prato)
 * e os adicionais. Juntar tudo numa página só produziria um formulário que
 * ninguém termina de preencher.
 */
export default function ProductEditorPage() {
  const { productId } = useParams();
  const { activeRestaurant } = useAuth();
  const navigate = useNavigate();
  const isNew = !productId;

  const [tab, setTab] = useState<Tab>('detalhes');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductInput>({
    name: '',
    slug: '',
    description: '',
    category_id: null,
    price_cents: 0,
    compare_at_price_cents: null,
    image_url: null,
    ingredients: [],
    allergens: [],
    badges: [],
    is_available: true,
    is_featured: false,
    prep_time_minutes: null,
    calories: null,
    sort_order: 0,
  });
  const [model, setModel] = useState<ProductModel | null>(null);

  useSeo({ title: isNew ? 'Novo produto — AR Menu' : 'Editar produto — AR Menu', noIndex: true });

  const categories = useResource(() => listCategories(activeRestaurant!.id), [activeRestaurant?.id]);

  const product = useResource(
    async () => (productId ? getProduct(productId) : null),
    [productId],
  );

  useEffect(() => {
    if (!product.data) return;
    const loaded = product.data;
    setForm({
      name: loaded.name,
      slug: loaded.slug,
      description: loaded.description,
      category_id: loaded.category_id,
      price_cents: loaded.price_cents,
      compare_at_price_cents: loaded.compare_at_price_cents,
      image_url: loaded.image_url,
      ingredients: loaded.ingredients,
      allergens: loaded.allergens,
      badges: loaded.badges,
      is_available: loaded.is_available,
      is_featured: loaded.is_featured,
      prep_time_minutes: loaded.prep_time_minutes,
      calories: loaded.calories,
      sort_order: loaded.sort_order,
    });
    setModel(loaded.product_models);
  }, [product.data]);

  const update = useCallback(<K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const priceInput = useMemo(() => (form.price_cents / 100).toFixed(2), [form.price_cents]);

  const handleSave = async () => {
    if (!activeRestaurant) return;
    if (!form.name.trim()) {
      toast('Dê um nome ao produto.', 'error');
      return;
    }
    if (form.price_cents <= 0) {
      toast('Informe o preço do produto.', 'error');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveProduct(
        activeRestaurant.id,
        { ...form, slug: form.slug || slugify(form.name) },
        productId,
      );
      toast('Produto salvo', 'success');
      if (isNew) navigate(`/admin/produtos/${saved.id}`, { replace: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!activeRestaurant) return;
    setUploading(true);
    try {
      const url = await uploadFile({
        bucket: 'product-images',
        restaurantId: activeRestaurant.id,
        path: `products/${productId ?? (slugify(form.name) || 'novo')}/image`,
        file,
      });
      // Query string derruba o cache do CDN quando a foto é substituída
      update('image_url', `${url}?v=${Date.now()}`);
      toast('Imagem enviada', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (!activeRestaurant) return null;

  if (product.status === 'loading' && !product.data && !isNew) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[10px]" />
      </div>
    );
  }

  if (product.status === 'error' && !isNew) {
    return <ErrorState message={product.error ?? ''} onRetry={product.reload} />;
  }

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'detalhes', label: 'Detalhes' },
    { id: 'ar', label: 'Realidade aumentada', disabled: isNew },
    { id: 'adicionais', label: 'Adicionais', disabled: isNew },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={isNew ? 'Novo produto' : form.name || 'Produto'}
        description={isNew ? 'Salve os detalhes para liberar as abas de AR e adicionais.' : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/admin/produtos')}>
              Voltar
            </Button>
            <Button variant="teal" loading={saving} onClick={() => void handleSave()}>
              Salvar
            </Button>
          </>
        }
      />

      <div role="tablist" className="mb-4 flex gap-1 border-b border-hairline">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            disabled={item.disabled}
            onClick={() => setTab(item.id)}
            className={cn(
              'relative px-3 py-2 text-[14px] transition-colors disabled:opacity-40',
              tab === item.id ? 'font-medium text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {item.label}
            {tab === item.id && (
              <span className="ember-rule absolute inset-x-2 -bottom-px h-[2px] rounded-full" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {tab === 'detalhes' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <Panel className="space-y-4 p-5">
            <Field label="Nome" required>
              {(id) => (
                <Input
                  id={id}
                  value={form.name}
                  onChange={(event) => {
                    update('name', event.target.value);
                    if (!slugTouched) update('slug', slugify(event.target.value));
                  }}
                  placeholder="Smash Bacon"
                  maxLength={80}
                />
              )}
            </Field>

            <Field
              label="Endereço no cardápio"
              hint={`/r/${activeRestaurant.slug}/produto/${form.slug || 'nome-do-prato'}`}
            >
              {(id) => (
                <Input
                  id={id}
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    update('slug', slugify(event.target.value));
                  }}
                  placeholder="smash-bacon"
                />
              )}
            </Field>

            <Field label="Descrição">
              {(id) => (
                <Textarea
                  id={id}
                  value={form.description ?? ''}
                  onChange={(event) => update('description', event.target.value)}
                  placeholder="O que o cliente precisa saber para escolher este prato."
                  maxLength={400}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço" required>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    defaultValue={priceInput}
                    onChange={(event) =>
                      update('price_cents', Math.round(Number(event.target.value || 0) * 100))
                    }
                  />
                )}
              </Field>

              <Field label="Preço antes da promoção" hint="Deixe vazio se não houver promoção.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    defaultValue={
                      form.compare_at_price_cents ? (form.compare_at_price_cents / 100).toFixed(2) : ''
                    }
                    onChange={(event) =>
                      update(
                        'compare_at_price_cents',
                        event.target.value ? Math.round(Number(event.target.value) * 100) : null,
                      )
                    }
                  />
                )}
              </Field>
            </div>

            <Field label="Categoria">
              {(id) => (
                <Select
                  id={id}
                  value={form.category_id ?? ''}
                  onChange={(event) => update('category_id', event.target.value || null)}
                >
                  <option value="">Sem categoria</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Ingredientes" hint="Separe por vírgula.">
              {(id) => (
                <Input
                  id={id}
                  defaultValue={form.ingredients.join(', ')}
                  onChange={(event) => update('ingredients', splitList(event.target.value))}
                  placeholder="Blend 200 g, cheddar, bacon"
                />
              )}
            </Field>

            <Field label="Alergênicos" hint="Separe por vírgula. Aparece com destaque para o cliente.">
              {(id) => (
                <Input
                  id={id}
                  defaultValue={form.allergens.join(', ')}
                  onChange={(event) => update('allergens', splitList(event.target.value))}
                  placeholder="Glúten, leite, ovo"
                />
              )}
            </Field>

            <Field label="Selos" hint="Ex.: Novo, Mais pedido, Promoção.">
              {(id) => (
                <Input
                  id={id}
                  defaultValue={form.badges.join(', ')}
                  onChange={(event) => update('badges', splitList(event.target.value))}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tempo de preparo (min)">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    max="240"
                    defaultValue={form.prep_time_minutes ?? ''}
                    onChange={(event) =>
                      update('prep_time_minutes', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                )}
              </Field>
              <Field label="Calorias aproximadas">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    defaultValue={form.calories ?? ''}
                    onChange={(event) =>
                      update('calories', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                )}
              </Field>
            </div>

            <div className="space-y-3 border-t border-hairline pt-4">
              <Switch
                checked={form.is_available}
                onChange={(value) => update('is_available', value)}
                label="Disponível hoje"
                description="Desligue quando o prato acabar, sem tirar do cardápio."
              />
              <Switch
                checked={form.is_featured}
                onChange={(value) => update('is_featured', value)}
                label="Destacar no cardápio"
                description="Aparece na faixa de mais pedidos."
              />
            </div>
          </Panel>

          <Panel className="h-fit p-4">
            <p className="mb-2 text-[13px] font-medium">Foto do prato</p>
            <SmartImage
              src={form.image_url}
              alt=""
              ratio="4/3"
              className="rounded-[8px]"
              fallbackLabel={form.name || '?'}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImageUpload(file);
                event.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              fullWidth
              className="mt-3"
              loading={uploading}
              onClick={() => imageInputRef.current?.click()}
            >
              {form.image_url ? 'Trocar foto' : 'Enviar foto'}
            </Button>
            <p className="mt-2 text-[12px] text-muted">
              JPG, PNG, WebP ou AVIF até {STORAGE_LIMITS.image.label}. Proporção 4:3 fica melhor.
            </p>
          </Panel>
        </div>
      )}

      {tab === 'ar' && productId && (
        <ARModelEditor
          restaurantId={activeRestaurant.id}
          productId={productId}
          productName={form.name}
          model={model}
          onSave={async (input) => {
            const saved = await saveProductModel(activeRestaurant.id, productId, input);
            setModel(saved);
          }}
          onRemove={async () => {
            await deleteProductModel(productId);
            setModel(null);
          }}
        />
      )}

      {tab === 'adicionais' && productId && (
        <AddonsEditor restaurantId={activeRestaurant.id} productId={productId} />
      )}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
