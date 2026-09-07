-- =============================================================================
-- AR Menu · Funcoes RPC
--
-- Tudo que o cliente anonimo precisa escrever passa por aqui. O navegador nunca
-- envia totais, precos ou restaurant_id confiaveis: a funcao recalcula a partir
-- do banco.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding: cria restaurante, torna o usuario owner e assina o plano inicial
-- -----------------------------------------------------------------------------
create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_description text default null
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_restaurant public.restaurants;
  v_plan_id uuid;
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Endereco invalido: use apenas letras minusculas, numeros e hifens'
      using errcode = '22023';
  end if;

  insert into public.restaurants (name, slug, description)
  values (trim(p_name), lower(p_slug), p_description)
  returning * into v_restaurant;

  insert into public.restaurant_memberships (restaurant_id, user_id, role)
  values (v_restaurant.id, v_user_id, 'owner');

  select id into v_plan_id
    from public.subscription_plans
   where is_active order by sort_order limit 1;

  if v_plan_id is not null then
    insert into public.restaurant_subscriptions (restaurant_id, plan_id, status, current_period_end)
    values (v_restaurant.id, v_plan_id, 'trialing', now() + interval '14 days');
  end if;

  insert into public.qr_codes (restaurant_id, type, label, target_path)
  values (v_restaurant.id, 'general', 'Cardapio geral', '/r/' || v_restaurant.slug);

  return v_restaurant;
end;
$fn$;

