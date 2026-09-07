-- =============================================================================
-- AR Menu · Row Level Security
--
-- Regra central: o isolamento entre restaurantes e garantido pelo banco, nao
-- pelo frontend. Toda tabela com dono tem RLS habilitado e politicas separadas
-- por operacao.
--
-- Dois publicos distintos:
--   anon           -> le apenas o cardapio publico de restaurantes ativos
--   authenticated  -> le/escreve apenas dados dos restaurantes onde e membro
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de associacao.
-- SECURITY DEFINER para nao disparar RLS recursiva ao consultar memberships
-- dentro das proprias politicas.
-- -----------------------------------------------------------------------------
create or replace function public.is_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.restaurant_memberships m
     where m.restaurant_id = p_restaurant_id
       and m.user_id = auth.uid()
  );
$fn$;

create or replace function public.has_restaurant_role(
  p_restaurant_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.restaurant_memberships m
     where m.restaurant_id = p_restaurant_id
       and m.user_id = auth.uid()
       and m.role = any (p_roles)
  );
$fn$;

-- Restaurante ativo: pre-condicao de qualquer leitura publica
create or replace function public.restaurant_is_public(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.restaurants r
     where r.id = p_restaurant_id and r.is_active
  );
$fn$;

revoke execute on function public.is_member(uuid) from public;
revoke execute on function public.has_restaurant_role(uuid, public.membership_role[]) from public;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_restaurant_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.restaurant_is_public(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Habilita RLS em tudo
-- -----------------------------------------------------------------------------
alter table public.restaurants             enable row level security;
alter table public.profiles                enable row level security;
alter table public.restaurant_memberships  enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.subscription_plans      enable row level security;
alter table public.categories              enable row level security;
alter table public.products                enable row level security;
alter table public.product_addons          enable row level security;
alter table public.product_models          enable row level security;
alter table public.tables                  enable row level security;
alter table public.qr_codes                enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.analytics_events        enable row level security;

-- -----------------------------------------------------------------------------
-- subscription_plans: catalogo publico, escrita apenas por service role
-- -----------------------------------------------------------------------------
create policy plans_public_read on public.subscription_plans
  for select to anon, authenticated using (is_active);

-- -----------------------------------------------------------------------------
-- restaurants
-- -----------------------------------------------------------------------------
create policy restaurants_public_read on public.restaurants
  for select to anon using (is_active);

create policy restaurants_member_read on public.restaurants
  for select to authenticated using (is_active or public.is_member(id));

create policy restaurants_owner_update on public.restaurants
  for update to authenticated
  using (public.has_restaurant_role(id, array['owner', 'admin']::public.membership_role[]))
  with check (public.has_restaurant_role(id, array['owner', 'admin']::public.membership_role[]));

-- INSERT/DELETE de restaurante passa por fluxo de onboarding server-side
-- (RPC create_restaurant), nunca por escrita direta do cliente.

-- -----------------------------------------------------------------------------
-- profiles: cada usuario ve e edita apenas o proprio perfil
-- -----------------------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- restaurant_memberships
-- -----------------------------------------------------------------------------
create policy memberships_self_read on public.restaurant_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_member(restaurant_id));

create policy memberships_admin_insert on public.restaurant_memberships
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['owner', 'admin']::public.membership_role[]));

create policy memberships_admin_update on public.restaurant_memberships
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['owner']::public.membership_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['owner']::public.membership_role[]));

create policy memberships_admin_delete on public.restaurant_memberships
  for delete to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner']::public.membership_role[])
    -- um owner nao pode remover a si mesmo e deixar o restaurante orfao
    and user_id <> auth.uid()
  );

-- -----------------------------------------------------------------------------
-- restaurant_subscriptions: leitura por membros, escrita por service role
-- (webhook do provedor de pagamento roda server-side)
-- -----------------------------------------------------------------------------
create policy subscriptions_member_read on public.restaurant_subscriptions
  for select to authenticated using (public.is_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- Macro para as tabelas de catalogo, que compartilham o mesmo padrao:
--   leitura publica quando o restaurante esta ativo
--   escrita apenas por owner/admin do restaurante
-- -----------------------------------------------------------------------------
do $do$
declare tbl text;
begin
  foreach tbl in array array['categories', 'products', 'product_addons', 'product_models'] loop
    execute format($pol$
      create policy %1$s_public_read on public.%1$s
        for select to anon
        using (public.restaurant_is_public(restaurant_id));

      create policy %1$s_member_read on public.%1$s
        for select to authenticated
        using (public.restaurant_is_public(restaurant_id) or public.is_member(restaurant_id));

      create policy %1$s_member_insert on public.%1$s
        for insert to authenticated
        with check (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));

      create policy %1$s_member_update on public.%1$s
        for update to authenticated
        using (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]))
        with check (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));

      create policy %1$s_member_delete on public.%1$s
        for delete to authenticated
        using (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));
    $pol$, tbl);
  end loop;
end $do$;

-- -----------------------------------------------------------------------------
-- tables: o cliente precisa resolver o codigo da mesa vindo do QR Code
-- -----------------------------------------------------------------------------
create policy tables_public_read on public.tables
  for select to anon
  using (public.restaurant_is_public(restaurant_id) and status <> 'inactive');

create policy tables_member_read on public.tables
  for select to authenticated
  using (public.restaurant_is_public(restaurant_id) or public.is_member(restaurant_id));

create policy tables_member_write on public.tables
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));

-- -----------------------------------------------------------------------------
-- qr_codes: dado operacional interno, nao e exposto ao anon
-- -----------------------------------------------------------------------------
create policy qr_codes_member_all on public.qr_codes
  for all to authenticated
  using (public.is_member(restaurant_id))
  with check (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));

-- -----------------------------------------------------------------------------
-- orders / order_items
--
-- O cliente anonimo NAO escreve nem le diretamente. Criacao passa pela RPC
-- create_order (SECURITY DEFINER), que recalcula precos no servidor; consulta
-- passa pela RPC get_order_by_code, que exige o par (codigo, session_id).
-- -----------------------------------------------------------------------------
create policy orders_member_read on public.orders
  for select to authenticated using (public.is_member(restaurant_id));

create policy orders_member_update on public.orders
  for update to authenticated
  using (public.is_member(restaurant_id))
  with check (public.is_member(restaurant_id));

create policy orders_member_delete on public.orders
  for delete to authenticated
  using (public.has_restaurant_role(restaurant_id, array['owner','admin']::public.membership_role[]));

create policy order_items_member_read on public.order_items
  for select to authenticated using (public.is_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- analytics_events: escrita apenas via RPC track_event; leitura por membros
-- -----------------------------------------------------------------------------
create policy analytics_member_read on public.analytics_events
  for select to authenticated using (public.is_member(restaurant_id));
