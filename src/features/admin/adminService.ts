import { supabase, toDataError } from '@/lib/supabase';
import type {
  Category,
  Product,
  ProductAddon,
  ProductModel,
  QrCode,
  QrCodeType,
  Restaurant,
  RestaurantMetrics,
  RestaurantTable,
  SubscriptionPlan,
} from '@/types/database';

/**
 * Operações do painel do restaurante.
 *
 * Todas as escritas passam pelo cliente `anon` autenticado: quem decide se elas
 * são permitidas são as políticas de RLS, que exigem vínculo de owner/admin com
 * o `restaurant_id` da linha. Enviar `restaurant_id` daqui não concede acesso —
 * uma tentativa de escrever no restaurante de outra pessoa é recusada pelo
 * banco, não por uma checagem nesta camada.
 */

/* -------------------------------------------------------------------------
 * Categorias
 * ---------------------------------------------------------------------- */

export async function listCategories(restaurantId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order');

  if (error) throw toDataError(error, 'Não foi possível carregar as categorias.');
  return (data ?? []) as Category[];
}

export type CategoryInput = Pick<Category, 'name' | 'slug' | 'description' | 'sort_order' | 'is_active'>;

export async function saveCategory(
  restaurantId: string,
  input: CategoryInput,
  categoryId?: string,
): Promise<Category> {
  const payload = { ...input, restaurant_id: restaurantId };

  const query = categoryId
    ? supabase.from('categories').update(payload).eq('id', categoryId).select().single()
    : supabase.from('categories').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw toDataError(error, 'Não foi possível salvar a categoria.');
  return data as Category;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) throw toDataError(error, 'Não foi possível excluir a categoria.');
}

/* -------------------------------------------------------------------------
 * Produtos
 * ---------------------------------------------------------------------- */

export type AdminProduct = Product & {
  product_models: ProductModel | null;
  categories: Pick<Category, 'id' | 'name'> | null;
};

export async function listProducts(restaurantId: string): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_models (*), categories (id, name)')
    .eq('restaurant_id', restaurantId)
    .order('sort_order');

  if (error) throw toDataError(error, 'Não foi possível carregar os produtos.');
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      ...(record as unknown as AdminProduct),
      product_models: unwrap<ProductModel>(record.product_models),
      categories: unwrap<Pick<Category, 'id' | 'name'>>(record.categories),
    };
  });
}

export async function getProduct(productId: string): Promise<AdminProduct | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_models (*), categories (id, name), product_addons (*)')
    .eq('id', productId)
    .maybeSingle();

  if (error) throw toDataError(error, 'Não foi possível carregar o produto.');
  if (!data) return null;

  const record = data as Record<string, unknown>;
  return {
    ...(record as unknown as AdminProduct),
    product_models: unwrap<ProductModel>(record.product_models),
    categories: unwrap<Pick<Category, 'id' | 'name'>>(record.categories),
  };
}

export type ProductInput = Pick<
  Product,
  | 'name'
  | 'slug'
  | 'description'
  | 'category_id'
  | 'price_cents'
  | 'compare_at_price_cents'
  | 'image_url'
  | 'ingredients'
  | 'allergens'
  | 'badges'
  | 'is_available'
  | 'is_featured'
  | 'prep_time_minutes'
  | 'calories'
  | 'sort_order'
>;

export async function saveProduct(
  restaurantId: string,
  input: ProductInput,
  productId?: string,
): Promise<Product> {
  const payload = { ...input, restaurant_id: restaurantId };

  const query = productId
    ? supabase.from('products').update(payload).eq('id', productId).select().single()
    : supabase.from('products').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw toDataError(error, 'Não foi possível salvar o produto.');
  return data as Product;
}

export async function setProductAvailability(productId: string, available: boolean): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ is_available: available })
    .eq('id', productId);
  if (error) throw toDataError(error, 'Não foi possível atualizar a disponibilidade.');
}

export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw toDataError(error, 'Não foi possível excluir o produto.');
}

/* -------------------------------------------------------------------------
 * Modelo 3D / AR
 * ---------------------------------------------------------------------- */

export type ProductModelInput = Pick<
  ProductModel,
  | 'model_url'
  | 'usdz_url'
  | 'format'
  | 'ar_enabled'
  | 'width_cm'
  | 'height_cm'
  | 'depth_cm'
  | 'diameter_cm'
  | 'scale_multiplier'
  | 'rotation_x_deg'
  | 'rotation_y_deg'
  | 'rotation_z_deg'
  | 'offset_x_cm'
  | 'offset_y_cm'
  | 'offset_z_cm'