grant execute on function public.create_restaurant(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Analytics: escrita anonima controlada por lista branca de eventos
-- -----------------------------------------------------------------------------
create or replace function public.track_event(
  p_restaurant_id uuid,
  p_event_name text,
  p_product_id uuid default null,
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_allowed constant text[] := array[
    'menu_viewed', 'category_viewed', 'product_viewed', 'search_performed',
    'product_ar_opened', 'product_ar_ready', 'product_ar_failed',
    'product_ar_placed', 'product_ar_exited', 'product_3d_opened',
    'product_added_to_cart', 'cart_viewed', 'checkout_started', 'order_created'
  ];
begin
  if not (p_event_name = any (v_allowed)) then
    raise exception 'Evento nao reconhecido: %', p_event_name using errcode = '22023';
  end if;

  if not public.restaurant_is_public(p_restaurant_id) then
    return; -- restaurante inativo: descarta silenciosamente
  end if;

  -- so aceita produto que realmente pertence ao restaurante informado
  if p_product_id is not null and not exists (
    select 1 from public.products
     where id = p_product_id and restaurant_id = p_restaurant_id
  ) then
    p_product_id := null;
  end if;

  insert into public.analytics_events
    (restaurant_id, product_id, event_name, session_id, metadata)
  values
    (p_restaurant_id, p_product_id, p_event_name, left(coalesce(p_session_id, ''), 64),
     coalesce(p_metadata, '{}'::jsonb));
end;
$fn$;

grant execute on function public.track_event(uuid, text, uuid, text, jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gera codigo curto e legivel do pedido (sem caracteres ambiguos)
-- -----------------------------------------------------------------------------
create or replace function public.generate_order_code()
returns text
language plpgsql
as $fn$
declare
  v_alphabet constant text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code text := '';
  i integer;
begin
  for i in 1..5 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Criacao de pedido: unica porta de entrada, com totais calculados no servidor
--
-- p_items: [{ "product_id": uuid, "quantity": int, "notes": text,
--             "addon_ids": [uuid, ...] }]
-- -----------------------------------------------------------------------------
create or replace function public.create_order(
  p_restaurant_slug text,
  p_items jsonb,
  p_table_code text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_restaurant  public.restaurants;
  v_table_id    uuid;
  v_order_id    uuid;
  v_code        text;
  v_item        jsonb;
  v_product     public.products;
  v_quantity    integer;
  v_addon_ids   uuid[];
  v_addons_json jsonb;
  v_addons_cents integer;
  v_line_total  integer;
  v_subtotal    integer := 0;
  v_attempt     integer := 0;
begin
  select * into v_restaurant
    from public.restaurants
   where slug = lower(p_restaurant_slug) and is_active;

  if v_restaurant.id is null then
    raise exception 'Restaurante nao encontrado' using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa de pelo menos um item' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Pedido excede o limite de 50 itens distintos' using errcode = '22023';
  end if;

  if p_table_code is not null then
    select id into v_table_id
      from public.tables
     where restaurant_id = v_restaurant.id
       and code = p_table_code
       and status <> 'inactive';
    if v_table_id is null then
      raise exception 'Mesa % nao encontrada neste restaurante', p_table_code using errcode = 'P0002';
    end if;
  end if;

  -- codigo unico por restaurante, com poucas tentativas
  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_order_code();
    exit when not exists (
      select 1 from public.orders where restaurant_id = v_restaurant.id and code = v_code
    );
    if v_attempt > 10 then
      raise exception 'Nao foi possivel gerar o codigo do pedido' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.orders (
    restaurant_id, table_id, code, status, customer_name, customer_phone,
    notes, subtotal_cents, total_cents, session_id
  ) values (
    v_restaurant.id, v_table_id, v_code, 'pending',
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    0, 0, left(coalesce(p_session_id, ''), 64)
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- FOR UPDATE: impede que o preco mude entre a leitura e a gravacao do item
    select * into v_product
      from public.products
     where id = (v_item ->> 'product_id')::uuid
       and restaurant_id = v_restaurant.id
     for update;

    if v_product.id is null then
      raise exception 'Produto indisponivel no cardapio deste restaurante' using errcode = 'P0002';
    end if;

    if not v_product.is_available then
      raise exception 'O item "%" nao esta disponivel no momento', v_product.name using errcode = '22023';
    end if;

    v_quantity := coalesce((v_item ->> 'quantity')::int, 1);
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Quantidade invalida para "%"', v_product.name using errcode = '22023';
    end if;

    -- adicionais: so contam os que pertencem ao proprio produto e estao ativos
    v_addon_ids := coalesce(
      (select array_agg(value::text::uuid)
         from jsonb_array_elements_text(coalesce(v_item -> 'addon_ids', '[]'::jsonb))),
      '{}'::uuid[]
    );

    select coalesce(sum(a.price_cents), 0),
           coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'name', a.name, 'price_cents', a.price_cents
           )), '[]'::jsonb)
      into v_addons_cents, v_addons_json
      from public.product_addons a
     where a.id = any (v_addon_ids)
       and a.product_id = v_product.id
       and a.is_active;

    v_line_total := (v_product.price_cents + v_addons_cents) * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id, restaurant_id, product_id, product_name, unit_price_cents,
      quantity, addons, addons_cents, notes, line_total_cents
    ) values (
      v_order_id, v_restaurant.id, v_product.id, v_product.name, v_product.price_cents,
      v_quantity, v_addons_json, v_addons_cents,
      nullif(trim(coalesce(v_item ->> 'notes', '')), ''), v_line_total
    );
  end loop;

  update public.orders
     set subtotal_cents = v_subtotal,
         total_cents = v_subtotal
   where id = v_order_id;

  insert into public.analytics_events (restaurant_id, order_id, event_name, session_id, metadata)
  values (v_restaurant.id, v_order_id, 'order_created', left(coalesce(p_session_id, ''), 64),
          jsonb_build_object('total_cents', v_subtotal, 'table_code', p_table_code));

  return jsonb_build_object(
    'id', v_order_id,
    'code', v_code,
    'status', 'pending',
    'subtotal_cents', v_subtotal,
    'total_cents', v_subtotal,
    'table_code', p_table_code,
    'created_at', now()
  );
end;
$fn$;

grant execute on function public.create_order(text, jsonb, text, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Consulta do pedido pelo cliente: exige o par (codigo, session_id)
-- -----------------------------------------------------------------------------
create or replace function public.get_order_by_code(
  p_restaurant_slug text,
  p_code text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.orders;
  v_items jsonb;
begin
  select o.* into v_order
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
   where r.slug = lower(p_restaurant_slug)
     and o.code = upper(p_code)
     and o.session_id = p_session_id
     and o.session_id <> '';

  if v_order.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', i.product_name,
           'quantity', i.quantity,
           'unit_price_cents', i.unit_price_cents,
           'addons', i.addons,
           'notes', i.notes,
           'line_total_cents', i.line_total_cents
         ) order by i.created_at), '[]'::jsonb)
    into v_items
    from public.order_items i
   where i.order_id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'status', v_order.status,
    'subtotal_cents', v_order.subtotal_cents,
    'total_cents', v_order.total_cents,
    'customer_name', v_order.customer_name,
    'notes', v_order.notes,
    'created_at', v_order.created_at,
    'items', v_items
  );
