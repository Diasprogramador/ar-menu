/**
 * Tipos do banco, espelhando supabase/migrations.
 *
 * Mantidos à mão em vez de gerados para que o repositório continue tipado sem
 * exigir que quem clona rode a CLI do Supabase antes de compilar. Ao alterar
 * uma migration, ajuste este arquivo na mesma mudança.
 */

export type MembershipRole = 'owner' | 'admin' | 'staff';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'inactive';
export type QrCodeType = 'general' | 'table' | 'product';
export type ModelFormat = 'glb' | 'gltf';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

/** Segunda a domingo, no formato usado por `Date.getDay()` remapeado. */
export type WeekdayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type OpeningHours = Partial<Record<WeekdayKey, [string, string][]>>;

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  currency: string;
  locale: string;
  timezone: string;
  accent_color: string;
  opening_hours: OpeningHours;
  is_open_override: boolean | null;
  closed_message: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestaurantMembership {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_interval: 'month' | 'year';
  features: string[];
  entitlements: PlanEntitlements;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface PlanEntitlements {
  ar?: boolean;
  analytics?: boolean;
  models_3d?: boolean;
  branding?: boolean;
  max_products?: number | null;
  max_users?: number | null;
}

export interface RestaurantSubscription {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  ingredients: string[];
  allergens: string[];
  price_cents: number;
  compare_at_price_cents: number | null;
  image_url: string | null;
  badges: string[];
  is_available: boolean;
  is_featured: boolean;
  prep_time_minutes: number | null;
  calories: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductAddon {
  id: string;
  restaurant_id: string;
  product_id: string;
  group_name: string;
  name: string;
  price_cents: number;
  is_required: boolean;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/**
 * Configuração de AR de um produto.
 *
 * Todas as medidas físicas ficam em centímetros: uma unidade só no data layer,
 * convertida para metros apenas na fronteira com o renderizador.
 */
export interface ProductModel {
  id: string;
  restaurant_id: string;
  product_id: string;
  model_url: string;
  usdz_url: string | null;
  format: ModelFormat;
  file_size_bytes: number | null;
  ar_enabled: boolean;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  diameter_cm: number | null;
  scale_multiplier: number;
  rotation_x_deg: number;
  rotation_y_deg: number;
  rotation_z_deg: number;
  offset_x_cm: number;
  offset_y_cm: number;
  offset_z_cm: number;
  created_at: string;
  updated_at: string;
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  code: string;
  label: string | null;
  seats: number | null;
  location: string | null;
  status: TableStatus;
  created_at: string;
  updated_at: string;
}

export interface QrCode {
  id: string;
  restaurant_id: string;
  type: QrCodeType;
  table_id: string | null;
  product_id: string | null;
  label: string;
  target_path: string;
  scan_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  code: string;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  payment_provider: string | null;
  payment_reference: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemAddonSnapshot {
  id: string;
  name: string;
  price_cents: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  restaurant_id: string;
  product_id: string | null;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  addons: OrderItemAddonSnapshot[];
  addons_cents: number;
  notes: string | null;
  line_total_cents: number;
  created_at: string;
}

export type AnalyticsEventName =
  | 'menu_viewed'
  | 'category_viewed'
  | 'product_viewed'
  | 'search_performed'
  | 'product_ar_opened'
  | 'product_ar_ready'
  | 'product_ar_failed'
  | 'product_ar_placed'
  | 'product_ar_exited'
  | 'product_3d_opened'
  | 'product_added_to_cart'
  | 'cart_viewed'
  | 'checkout_started'
  | 'order_created';

export interface AnalyticsEvent {
  id: number;
  restaurant_id: string;
  product_id: string | null;
  order_id: string | null;
  event_name: AnalyticsEventName;
  session_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

/** Retorno da RPC `restaurant_metrics`. */
export interface RestaurantMetrics {
  order_count: number;
  revenue_cents: number;
  avg_ticket_cents: number;
  active_products: number;
  active_categories: number;
  ar_products: number;
  sessions: number;
  product_views: number;
  ar_opens: number;
  ar_placements: number;
  cart_adds: number;
  orders_created: number;
  top_selling: { product_id: string | null; product_name: string; units: number; revenue_cents: number }[];
  top_viewed: { product_id: string; product_name: string; views: number; ar_opens: number }[];
  daily: { day: string; orders: number; revenue_cents: number }[];
}

/** Retorno da RPC `create_order`. */
export interface CreatedOrder {
  id: string;
  code: string;
  status: OrderStatus;
  subtotal_cents: number;
  total_cents: number;
  table_code: string | null;
  created_at: string;
}

/** Retorno da RPC `get_order_by_code`. */
export interface OrderReceipt {
  id: string;
  code: string;
  status: OrderStatus;
  subtotal_cents: number;
  total_cents: number;
  customer_name: string | null;
  notes: string | null;
  created_at: string;
  items: {
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    addons: OrderItemAddonSnapshot[];
    notes: string | null;
    line_total_cents: number;
  }[];
}

/* -------------------------------------------------------------------------
 * Projeções compostas usadas pelo cardápio público
 * ---------------------------------------------------------------------- */

export interface ProductWithModel extends Product {
  product_models: ProductModel | null;
}

export interface ProductDetail extends Product {
  product_models: ProductModel | null;
  product_addons: ProductAddon[];
  categories: Pick<Category, 'id' | 'name' | 'slug'> | null;
}

export interface MenuData {
  restaurant: Restaurant;
  categories: Category[];
  products: ProductWithModel[];
}
