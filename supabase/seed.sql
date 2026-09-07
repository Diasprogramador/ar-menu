-- =============================================================================
-- AR Menu · Dados de demonstracao
--
-- Restaurante ficticio "Brasa & Mesa": 6 categorias, 19 produtos, 12 modelos 3D
-- com dimensoes fisicas reais (medidas dos GLB gerados por
-- scripts/generate-demo-models.mjs), mesas, QR Codes, pedidos e eventos de
-- analytics dos ultimos 30 dias para que o painel abra com numeros reais.
--
-- Rodar com: supabase db reset
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Planos SaaS
-- -----------------------------------------------------------------------------
insert into public.subscription_plans (id, code, name, description, price_cents, features, entitlements, sort_order)
values
  ('11111111-0000-4000-8000-000000000001', 'basico', 'Básico',
   'Cardápio digital com QR Code e pedidos pela mesa.', 9900,
   '["Cardápio digital ilimitado", "QR Code geral e por mesa", "Pedidos na mesa", "1 usuário"]'::jsonb,
   '{"ar": false, "analytics": false, "models_3d": false, "max_products": 60, "max_users": 1}'::jsonb, 1),
  ('11111111-0000-4000-8000-000000000002', 'pro', 'Pro',
   'Tudo do Básico mais realidade aumentada e métricas de conversão.', 24900,
   '["Tudo do Básico", "Realidade aumentada", "Modelos 3D por produto", "Analytics e funil de conversão", "3 usuários"]'::jsonb,
   '{"ar": true, "analytics": true, "models_3d": true, "max_products": 300, "max_users": 3}'::jsonb, 2),
  ('11111111-0000-4000-8000-000000000003', 'premium', 'Premium',
   'Para redes: personalização de marca, múltiplas unidades e suporte dedicado.', 49900,
   '["Tudo do Pro", "Identidade visual personalizada", "Usuários ilimitados", "Múltiplas unidades", "Suporte dedicado"]'::jsonb,
   '{"ar": true, "analytics": true, "models_3d": true, "branding": true, "max_products": null, "max_users": null}'::jsonb, 3)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Restaurante
-- -----------------------------------------------------------------------------
insert into public.restaurants (
  id, slug, name, description, cover_url, logo_url, address, phone, whatsapp, instagram,
  accent_color, opening_hours
) values (
  '22222222-0000-4000-8000-000000000001',
  'brasa-e-mesa',
  'Brasa & Mesa',
  'Hambúrgueres na brasa, pizzas de forno a lenha e costela defumada por 12 horas. Desde 2019 na Vila Madalena.',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=70',
  '/demo/brasa-e-mesa-marca.svg',
  'Rua Harmonia, 412 — Vila Madalena, São Paulo',
  '(11) 3030-4120',
  '5511930304120',
  'brasaemesa',
  '#FF6B2C',
  '{"mon": [], "tue": [["18:00","23:30"]], "wed": [["18:00","23:30"]], "thu": [["18:00","23:30"]], "fri": [["18:00","01:00"]], "sat": [["12:00","01:00"]], "sun": [["12:00","22:00"]]}'::jsonb
) on conflict (slug) do nothing;

insert into public.restaurant_subscriptions (restaurant_id, plan_id, status, current_period_end)
values ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'active', now() + interval '22 days')
on conflict (restaurant_id) do nothing;

