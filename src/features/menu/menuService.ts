import {
  demoCategories,
  demoProductDetail,
  demoProducts,
  demoRestaurant,
  demoTableByCode,
} from './demoData';
import { env } from '@/lib/env';
import { supabase, toDataError } from '@/lib/supabase';
import type {
  Category,
  MenuData,
  ProductDetail,
  ProductWithModel,
  Restaurant,
  RestaurantTable,
} from '@/types/database';

/**
 * Leitura do cardápio público.
 *
 * Uma consulta só para a tela inicial: restaurante, categorias e produtos com o
 * modelo 3D embutido. Buscar produto a produto do componente seria N+1 na rede
 * do cliente, que é justamente a pior rede do fluxo.
 *
 * Só selecionamos as colunas que a interface usa — o payload público não deve
 * carregar dado que o cliente não precisa ver.
 *
 * Quando o app roda sem as chaves do Supabase — o caso da vitrine pública —
 * estas funções servem o catálogo de demonstração em `demoData.ts`, para que a
 * experiência principal continue completa em vez de mostrar uma tela de erro.
 */

const PRODUCT_FIELDS = `
  id, restaurant_id, category_id, name, slug, description, ingredients, allergens,
  price_cents, compare_at_price_cents, image_url, badges, is_available, is_featured,
  prep_time_minutes, calories, sort_order, created_at, updated_at
`;

const MODEL_FIELDS = `
  id, restaurant_id, product_id, model_url, usdz_url, format, file_size_bytes, ar_enabled,
  width_cm, height_cm, depth_cm, diameter_cm, scale_multiplier,
  rotation_x_deg, rotation_y_deg, rotation_z_deg,
  offset_x_cm, offset_y_cm, offset_z_cm, created_at, updated_at
`;

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  if (!env.isConfigured) {
    return slug === demoRestaurant.slug ? demoRestaurant : null;
  }

  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw toDataError(error, 'Não foi possível carregar este restaurante.');
  return data as Restaurant | null;
}

export async function getMenu(slug: string): Promise<MenuData | null> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;

  if (!env.isConfigured) {
    return { restaurant, categories: demoCategories, products: demoProducts };
  }

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('products')
      .select(`${PRODUCT_FIELDS}, product_models (${MODEL_FIELDS})`)
      .eq('restaurant_id', restaurant.id)
      .order('sort_order'),
  ]);

  if (categoriesResult.error) {
    throw toDataError(categoriesResult.error, 'Não foi possível carregar as categorias.');
  }
  if (productsResult.error) {
    throw toDataError(productsResult.error, 'Não foi possível carregar os pratos.');
  }

  return {
    restaurant,
    categories: (categoriesResult.data ?? []) as Category[],
    products: normalizeProducts(productsResult.data ?? []),
  };
}

export async function getProductDetail(
  restaurantId: string,
  productSlug: string,
): Promise<ProductDetail | null> {
  if (!env.isConfigured) return demoProductDetail(productSlug);

  const { data, error } = await supabase
    .from('products')
    .select(
      `${PRODUCT_FIELDS},
       product_models (${MODEL_FIELDS}),
       product_addons (id, restaurant_id, product_id, group_name, name, price_cents, is_required, max_select, sort_order, is_active, created_at),
       categories (id, name, slug)`,
    )
    .eq('restaurant_id', restaurantId)
    .eq('slug', productSlug)
    .maybeSingle();

  if (error) throw toDataError(error, 'Não foi possível carregar este prato.');
  if (!data) return null;

  const record = data as Record<string, unknown>;
  return {
    ...(record as unknown as ProductDetail),
    product_models: firstOrNull(record.product_models),
    product_addons: ((record.product_addons ?? []) as ProductDetail['product_addons'])
      .filter((addon) => addon.is_active)
      .sort((a, b) => a.sort_order - b.sort_order),
    categories: firstOrNull(record.categories),
  };
}

export async function getTableByCode(
  restaurantId: string,
  code: string,
): Promise<RestaurantTable | null> {
  if (!env.isConfigured) return demoTableByCode(code);

  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('code', code)
    .maybeSingle();

  if (error) throw toDataError(error, 'Não foi possível identificar a mesa.');
  return data as RestaurantTable | null;
}

/**
 * A relação 1:1 chega do PostgREST ora como objeto, ora como array de um
 * elemento, dependendo de como a chave estrangeira foi inferida. Normalizamos
 * uma vez aqui para o resto do app tratar sempre `ProductModel | null`.
 */
function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function normalizeProducts(rows: unknown[]): ProductWithModel[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      ...(record as unknown as ProductWithModel),
      product_models: firstOrNull(record.product_models),
    };
  });
}

/** Um produto só mostra o botão de AR quando tudo que ele exige existe. */
export function hasARExperience(product: ProductWithModel): boolean {
  const model = product.product_models;
  return Boolean(model?.ar_enabled && model.model_url);
}

/**
 * Busca local sobre o cardápio já carregado.
 *
 * Cardápio de restaurante raramente passa de algumas centenas de itens, então
 * filtrar em memória entrega resultado instantâneo e economiza uma ida à rede
 * a cada tecla digitada.
 */
export function searchProducts(products: ProductWithModel[], query: string): ProductWithModel[] {
  const term = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (term.length < 2) return [];

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  return products.filter((product) => {
    const haystack = [product.name, product.description ?? '', ...product.ingredients]
      .map(normalize)
      .join(' ');
    return haystack.includes(term);
  });
}

/** Aberto agora? Segue o override manual, depois a grade de horários. */
export function isRestaurantOpen(restaurant: Restaurant, now = new Date()): boolean {
  if (restaurant.is_open_override !== null) return restaurant.is_open_override;

  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const key = days[now.getDay()];
  if (!key) return true;

  const ranges = restaurant.opening_hours[key];
  if (!ranges || ranges.length === 0) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return ranges.some(([from, to]) => {
    const start = toMinutes(from);
    const end = toMinutes(to);
    // Faixas que cruzam a meia-noite: 18:00–01:00
    return end < start ? minutes >= start || minutes <= end : minutes >= start && minutes <= end;
  });
}

function toMinutes(time: string): number {
  const [hours = '0', mins = '0'] = time.split(':');
  return Number(hours) * 60 + Number(mins);
}