> & { file_size_bytes?: number | null };

export async function saveProductModel(
  restaurantId: string,
  productId: string,
  input: ProductModelInput,
): Promise<ProductModel> {
  // `product_id` é único, então o upsert resolve criação e edição num caminho só
  const { data, error } = await supabase
    .from('product_models')
    .upsert({ ...input, restaurant_id: restaurantId, product_id: productId }, { onConflict: 'product_id' })
    .select()
    .single();

  if (error) throw toDataError(error, 'Não foi possível salvar a configuração de AR.');
  return data as ProductModel;
}

export async function deleteProductModel(productId: string): Promise<void> {
  const { error } = await supabase.from('product_models').delete().eq('product_id', productId);
  if (error) throw toDataError(error, 'Não foi possível remover o modelo 3D.');
}

/* -------------------------------------------------------------------------
 * Adicionais
 * ---------------------------------------------------------------------- */

export async function listAddons(productId: string): Promise<ProductAddon[]> {
  const { data, error } = await supabase
    .from('product_addons')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order');

  if (error) throw toDataError(error, 'Não foi possível carregar os adicionais.');
  return (data ?? []) as ProductAddon[];
}

export type AddonInput = Pick<
  ProductAddon,
  'group_name' | 'name' | 'price_cents' | 'is_required' | 'max_select' | 'sort_order' | 'is_active'
>;

export async function saveAddon(
  restaurantId: string,
  productId: string,
  input: AddonInput,
  addonId?: string,
): Promise<ProductAddon> {
  const payload = { ...input, restaurant_id: restaurantId, product_id: productId };
  const query = addonId
    ? supabase.from('product_addons').update(payload).eq('id', addonId).select().single()
    : supabase.from('product_addons').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw toDataError(error, 'Não foi possível salvar o adicional.');
  return data as ProductAddon;
}

export async function deleteAddon(addonId: string): Promise<void> {
  const { error } = await supabase.from('product_addons').delete().eq('id', addonId);
  if (error) throw toDataError(error, 'Não foi possível excluir o adicional.');
}

/* -------------------------------------------------------------------------
 * Mesas
 * ---------------------------------------------------------------------- */

export async function listTables(restaurantId: string): Promise<RestaurantTable[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('code');

  if (error) throw toDataError(error, 'Não foi possível carregar as mesas.');
  return (data ?? []) as RestaurantTable[];
}

export type TableInput = Pick<RestaurantTable, 'code' | 'label' | 'seats' | 'location' | 'status'>;

export async function saveTable(
  restaurantId: string,
  input: TableInput,
  tableId?: string,
): Promise<RestaurantTable> {
  const payload = { ...input, restaurant_id: restaurantId };
  const query = tableId
    ? supabase.from('tables').update(payload).eq('id', tableId).select().single()
    : supabase.from('tables').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw toDataError(error, 'Não foi possível salvar a mesa.');
  return data as RestaurantTable;
}

export async function deleteTable(tableId: string): Promise<void> {
  const { error } = await supabase.from('tables').delete().eq('id', tableId);
  if (error) throw toDataError(error, 'Não foi possível excluir a mesa.');
}

/* -------------------------------------------------------------------------
 * QR Codes
 * ---------------------------------------------------------------------- */

export async function listQrCodes(restaurantId: string): Promise<QrCode[]> {
  const { data, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('type')
    .order('label');

  if (error) throw toDataError(error, 'Não foi possível carregar os QR Codes.');
  return (data ?? []) as QrCode[];
}

export async function createQrCode(
  restaurantId: string,
  input: { type: QrCodeType; label: string; target_path: string; table_id?: string | null; product_id?: string | null },
): Promise<QrCode> {
  const { data, error } = await supabase
    .from('qr_codes')
    .insert({
      restaurant_id: restaurantId,
      type: input.type,
      label: input.label,
      target_path: input.target_path,
      table_id: input.table_id ?? null,
      product_id: input.product_id ?? null,
    })
    .select()
    .single();

  if (error) throw toDataError(error, 'Não foi possível criar o QR Code.');
  return data as QrCode;
}

export async function deleteQrCode(qrCodeId: string): Promise<void> {
  const { error } = await supabase.from('qr_codes').delete().eq('id', qrCodeId);
  if (error) throw toDataError(error, 'Não foi possível excluir o QR Code.');
}

/* -------------------------------------------------------------------------
 * Restaurante e assinatura
 * ---------------------------------------------------------------------- */

export type RestaurantSettingsInput = Partial<
  Pick<
    Restaurant,
    | 'name'
    | 'description'
    | 'address'
    | 'phone'
    | 'whatsapp'
    | 'instagram'
    | 'cover_url'
    | 'logo_url'
    | 'accent_color'
    | 'opening_hours'
    | 'is_open_override'
    | 'closed_message'
  >
>;

export async function updateRestaurant(
  restaurantId: string,
  patch: RestaurantSettingsInput,
): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .update(patch)
    .eq('id', restaurantId)
    .select()
    .single();

  if (error) throw toDataError(error, 'Não foi possível salvar as configurações.');
  return data as Restaurant;
}