-- -----------------------------------------------------------------------------
-- Categorias
-- -----------------------------------------------------------------------------
insert into public.categories (id, restaurant_id, name, slug, description, icon, sort_order) values
  ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'Entradas',          'entradas',     'Para começar dividindo a mesa.',      'flame',   1),
  ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', 'Hambúrgueres',      'hamburgueres', 'Blend 200 g, pão brioche, na chapa.', 'burger',  2),
  ('33333333-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'Pizzas',            'pizzas',       'Massa de fermentação natural, 48 h.', 'pizza',   3),
  ('33333333-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000001', 'Pratos principais', 'principais',   'Cortes na brasa e defumados.',        'beef',    4),
  ('33333333-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000001', 'Sobremesas',        'sobremesas',   'Feitas na casa, todos os dias.',      'dessert', 5),
  ('33333333-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000001', 'Bebidas',           'bebidas',      'Drinks, sucos e clássicos geladinhos.','drink',  6)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
insert into public.products (
  id, restaurant_id, category_id, name, slug, description, ingredients, allergens,
  price_cents, compare_at_price_cents, image_url, badges, is_featured, prep_time_minutes, calories, sort_order
) values
  ('44444444-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001',
   'Bolinho de Costela', 'bolinho-de-costela',
   'Seis bolinhos de costela desfiada com catupiry, empanados na hora. Vêm com maionese de limão queimado.',
   array['Costela bovina','Catupiry','Farinha panko','Limão siciliano'], array['Glúten','Leite'],
   3890, null, 'https://images.unsplash.com/photo-1626082927389-6cd097cee6a6?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido'], false, 20, 620, 1),

  ('44444444-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001',
   'Anéis de Cebola', 'aneis-de-cebola',
   'Cebola roxa em anéis grossos, empanada em cerveja preta. Crocante por fora, doce por dentro.',
   array['Cebola roxa','Cerveja preta','Farinha de trigo','Páprica defumada'], array['Glúten'],
   2990, null, 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 15, 480, 2),

  ('44444444-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001',
   'Batata Crocante', 'batata-crocante',
   'Batata rústica frita duas vezes, alecrim e flor de sal. Porção generosa para dividir.',
   array['Batata asterix','Alecrim','Flor de sal'], array[]::text[],
   2490, null, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido'], true, 12, 540, 3),

  ('44444444-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002',
   'Smash Bacon', 'smash-bacon',
   'Dois discos de 90 g prensados na chapa, cheddar inglês derretido e bacon caramelizado no bourbon.',
   array['Blend 200 g','Cheddar inglês','Bacon','Pão brioche'], array['Glúten','Leite'],
   4290, null, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido','Novo'], true, 18, 890, 1),

  ('44444444-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002',
   'Burger da Casa', 'burger-da-casa',
   'Blend de 200 g malpassado, queijo prato, alface americana, tomate e cebola roxa no pão brioche.',
   array['Blend 200 g','Queijo prato','Alface','Tomate','Cebola roxa'], array['Glúten','Leite'],
   3990, 4590, 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=70',
   array['Promoção'], true, 18, 820, 2),

  ('44444444-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002',
   'Smash Duplo Cheddar', 'smash-duplo-cheddar',
   'Quatro discos smash, cheddar entre cada camada e molho da casa. Para quem chegou com fome de verdade.',
   array['Blend 360 g','Cheddar','Molho da casa','Pão brioche'], array['Glúten','Leite','Ovo'],
   5490, null, 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 22, 1180, 3),

  ('44444444-0000-4000-8000-000000000007', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003',
   'Pizza Margherita', 'pizza-margherita',
   'Molho de tomate San Marzano, muçarela de búfala, manjericão fresco e azeite extravirgem. 30 cm.',
   array['Tomate San Marzano','Muçarela de búfala','Manjericão','Azeite extravirgem'], array['Glúten','Leite'],
   5890, null, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido'], true, 25, 1250, 1),

  ('44444444-0000-4000-8000-000000000008', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003',
   'Pizza Pepperoni', 'pizza-pepperoni',
   'Pepperoni italiano fatiado fino, muçarela e orégano. Sai do forno com as bordas encaracoladas. 30 cm.',
   array['Pepperoni','Muçarela','Orégano','Molho de tomate'], array['Glúten','Leite'],
   6290, null, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=70',
   array[]::text[], true, 25, 1420, 2),

  ('44444444-0000-4000-8000-000000000009', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003',
   'Pizza Quatro Queijos', 'pizza-quatro-queijos',
   'Muçarela, gorgonzola, parmesão e catupiry. Finalizada com mel de laranjeira. 30 cm.',
   array['Muçarela','Gorgonzola','Parmesão','Catupiry','Mel'], array['Glúten','Leite'],
   6590, null, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 25, 1480, 3),

  ('44444444-0000-4000-8000-000000000010', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000004',
   'Costela Defumada', 'costela-defumada',
   'Costela bovina defumada 12 horas em lenha de goiabeira, glaceada com melado de cana. Serve duas pessoas.',
   array['Costela bovina','Melado de cana','Sal grosso','Pimenta-do-reino'], array[]::text[],
   8990, null, 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido'], true, 15, 1640, 1),

  ('44444444-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000004',
   'Salada Caesar', 'salada-caesar',
   'Alface romana, croutons de pão de fermentação natural, parmesão em lascas e molho caesar da casa.',
   array['Alface romana','Parmesão','Croutons','Molho caesar'], array['Glúten','Leite','Ovo','Peixe'],
   3690, null, 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 12, 420, 2),

  ('44444444-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000004',
   'Picanha na Brasa', 'picanha-na-brasa',
   'Picanha maturada 21 dias, selada na brasa e servida ao ponto com farofa de bacon e vinagrete.',
   array['Picanha','Farofa de bacon','Vinagrete'], array[]::text[],
   9890, null, 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=900&q=70',
   array['Novo'], false, 30, 1520, 3),

  ('44444444-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000005',
   'Brownie com Sorvete', 'brownie-com-sorvete',
   'Brownie de chocolate 70 % com nozes, servido morno com bola de sorvete de baunilha e calda quente.',
   array['Chocolate 70%','Nozes','Sorvete de baunilha'], array['Glúten','Leite','Ovo','Oleaginosas'],
   2890, null, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=70',
   array['Mais pedido'], true, 10, 680, 1),

  ('44444444-0000-4000-8000-000000000014', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000005',
   'Petit Gateau', 'petit-gateau',
   'Bolinho de chocolate com recheio líquido, sorvete de creme e frutas vermelhas. Sai do forno em 12 minutos.',
   array['Chocolate meio amargo','Sorvete de creme','Frutas vermelhas'], array['Glúten','Leite','Ovo'],
   3190, null, 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 12, 620, 2),

  ('44444444-0000-4000-8000-000000000015', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000005',
   'Pudim de Leite', 'pudim-de-leite',
   'Pudim de leite condensado com calda de caramelo escuro. Receita da avó, sem furinhos.',
   array['Leite condensado','Ovos','Açúcar'], array['Leite','Ovo'],
   2290, null, 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 5, 380, 3),

  ('44444444-0000-4000-8000-000000000016', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000006',
   'Milkshake de Morango', 'milkshake-de-morango',
   'Sorvete de creme batido com morangos frescos, chantilly e cereja. Copo de 400 ml.',
   array['Sorvete de creme','Morango','Chantilly'], array['Leite'],
   2490, null, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=70',
   array[]::text[], true, 8, 520, 1),

  ('44444444-0000-4000-8000-000000000017', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000006',
   'Refrigerante', 'refrigerante',
   'Lata 350 ml servida no copo com gelo e limão. Cola, guaraná, laranja ou limão.',
   array[]::text[], array[]::text[],
   990, null, 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 2, 140, 2),

  ('44444444-0000-4000-8000-000000000018', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000006',
   'Suco Natural', 'suco-natural',
   'Fruta da estação espremida na hora, sem açúcar. Laranja, abacaxi com hortelã ou maracujá.',
   array['Fruta da estação'], array[]::text[],
   1490, null, 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 5, 120, 3),

  ('44444444-0000-4000-8000-000000000019', '22222222-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000006',
   'Água com Gás', 'agua-com-gas',
   'Garrafa 500 ml gelada, com rodela de limão.',
   array[]::text[], array[]::text[],
   790, null, 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=70',
   array[]::text[], false, 1, 0, 4)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Modelos 3D e configuracao AR
-- Dimensoes conferidas contra o bounding box de cada GLB gerado.
-- -----------------------------------------------------------------------------
insert into public.product_models (
  restaurant_id, product_id, model_url, format, ar_enabled,
  width_cm, height_cm, depth_cm, diameter_cm, scale_multiplier, file_size_bytes
) values
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000004', '/demo-models/smash-bacon.glb',      'glb', true, 12.7,  9.9, 12.2, null, 1.0, 197632),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000005', '/demo-models/burger-da-casa.glb',   'glb', true, 15.7,  9.8, 15.4, null, 1.0, 204800),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000007', '/demo-models/pizza-margherita.glb', 'glb', true, null,  2.1, null, 30.4, 1.0, 277504),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000008', '/demo-models/pizza-pepperoni.glb',  'glb', true, null,  2.1, null, 30.4, 1.0, 381952),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000003', '/demo-models/batata-crocante.glb',  'glb', true, 10.1, 15.1, 10.8, null, 1.0,  60416),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000002', '/demo-models/aneis-de-cebola.glb',  'glb', true, 15.4,  8.2, 15.6, null, 1.0,  63488),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000013', '/demo-models/brownie.glb',          'glb', true, 18.0,  6.4, 18.0, null, 1.0,  57344),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000014', '/demo-models/petit-gateau.glb',     'glb', true, 15.0,  6.2, 15.0, null, 1.0,  64512),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000016', '/demo-models/milkshake.glb',        'glb', true, null, 20.7, null,  8.4, 1.0,  81920),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000017', '/demo-models/refrigerante.glb',     'glb', true, null, 14.0, null,  7.8, 1.0,  43008),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000010', '/demo-models/costela-defumada.glb', 'glb', true, 24.0,  5.0, 17.0, null, 1.0,  18432),
  ('22222222-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000011', '/demo-models/salada-caesar.glb',    'glb', true, null,  6.6, null, 21.0, 1.0, 153600)