end;
$fn$;

grant execute on function public.get_order_by_code(text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Registro de scan de QR Code
-- -----------------------------------------------------------------------------
create or replace function public.register_qr_scan(p_restaurant_id uuid, p_target_path text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.qr_codes
     set scan_count = scan_count + 1
   where restaurant_id = p_restaurant_id
     and target_path = p_target_path
     and is_active;
end;
$fn$;

grant execute on function public.register_qr_scan(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Metricas do painel.
-- SECURITY INVOKER (padrao): as politicas de RLS continuam valendo, entao um
-- membro so consegue agregar dados do proprio restaurante.
-- -----------------------------------------------------------------------------
create or replace function public.restaurant_metrics(
  p_restaurant_id uuid,
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now()
)
returns jsonb
language sql
stable
as $fn$
  with orders_window as (
    select * from public.orders
     where restaurant_id = p_restaurant_id
       and created_at between p_from and p_to
       and status <> 'cancelled'
  ),
  events_window as (
    select * from public.analytics_events
     where restaurant_id = p_restaurant_id
       and occurred_at between p_from and p_to
  ),
  funnel as (
    select
      count(*) filter (where event_name = 'product_viewed')        as product_views,
      count(*) filter (where event_name = 'product_ar_opened')     as ar_opens,
      count(*) filter (where event_name = 'product_ar_placed')     as ar_placements,
      count(*) filter (where event_name = 'product_added_to_cart') as cart_adds,
      count(*) filter (where event_name = 'order_created')         as orders_created,
      count(distinct session_id) filter (where session_id <> '')   as sessions
    from events_window
  ),
  totals as (
    select
      count(*)                          as order_count,
      coalesce(sum(total_cents), 0)     as revenue_cents,
      coalesce(round(avg(total_cents)), 0) as avg_ticket_cents
    from orders_window
  ),
  catalog as (
    select
      (select count(*) from public.products p
        where p.restaurant_id = p_restaurant_id and p.is_available) as active_products,
      (select count(*) from public.categories c
        where c.restaurant_id = p_restaurant_id and c.is_active)    as active_categories,
      (select count(*) from public.product_models m
        where m.restaurant_id = p_restaurant_id and m.ar_enabled)   as ar_products
  ),
  top_selling as (
    select coalesce(jsonb_agg(t), '[]'::jsonb) as data from (
      select i.product_id, i.product_name,
             sum(i.quantity)::int as units,
             sum(i.line_total_cents)::int as revenue_cents
        from public.order_items i
        join orders_window o on o.id = i.order_id
       group by i.product_id, i.product_name
       order by units desc
       limit 8
    ) t
  ),
  top_viewed as (
    select coalesce(jsonb_agg(t), '[]'::jsonb) as data from (
      select e.product_id, p.name as product_name,
             count(*) filter (where e.event_name = 'product_viewed')::int    as views,
             count(*) filter (where e.event_name = 'product_ar_opened')::int as ar_opens
        from events_window e
        join public.products p on p.id = e.product_id
       where e.product_id is not null
       group by e.product_id, p.name
       order by views desc
       limit 8
    ) t
  ),
  daily as (
    select coalesce(jsonb_agg(t order by t.day), '[]'::jsonb) as data from (
      select date_trunc('day', created_at)::date as day,
             count(*)::int as orders,
             sum(total_cents)::int as revenue_cents
        from orders_window
       group by 1
    ) t
  )
  select jsonb_build_object(
    'order_count',        (select order_count from totals),
    'revenue_cents',      (select revenue_cents from totals),
    'avg_ticket_cents',   (select avg_ticket_cents from totals),
    'active_products',    (select active_products from catalog),
    'active_categories',  (select active_categories from catalog),
    'ar_products',        (select ar_products from catalog),
    'sessions',           (select sessions from funnel),
    'product_views',      (select product_views from funnel),
    'ar_opens',           (select ar_opens from funnel),
    'ar_placements',      (select ar_placements from funnel),
    'cart_adds',          (select cart_adds from funnel),
    'orders_created',     (select orders_created from funnel),
    'top_selling',        (select data from top_selling),
    'top_viewed',         (select data from top_viewed),
    'daily',              (select data from daily)
  );
$fn$;

grant execute on function public.restaurant_metrics(uuid, timestamptz, timestamptz) to authenticated;