export async function createRestaurant(input: {
  name: string;
  slug: string;
  description?: string;
}): Promise<Restaurant> {
  const { data, error } = await supabase.rpc('create_restaurant', {
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description ?? null,
  });

  if (error) throw toDataError(error, 'Não foi possível criar o restaurante.');
  return data as Restaurant;
}

export async function listPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw toDataError(error, 'Não foi possível carregar os planos.');
  return (data ?? []) as SubscriptionPlan[];
}

export async function getSubscription(restaurantId: string) {
  const { data, error } = await supabase
    .from('restaurant_subscriptions')
    .select('*, subscription_plans (*)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) throw toDataError(error, 'Não foi possível carregar a assinatura.');
  if (!data) return null;

  const record = data as Record<string, unknown>;
  return {
    ...(record as unknown as { status: string; current_period_end: string | null }),
    plan: unwrap<SubscriptionPlan>(record.subscription_plans),
  };
}

/* -------------------------------------------------------------------------
 * Métricas
 * ---------------------------------------------------------------------- */

export async function getMetrics(
  restaurantId: string,
  days = 30,
): Promise<RestaurantMetrics> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('restaurant_metrics', {
    p_restaurant_id: restaurantId,
    p_from: from,
    p_to: new Date().toISOString(),
  });

  if (error) throw toDataError(error, 'Não foi possível carregar as métricas.');
  return data as RestaurantMetrics;
}

/* -------------------------------------------------------------------------
 * Upload de arquivos
 * ---------------------------------------------------------------------- */

export const STORAGE_LIMITS = {
  image: { bytes: 5 * 1024 * 1024, label: '5 MB' },
  model: { bytes: 25 * 1024 * 1024, label: '25 MB' },
} as const;

const MODEL_EXTENSIONS = ['.glb', '.gltf', '.usdz'];

/**
 * Sobe um arquivo mantendo o caminho dentro do tenant.
 *
 * O prefixo `restaurants/{restaurantId}/` não é decoração: as políticas de
 * storage extraem o id desse caminho para decidir se a escrita é permitida.
 */
export async function uploadFile(params: {
  bucket: 'product-images' | 'product-models' | 'restaurant-branding';
  restaurantId: string;
  path: string;
  file: File;
}): Promise<string> {
  const { bucket, restaurantId, path, file } = params;
  const isModel = bucket === 'product-models';
  const limit = isModel ? STORAGE_LIMITS.model : STORAGE_LIMITS.image;

  if (file.size > limit.bytes) {
    throw new Error(`O arquivo passa de ${limit.label}. Otimize antes de enviar.`);
  }

  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (isModel && !MODEL_EXTENSIONS.includes(extension)) {
    throw new Error('Envie um arquivo .glb, .gltf ou .usdz.');
  }
  if (!isModel && !file.type.startsWith('image/')) {
    throw new Error('Envie um arquivo de imagem.');
  }

  const fullPath = `restaurants/${restaurantId}/${path}${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(fullPath, file, {
    upsert: true,
    contentType: isModel ? guessModelMime(extension) : file.type,
    cacheControl: '3600',
  });

  if (error) throw toDataError(error, 'Não foi possível enviar o arquivo.');

  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return data.publicUrl;
}

function guessModelMime(extension: string): string {
  if (extension === '.gltf') return 'model/gltf+json';
  if (extension === '.usdz') return 'model/vnd.usdz+zip';
  return 'model/gltf-binary';
}

function unwrap<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}