on conflict (product_id) do nothing;

-- -----------------------------------------------------------------------------
-- Adicionais
-- -----------------------------------------------------------------------------
insert into public.product_addons (restaurant_id, product_id, group_name, name, price_cents, max_select, sort_order)
select '22222222-0000-4000-8000-000000000001', p.id, a.group_name, a.name, a.price_cents, a.max_select, a.sort_order
from public.products p
cross join lateral (values
  ('Adicionais', 'Cheddar extra',        490, 2, 1),
  ('Adicionais', 'Bacon extra',          690, 2, 2),
  ('Adicionais', 'Ovo caipira',          390, 1, 3),
  ('Adicionais', 'Cebola caramelizada',  390, 1, 4)
) as a(group_name, name, price_cents, max_select, sort_order)
where p.restaurant_id = '22222222-0000-4000-8000-000000000001'
  and p.category_id = '33333333-0000-4000-8000-000000000002';

insert into public.product_addons (restaurant_id, product_id, group_name, name, price_cents, max_select, sort_order)
select '22222222-0000-4000-8000-000000000001', p.id, a.group_name, a.name, a.price_cents, a.max_select, a.sort_order
from public.products p
cross join lateral (values
  ('Borda recheada', 'Borda de catupiry', 1290, 1, 1),
  ('Borda recheada', 'Borda de cheddar',  1290, 1, 2),
  ('Adicionais',     'Azeitona preta',     490, 1, 3)
) as a(group_name, name, price_cents, max_select, sort_order)
where p.restaurant_id = '22222222-0000-4000-8000-000000000001'
  and p.category_id = '33333333-0000-4000-8000-000000000003';

