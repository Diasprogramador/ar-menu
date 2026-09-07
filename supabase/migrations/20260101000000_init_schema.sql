-- =============================================================================
-- AR Menu · Schema inicial
-- Plataforma SaaS multi-tenant de cardapio digital com realidade aumentada.
-- Limite de tenant: restaurants.id (referenciado como restaurant_id).
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'admin', 'staff');
create type public.order_status  as enum ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');
create type public.table_status  as enum ('available', 'occupied', 'reserved', 'inactive');
create type public.qr_code_type  as enum ('general', 'table', 'product');
create type public.model_format  as enum ('glb', 'gltf');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- -----------------------------------------------------------------------------
-- Planos SaaS (catalogo global, sem tenant)
-- -----------------------------------------------------------------------------
create table public.subscription_plans (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  price_cents  integer not null default 0 check (price_cents >= 0),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  features     jsonb not null default '[]'::jsonb,
  -- entitlements explicitos: verificacoes de feature leem daqui, nao do "code"
  entitlements jsonb not null default '{}'::jsonb,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on column public.subscription_plans.entitlements is
  'Ex.: {"ar": true, "analytics": true, "max_products": 200}. Feature flags leem esta coluna.';

-- -----------------------------------------------------------------------------
-- Restaurantes (raiz do tenant)
-- -----------------------------------------------------------------------------
create table public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  slug          citext not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 63),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  logo_url      text,
  cover_url     text,
  address       text,
  phone         text,
  whatsapp      text,
  instagram     text,
  currency      char(3) not null default 'BRL',
  locale        text not null default 'pt-BR',
  timezone      text not null default 'America/Sao_Paulo',
  accent_color  text not null default '#FF6B2C' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- {"mon": [["11:00","23:00"]], ...}; dia ausente ou vazio = fechado
  opening_hours jsonb not null default '{}'::jsonb,
  -- null = seguir opening_hours; true/false = override manual do restaurante
  is_open_override boolean,
  closed_message   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Identidade: profiles (1:1 com auth.users) + memberships (N:N com restaurants)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_memberships (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.membership_role not null default 'staff',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create index idx_memberships_user on public.restaurant_memberships (user_id);
create index idx_memberships_restaurant on public.restaurant_memberships (restaurant_id);

-- -----------------------------------------------------------------------------
-- Assinaturas por restaurante
-- -----------------------------------------------------------------------------
create table public.restaurant_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  restaurant_id            uuid not null unique references public.restaurants (id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans (id),
  status                   public.subscription_status not null default 'trialing',
  current_period_end       timestamptz,
  -- campos do provedor de pagamento ficam isolados aqui
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catalogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  slug          citext not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description   text,
  icon          text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create index idx_categories_restaurant_active
  on public.categories (restaurant_id, is_active, sort_order);

create table public.products (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null references public.restaurants (id) on delete cascade,
  category_id            uuid references public.categories (id) on delete set null,
  name                   text not null check (length(trim(name)) > 0),
  slug                   citext not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description            text,
  ingredients            text[] not null default '{}',
  allergens              text[] not null default '{}',
  -- dinheiro sempre em centavos inteiros; nunca float
  price_cents            integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  image_url              text,
  badges                 text[] not null default '{}',
  is_available           boolean not null default true,
  is_featured            boolean not null default false,
  prep_time_minutes      integer check (prep_time_minutes is null or prep_time_minutes between 0 and 240),
  calories               integer check (calories is null or calories >= 0),
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (restaurant_id, slug),
  constraint promo_price_is_lower
    check (compare_at_price_cents is null or compare_at_price_cents > price_cents)
);

create index idx_products_restaurant_category on public.products (restaurant_id, category_id, sort_order);
create index idx_products_restaurant_available on public.products (restaurant_id, is_available);
create index idx_products_restaurant_featured on public.products (restaurant_id, is_featured) where is_featured;
create index idx_products_search on public.products
  using gin (to_tsvector('portuguese', name || ' ' || coalesce(description, '')));

create table public.product_addons (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  group_name    text not null default 'Adicionais',
  name          text not null check (length(trim(name)) > 0),
  price_cents   integer not null default 0 check (price_cents >= 0),
  is_required   boolean not null default false,
  max_select    integer not null default 1 check (max_select between 1 and 20),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_addons_product on public.product_addons (product_id, sort_order);

-- -----------------------------------------------------------------------------
-- Modelo 3D / configuracao AR (1:1 com produto)
-- Dimensoes fisicas em centimetros: unidade unica no data layer.
-- -----------------------------------------------------------------------------
create table public.product_models (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants (id) on delete cascade,
  product_id        uuid not null unique references public.products (id) on delete cascade,
  model_url         text not null,
  -- USDZ opcional: unico caminho de AR nativo no iOS (Quick Look)
  usdz_url          text,
  format            public.model_format not null default 'glb',
  file_size_bytes   bigint check (file_size_bytes is null or file_size_bytes > 0),
  ar_enabled        boolean not null default true,
  width_cm          numeric(6,2) check (width_cm    is null or width_cm    between 0.5 and 300),
  height_cm         numeric(6,2) check (height_cm   is null or height_cm   between 0.5 and 300),
  depth_cm          numeric(6,2) check (depth_cm    is null or depth_cm    between 0.5 and 300),
  diameter_cm       numeric(6,2) check (diameter_cm is null or diameter_cm between 0.5 and 300),
  scale_multiplier  numeric(5,3) not null default 1.0 check (scale_multiplier between 0.1 and 10),
  rotation_x_deg    numeric(6,2) not null default 0 check (rotation_x_deg between -360 and 360),
  rotation_y_deg    numeric(6,2) not null default 0 check (rotation_y_deg between -360 and 360),
  rotation_z_deg    numeric(6,2) not null default 0 check (rotation_z_deg between -360 and 360),
  offset_x_cm       numeric(6,2) not null default 0 check (offset_x_cm between -100 and 100),
  offset_y_cm       numeric(6,2) not null default 0 check (offset_y_cm between -100 and 100),
  offset_z_cm       numeric(6,2) not null default 0 check (offset_z_cm between -100 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Precisa de pelo menos um eixo horizontal para calibrar a escala 1:1
  constraint has_horizontal_dimension
    check (width_cm is not null or diameter_cm is not null),
  constraint has_height
    check (height_cm is not null)
);

create index idx_product_models_restaurant on public.product_models (restaurant_id);
create index idx_product_models_ar_enabled on public.product_models (product_id) where ar_enabled;

-- -----------------------------------------------------------------------------
-- Mesas e QR Codes
-- -----------------------------------------------------------------------------
create table public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code          text not null check (code ~ '^[A-Za-z0-9-]{1,16}$'),
  label         text,
  seats         integer check (seats is null or seats between 1 and 40),
  location      text,
  status        public.table_status not null default 'available',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index idx_tables_restaurant on public.tables (restaurant_id, status);

create table public.qr_codes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  type          public.qr_code_type not null,
  table_id      uuid references public.tables (id) on delete cascade,
  product_id    uuid references public.products (id) on delete cascade,
  label         text not null,
  target_path   text not null,
  scan_count    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint qr_target_matches_type check (
    (type = 'general' and table_id is null and product_id is null) or
    (type = 'table'   and table_id is not null and product_id is null) or
    (type = 'product' and product_id is not null and table_id is null)
  )
);

create index idx_qr_codes_restaurant on public.qr_codes (restaurant_id, type);

-- -----------------------------------------------------------------------------
-- Pedidos (snapshot comercial imutavel)
-- -----------------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  table_id       uuid references public.tables (id) on delete set null,
  -- codigo curto legivel para o cliente citar ao garcom
  code           text not null,
  status         public.order_status not null default 'pending',
  customer_name  text,
  customer_phone text,
  notes          text,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents    integer not null check (total_cents >= 0),
  -- pagamento fica preparado, sem provedor acoplado
  payment_status    text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  payment_provider  text,
  payment_reference text,
  session_id     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index idx_orders_restaurant_created on public.orders (restaurant_id, created_at desc);
create index idx_orders_restaurant_status on public.orders (restaurant_id, status);
create index idx_orders_session on public.orders (session_id) where session_id is not null;

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  -- snapshot: pedidos historicos nunca sao recalculados a partir do preco atual
  product_name     text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity between 1 and 99),
  addons           jsonb not null default '[]'::jsonb,
  addons_cents     integer not null default 0 check (addons_cents >= 0),
  notes            text,
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at       timestamptz not null default now()
);

create index idx_order_items_order on public.order_items (order_id);
create index idx_order_items_product on public.order_items (restaurant_id, product_id);

-- -----------------------------------------------------------------------------
-- Analytics
-- -----------------------------------------------------------------------------
create table public.analytics_events (
  id            bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  order_id      uuid references public.orders (id) on delete set null,
  event_name    text not null,
  -- identificador anonimo de sessao gerado no browser; nao carrega dado pessoal
  session_id    text,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create index idx_analytics_restaurant_time on public.analytics_events (restaurant_id, occurred_at desc);
create index idx_analytics_restaurant_event on public.analytics_events (restaurant_id, event_name, occurred_at desc);
create index idx_analytics_product on public.analytics_events (restaurant_id, product_id, event_name);

-- -----------------------------------------------------------------------------
-- updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array[
    'restaurants', 'profiles', 'restaurant_subscriptions', 'categories',
    'products', 'product_models', 'tables', 'orders'
  ] loop
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $do$;

-- -----------------------------------------------------------------------------
-- Perfil automatico ao criar usuario no auth
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
