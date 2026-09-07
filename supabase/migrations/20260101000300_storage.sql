-- =============================================================================
-- AR Menu · Storage
--
-- Convencao de caminho (o segundo segmento e sempre o tenant):
--   restaurants/{restaurantId}/products/{productId}/image.webp
--   restaurants/{restaurantId}/products/{productId}/model.glb
--   restaurants/{restaurantId}/branding/logo.png
--
-- Leitura publica: o cardapio e o visualizador 3D precisam buscar os arquivos
-- direto do CDN. Escrita: apenas owner/admin do restaurante dono do caminho.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('product-models', 'product-models', true, 26214400,
   array['model/gltf-binary', 'model/gltf+json', 'model/vnd.usdz+zip', 'application/octet-stream']),
  ('restaurant-branding', 'restaurant-branding', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Extrai o restaurant_id do caminho e confirma que quem escreve e admin dele
create or replace function public.storage_path_is_writable(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $fn$
declare
  v_parts text[] := storage.foldername(p_object_name);
  v_restaurant_id uuid;
begin
  if array_length(v_parts, 1) < 2 or v_parts[1] <> 'restaurants' then
    return false;
  end if;

  begin
    v_restaurant_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.has_restaurant_role(
    v_restaurant_id,
    array['owner', 'admin']::public.membership_role[]
  );
end;
$fn$;

grant execute on function public.storage_path_is_writable(text) to authenticated;

do $do$
declare b text;
begin
  foreach b in array array['product-images', 'product-models', 'restaurant-branding'] loop
    execute format($pol$
      create policy %2$s on storage.objects
        for select to anon, authenticated
        using (bucket_id = %1$L);

      create policy %3$s on storage.objects
        for insert to authenticated
        with check (bucket_id = %1$L and public.storage_path_is_writable(name));

      create policy %4$s on storage.objects
        for update to authenticated
        using (bucket_id = %1$L and public.storage_path_is_writable(name))
        with check (bucket_id = %1$L and public.storage_path_is_writable(name));

      create policy %5$s on storage.objects
        for delete to authenticated
        using (bucket_id = %1$L and public.storage_path_is_writable(name));
    $pol$,
      b,
      format('%s_public_read', replace(b, '-', '_')),
      format('%s_member_insert', replace(b, '-', '_')),
      format('%s_member_update', replace(b, '-', '_')),
      format('%s_member_delete', replace(b, '-', '_'))
    );
  end loop;
end $do$;