insert into public.product_addons (restaurant_id, product_id, group_name, name, price_cents, max_select, sort_order)
select '22222222-0000-4000-8000-000000000001', p.id, 'Acompanha', a.name, a.price_cents, 1, a.sort_order
from public.products p
cross join lateral (values
  ('Molho barbecue da casa', 300, 1),
  ('Maionese de alho',       300, 2)
) as a(name, price_cents, sort_order)
where p.restaurant_id = '22222222-0000-4000-8000-000000000001'
  and p.category_id = '33333333-0000-4000-8000-000000000001';

-- -----------------------------------------------------------------------------
-- Mesas + QR Codes
-- -----------------------------------------------------------------------------
insert into public.tables (restaurant_id, code, label, seats, location, status)
select '22222222-0000-4000-8000-000000000001',
       lpad(n::text, 2, '0'),
       'Mesa ' || lpad(n::text, 2, '0'),
       case when n <= 8 then 4 else 6 end,
       case when n <= 6 then 'Salão' when n <= 10 then 'Varanda' else 'Mezanino' end,
       case when n in (3, 7, 11) then 'occupied'::public.table_status else 'available'::public.table_status end
from generate_series(1, 12) n
on conflict do nothing;

insert into public.qr_codes (restaurant_id, type, label, target_path)
values ('22222222-0000-4000-8000-000000000001', 'general', 'Cardápio geral', '/r/brasa-e-mesa')
on conflict do nothing;

insert into public.qr_codes (restaurant_id, type, table_id, label, target_path)
select t.restaurant_id, 'table', t.id, 'Mesa ' || t.code, '/r/brasa-e-mesa/mesa/' || t.code
from public.tables t
where t.restaurant_id = '22222222-0000-4000-8000-000000000001';

insert into public.qr_codes (restaurant_id, type, product_id, label, target_path)
select p.restaurant_id, 'product', p.id, p.name, '/r/brasa-e-mesa/produto/' || p.slug
from public.products p
join public.product_models m on m.product_id = p.id
where p.restaurant_id = '22222222-0000-4000-8000-000000000001'
  and p.is_featured;

-- -----------------------------------------------------------------------------
-- Historico de pedidos (30 dias) para o painel abrir com dados reais
-- -----------------------------------------------------------------------------
do $seed$
declare
  v_restaurant uuid := '22222222-0000-4000-8000-000000000001';
  v_day integer;
  v_order_index integer;
  v_orders_today integer;
  v_order_id uuid;
  v_created timestamptz;
  v_subtotal integer;
  v_product record;
  v_qty integer;
  v_items integer;
  v_code text;
begin
  for v_day in 0..29 loop
    -- fim de semana movimenta mais
    v_orders_today := case when extract(dow from now() - (v_day || ' days')::interval) in (0, 5, 6)
                           then 6 + (v_day % 4) else 2 + (v_day % 3) end;

    for v_order_index in 1..v_orders_today loop
      v_created := date_trunc('day', now() - (v_day || ' days')::interval)
                   + interval '18 hours'
                   + ((v_order_index * 23) || ' minutes')::interval;

      loop
        v_code := public.generate_order_code();
        exit when not exists (select 1 from public.orders where restaurant_id = v_restaurant and code = v_code);
      end loop;

      insert into public.orders (restaurant_id, table_id, code, status, customer_name,
                                 subtotal_cents, total_cents, session_id, created_at, updated_at)
      select v_restaurant, t.id, v_code,
             case when v_day = 0 and v_order_index <= 2 then 'preparing'::public.order_status
                  when v_day = 0 then 'confirmed'::public.order_status
                  else 'delivered'::public.order_status end,
             (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabi','Heitor'])[1 + ((v_day + v_order_index) % 8)],
             0, 0, 'seed-' || v_day || '-' || v_order_index, v_created, v_created
        from public.tables t
       where t.restaurant_id = v_restaurant
       order by (t.code::int + v_day + v_order_index) % 12
       limit 1
      returning id into v_order_id;

      v_subtotal := 0;
      v_items := 1 + ((v_day + v_order_index) % 3);

      for v_product in
        select p.id, p.name, p.price_cents
          from public.products p
         where p.restaurant_id = v_restaurant and p.is_available
         order by md5(p.id::text || v_day::text || v_order_index::text)
         limit v_items
      loop
        v_qty := 1 + ((v_day + v_order_index) % 2);
        insert into public.order_items (order_id, restaurant_id, product_id, product_name,
                                        unit_price_cents, quantity, line_total_cents, created_at)
        values (v_order_id, v_restaurant, v_product.id, v_product.name,
                v_product.price_cents, v_qty, v_product.price_cents * v_qty, v_created);
        v_subtotal := v_subtotal + v_product.price_cents * v_qty;
      end loop;

      update public.orders
         set subtotal_cents = v_subtotal, total_cents = v_subtotal
       where id = v_order_id;

      insert into public.analytics_events (restaurant_id, order_id, event_name, session_id, metadata, occurred_at)
      values (v_restaurant, v_order_id, 'order_created', 'seed-' || v_day || '-' || v_order_index,
              jsonb_build_object('total_cents', v_subtotal), v_created);
    end loop;
  end loop;
end
$seed$;

-- -----------------------------------------------------------------------------
-- Funil de eventos: visualizacao -> AR -> carrinho
-- Produtos com modelo 3D recebem proporcionalmente mais aberturas de AR.
-- -----------------------------------------------------------------------------
do $seed$
declare
  v_restaurant uuid := '22222222-0000-4000-8000-000000000001';
  v_day integer;
  v_product record;
  v_views integer;
  v_ar integer;
  v_placed integer;
  v_cart integer;
  i integer;
  v_at timestamptz;
begin
  for v_day in 0..29 loop
    for v_product in
      select p.id, p.is_featured, (m.id is not null) as has_model
        from public.products p
        left join public.product_models m on m.product_id = p.id and m.ar_enabled
       where p.restaurant_id = v_restaurant and p.is_available
    loop
      v_views := case when v_product.is_featured then 14 else 6 end + ((v_day * 7 + length(v_product.id::text)) % 9);
      -- taxa de abertura de AR observada: ~40 % quando existe modelo
      v_ar    := case when v_product.has_model then greatest(1, (v_views * 4) / 10) else 0 end;
      v_placed := (v_ar * 7) / 10;
      v_cart  := greatest(1, (v_views * 2) / 10) + case when v_product.has_model then v_placed / 3 else 0 end;

      for i in 1..v_views loop
        v_at := date_trunc('day', now() - (v_day || ' days')::interval) + ((12 + (i % 11)) || ' hours')::interval + ((i * 3) || ' minutes')::interval;
        insert into public.analytics_events (restaurant_id, product_id, event_name, session_id, occurred_at)
        values (v_restaurant, v_product.id, 'product_viewed', 'sess-' || v_day || '-' || i, v_at);
      end loop;

      for i in 1..v_ar loop
        v_at := date_trunc('day', now() - (v_day || ' days')::interval) + ((12 + (i % 11)) || ' hours')::interval + ((i * 3 + 1) || ' minutes')::interval;
        insert into public.analytics_events (restaurant_id, product_id, event_name, session_id, occurred_at)
        values (v_restaurant, v_product.id, 'product_ar_opened', 'sess-' || v_day || '-' || i, v_at);
        if i <= v_placed then
          insert into public.analytics_events (restaurant_id, product_id, event_name, session_id, occurred_at)
          values (v_restaurant, v_product.id, 'product_ar_placed', 'sess-' || v_day || '-' || i, v_at + interval '40 seconds');
        end if;
      end loop;

      for i in 1..v_cart loop
        v_at := date_trunc('day', now() - (v_day || ' days')::interval) + ((13 + (i % 9)) || ' hours')::interval + ((i * 5) || ' minutes')::interval;
        insert into public.analytics_events (restaurant_id, product_id, event_name, session_id, occurred_at)
        values (v_restaurant, v_product.id, 'product_added_to_cart', 'sess-' || v_day || '-' || i, v_at);
      end loop;
    end loop;
  end loop;
end
$seed$;

-- -----------------------------------------------------------------------------
-- Usuario de demonstracao (apenas ambiente local).
-- Em projeto hospedado, crie a conta pela tela de cadastro e depois rode o
-- bloco final para vincular o e-mail ao restaurante.
-- -----------------------------------------------------------------------------
do $seed$
declare
  v_user_id uuid := '55555555-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'demo@brasaemesa.com.br', crypt('brasa1234', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Equipe Brasa & Mesa"}'::jsonb
  ) on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', 'demo@brasaemesa.com.br', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict do nothing;

  insert into public.profiles (id, full_name)
  values (v_user_id, 'Equipe Brasa & Mesa') on conflict (id) do nothing;

  insert into public.restaurant_memberships (restaurant_id, user_id, role)
  values ('22222222-0000-4000-8000-000000000001', v_user_id, 'owner') on conflict do nothing;

  raise notice 'Usuario de demonstracao: demo@brasaemesa.com.br / brasa1234';
exception when others then
  raise notice 'Nao foi possivel criar o usuario de demonstracao (%). Crie a conta em /admin/cadastro e vincule-a manualmente.', sqlerrm;
end
$seed$;
