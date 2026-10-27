import type {
  Category,
  ProductAddon,
  ProductDetail,
  ProductModel,
  ProductWithModel,
  Restaurant,
  RestaurantTable,
} from '@/types/database';

/**
 * Catálogo de demonstração do "Brasa & Mesa".
 *
 * Espelha o conteúdo de `supabase/seed.sql` e entra em cena quando o app roda
 * sem as chaves do Supabase — o caso da vitrine pública, em que não há banco
 * para conectar. Assim a experiência principal (cardápio → prato → realidade
 * aumentada → pedido) funciona de ponta a ponta para quem só quer ver o produto.
 *
 * Com o `.env` preenchido, nada disto é usado: o app fala com o banco de
 * verdade, com RLS e pedidos calculados no servidor.
 *
 * As dimensões físicas abaixo foram medidas na caixa envolvente de cada GLB
 * gerado por `scripts/generate-demo-models.mjs` ou pelo pipeline Blender
 * documentado em `docs/3d-smash-duplo.md`.
 */

export const DEMO_SLUG = 'brasa-e-mesa';

export const demoRestaurant: Restaurant = {
  id: 'demo-restaurant',
  slug: DEMO_SLUG,
  name: 'Brasa & Mesa',
  description:
    'Hambúrgueres na brasa, pizzas de forno a lenha e costela defumada por 12 horas. Desde 2019 na Vila Madalena.',
  logo_url: '/demo/brasa-e-mesa-marca.svg',
  cover_url:
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=70',
  address: 'Rua Harmonia, 412 — Vila Madalena, São Paulo',
  phone: '(11) 3030-4120',
  whatsapp: '5511930304120',
  instagram: 'brasaemesa',
  currency: 'BRL',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  accent_color: '#FF6B2C',
  opening_hours: {
    mon: [],
    tue: [['18:00', '23:30']],
    wed: [['18:00', '23:30']],
    thu: [['18:00', '23:30']],
    fri: [['18:00', '01:00']],
    sat: [['12:00', '01:00']],
    sun: [['12:00', '22:00']],
  },
  // A vitrine fica sempre aberta: um visitante que chega num dia fechado
  // encontraria os botões de pedido desativados sem entender por quê.
  is_open_override: true,
  closed_message: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const demoCategories: Category[] = [
  ['entradas', 'Entradas', 'Para começar dividindo a mesa.'],
  ['hamburgueres', 'Hambúrgueres', 'Blend 200 g, pão brioche, na chapa.'],
  ['pizzas', 'Pizzas', 'Massa de fermentação natural, 48 h.'],
  ['principais', 'Pratos principais', 'Cortes na brasa e defumados.'],
  ['sobremesas', 'Sobremesas', 'Feitas na casa, todos os dias.'],
  ['bebidas', 'Bebidas', 'Drinks, sucos e clássicos geladinhos.'],
].map(([slug, name, description], index) => ({
  id: `cat-${slug}`,
  restaurant_id: demoRestaurant.id,
  name: name as string,
  slug: slug as string,
  description: description as string,
  icon: null,
  sort_order: index + 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));

type Seed = {
  slug: string;
  name: string;
  category: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  price: number;
  compareAt?: number;
  image: string;
  badges?: string[];
  featured?: boolean;
  prep: number;
  calories?: number;
  model?: {
    file: string;
    width?: number;
    height: number;
    depth?: number;
    diameter?: number;
    bytes: number;
  };
};

const cover = (slug: string) => `/demo/covers/${slug}.jpg`;

const SEEDS: Seed[] = [
  {
    slug: 'bolinho-de-costela',
    name: 'Bolinho de Costela',
    category: 'entradas',
    description:
      'Seis bolinhos de costela desfiada com catupiry, empanados na hora. Vêm com maionese de limão queimado.',
    ingredients: ['Costela bovina', 'Catupiry', 'Farinha panko', 'Limão siciliano'],
    allergens: ['Glúten', 'Leite'],
    price: 3890,
    image: cover('bolinho-de-costela'),
    badges: ['Mais pedido'],
    prep: 20,
    calories: 620,
    model: { file: 'bolinho-de-costela', width: 24, height: 5.7, depth: 24, bytes: 429528 },
  },
  {
    slug: 'aneis-de-cebola',
    name: 'Anéis de Cebola',
    category: 'entradas',
    description:
      'Cebola roxa em anéis grossos, empanada em cerveja preta. Crocante por fora, doce por dentro.',
    ingredients: ['Cebola roxa', 'Cerveja preta', 'Farinha de trigo', 'Páprica defumada'],
    allergens: ['Glúten'],
    price: 2990,
    image: cover('aneis-de-cebola'),
    prep: 15,
    calories: 480,
    model: { file: 'aneis-de-cebola', width: 23, height: 8.5, depth: 23, bytes: 320088 },
  },
  {
    slug: 'batata-crocante',
    name: 'Batata Crocante',
    category: 'entradas',
    description: 'Batata rústica frita duas vezes, alecrim e flor de sal. Porção generosa para dividir.',
    ingredients: ['Batata asterix', 'Alecrim', 'Flor de sal'],
    allergens: [],
    price: 2490,
    image: cover('batata-crocante'),
    badges: ['Mais pedido'],
    featured: true,
    prep: 12,
    calories: 540,
    model: { file: 'batata-crocante', width: 24, height: 5.6, depth: 24, bytes: 173640 },
  },
  {
    slug: 'smash-bacon',
    name: 'Smash Bacon',
    category: 'hamburgueres',
    description:
      'Dois discos de 90 g prensados na chapa, cheddar inglês derretido e bacon caramelizado no bourbon.',
    ingredients: ['Blend 200 g', 'Cheddar inglês', 'Bacon', 'Pão brioche'],
    allergens: ['Glúten', 'Leite'],
    price: 4290,
    image: cover('smash-bacon'),
    badges: ['Mais pedido', 'Novo'],
    featured: true,
    prep: 18,
    calories: 890,
    model: { file: 'smash-bacon', width: 14.6, height: 11.8, depth: 14.6, bytes: 368792 },
  },
  {
    slug: 'burger-da-casa',
    name: 'Burger da Casa',
    category: 'hamburgueres',
    description:
      'Blend de 200 g malpassado, queijo prato, alface americana, tomate e cebola roxa no pão brioche.',
    ingredients: ['Blend 200 g', 'Queijo prato', 'Alface', 'Tomate', 'Cebola roxa'],
    allergens: ['Glúten', 'Leite'],
    price: 3990,
    compareAt: 4590,
    image: cover('burger-da-casa'),
    badges: ['Promoção'],
    featured: true,
    prep: 18,
    calories: 820,
    model: { file: 'burger-da-casa', width: 14.6, height: 12.3, depth: 14.6, bytes: 396372 },
  },
  {
    slug: 'smash-duplo-cheddar',
    name: 'Smash Duplo Cheddar',
    category: 'hamburgueres',
    description:
      'Quatro discos smash, cheddar entre cada camada e molho da casa. Para quem chegou com fome de verdade.',
    ingredients: ['Blend 360 g', 'Cheddar', 'Molho da casa', 'Pão brioche'],
    allergens: ['Glúten', 'Leite', 'Ovo'],
    price: 5490,
    image: cover('smash-duplo-cheddar'),
    prep: 22,
    calories: 1180,
    model: { file: 'smash-duplo-cheddar', width: 16, height: 13.8, depth: 16, bytes: 504744 },
  },
  {
    slug: 'pizza-margherita',
    name: 'Pizza Margherita',
    category: 'pizzas',
    description:
      'Molho de tomate San Marzano, muçarela de búfala, manjericão fresco e azeite extravirgem. 30 cm.',
    ingredients: ['Tomate San Marzano', 'Muçarela de búfala', 'Manjericão', 'Azeite extravirgem'],
    allergens: ['Glúten', 'Leite'],
    price: 5890,
    image: cover('pizza-margherita'),
    badges: ['Mais pedido'],
    featured: true,
    prep: 25,
    calories: 1250,
    model: { file: 'pizza-margherita', height: 3.5, diameter: 30, bytes: 311148 },
  },
  {
    slug: 'pizza-pepperoni',
    name: 'Pizza Pepperoni',
    category: 'pizzas',
    description:
      'Pepperoni italiano fatiado fino, muçarela e orégano. Sai do forno com as bordas encaracoladas. 30 cm.',
    ingredients: ['Pepperoni', 'Muçarela', 'Orégano', 'Molho de tomate'],
    allergens: ['Glúten', 'Leite'],
    price: 6290,
    image: cover('pizza-pepperoni'),
    featured: true,
    prep: 25,
    calories: 1420,
    model: { file: 'pizza-pepperoni', height: 3, diameter: 30, bytes: 638372 },
  },
  {
    slug: 'pizza-quatro-queijos',
    name: 'Pizza Quatro Queijos',
    category: 'pizzas',
    description: 'Muçarela, gorgonzola, parmesão e catupiry. Finalizada com mel de laranjeira. 30 cm.',
    ingredients: ['Muçarela', 'Gorgonzola', 'Parmesão', 'Catupiry', 'Mel'],
    allergens: ['Glúten', 'Leite'],
    price: 6590,
    image: cover('pizza-quatro-queijos'),
    prep: 25,
    calories: 1480,
    model: { file: 'pizza-quatro-queijos', height: 3.1, diameter: 30, bytes: 685184 },
  },
  {
    slug: 'costela-defumada',
    name: 'Costela Defumada',
    category: 'principais',
    description:
      'Costela bovina defumada 12 horas em lenha de goiabeira, glaceada com melado de cana. Serve duas pessoas.',
    ingredients: ['Costela bovina', 'Melado de cana', 'Sal grosso', 'Pimenta-do-reino'],
    allergens: [],
    price: 8990,
    image: cover('costela-defumada'),
    badges: ['Mais pedido'],
    featured: true,
    prep: 15,
    calories: 1640,
    model: { file: 'costela-defumada', width: 25.5, height: 4.9, depth: 18, bytes: 47884 },
  },
  {
    slug: 'salada-caesar',
    name: 'Salada Caesar',
    category: 'principais',
    description:
      'Alface romana, croutons de pão de fermentação natural, parmesão em lascas e molho caesar da casa.',
    ingredients: ['Alface romana', 'Parmesão', 'Croutons', 'Molho caesar'],
    allergens: ['Glúten', 'Leite', 'Ovo', 'Peixe'],
    price: 3690,
    image: cover('salada-caesar'),
    prep: 12,
    calories: 420,
    model: { file: 'salada-caesar', height: 7.6, diameter: 21.2, bytes: 205632 },
  },
  {
    slug: 'picanha-na-brasa',
    name: 'Picanha na Brasa',
    category: 'principais',
    description:
      'Picanha maturada 21 dias, selada na brasa e servida ao ponto com farofa de bacon e vinagrete.',
    ingredients: ['Picanha', 'Farofa de bacon', 'Vinagrete'],
    allergens: [],
    price: 9890,
    image: cover('picanha-na-brasa'),
    badges: ['Novo'],
    prep: 30,
    calories: 1520,
    model: { file: 'picanha-na-brasa', width: 28, height: 5.2, depth: 28, bytes: 368268 },
  },
  {
    slug: 'brownie-com-sorvete',
    name: 'Brownie com Sorvete',
    category: 'sobremesas',
    description:
      'Brownie de chocolate 70 % com nozes, servido morno com bola de sorvete de baunilha e calda quente.',
    ingredients: ['Chocolate 70%', 'Nozes', 'Sorvete de baunilha'],
    allergens: ['Glúten', 'Leite', 'Ovo', 'Oleaginosas'],
    price: 2890,
    image: cover('brownie-com-sorvete'),
    badges: ['Mais pedido'],
    featured: true,
    prep: 10,
    calories: 680,
    model: { file: 'brownie', width: 17, height: 6.4, depth: 17, bytes: 84944 },
  },
  {
    slug: 'petit-gateau',
    name: 'Petit Gateau',
    category: 'sobremesas',
    description:
      'Bolinho de chocolate com recheio líquido, sorvete de creme e frutas vermelhas. Sai do forno em 12 minutos.',
    ingredients: ['Chocolate meio amargo', 'Sorvete de creme', 'Frutas vermelhas'],
    allergens: ['Glúten', 'Leite', 'Ovo'],
    price: 3190,
    image: cover('petit-gateau'),
    prep: 12,
    calories: 620,
    model: { file: 'petit-gateau', width: 15.6, height: 5.7, depth: 15, bytes: 138448 },
  },
  {
    slug: 'pudim-de-leite',
    name: 'Pudim de Leite',
    category: 'sobremesas',
    description: 'Pudim de leite condensado com calda de caramelo escuro. Receita da avó, sem furinhos.',
    ingredients: ['Leite condensado', 'Ovos', 'Açúcar'],
    allergens: ['Leite', 'Ovo'],
    price: 2290,
    image: cover('pudim-de-leite'),
    prep: 5,
    calories: 380,
    model: { file: 'pudim-de-leite', height: 5.7, diameter: 18, bytes: 119928 },
  },
  {
    slug: 'milkshake-de-morango',
    name: 'Milkshake de Morango',
    category: 'bebidas',
    description: 'Sorvete de creme batido com morangos frescos, chantilly e cereja. Copo de 400 ml.',
    ingredients: ['Sorvete de creme', 'Morango', 'Chantilly'],
    allergens: ['Leite'],
    price: 2490,
    image: cover('milkshake-de-morango'),
    featured: true,
    prep: 8,
    calories: 520,
    model: { file: 'milkshake', width: 8.2, height: 21, depth: 8, bytes: 121576 },
  },
  {
    slug: 'refrigerante',
    name: 'Refrigerante',
    category: 'bebidas',
    description: 'Lata 350 ml servida no copo com gelo e limão. Cola, guaraná, laranja ou limão.',
    ingredients: [],
    allergens: [],
    price: 990,
    image: cover('refrigerante'),
    prep: 2,
    calories: 140,
    model: { file: 'refrigerante', width: 9, height: 14.8, depth: 8, bytes: 97380 },
  },
  {
    slug: 'suco-natural',
    name: 'Suco Natural',
    category: 'bebidas',
    description: 'Fruta da estação espremida na hora, sem açúcar. Laranja, abacaxi com hortelã ou maracujá.',
    ingredients: ['Fruta da estação'],
    allergens: [],
    price: 1490,
    image: cover('suco-natural'),
    prep: 5,
    calories: 120,
    model: { file: 'suco-natural', width: 9.1, height: 15.8, depth: 8, bytes: 64044 },
  },
  {
    slug: 'agua-com-gas',
    name: 'Água com Gás',
    category: 'bebidas',
    description: 'Garrafa 500 ml gelada, com rodela de limão.',
    ingredients: [],
    allergens: [],
    price: 790,
    image: cover('agua-com-gas'),
    prep: 1,
    calories: 0,
    model: { file: 'agua-com-gas', width: 10.8, height: 23.5, depth: 7, bytes: 245180 },
  },
];

function buildModel(seed: Seed): ProductModel | null {
  if (!seed.model) return null;
  const { file, width, height, depth, diameter, bytes } = seed.model;
  return {
    id: `model-${seed.slug}`,
    restaurant_id: demoRestaurant.id,
    product_id: `prod-${seed.slug}`,
    model_url: `/demo-models/${file}.glb`,
    // O iPhone nao implementa WebXR: o USDZ e o unico caminho de AR nativa la
    usdz_url: `/demo-models/${file}.usdz`,
    format: 'glb',
    file_size_bytes: bytes,
    ar_enabled: true,
    width_cm: width ?? null,
    height_cm: height,
    depth_cm: depth ?? null,
    diameter_cm: diameter ?? null,
    scale_multiplier: 1,
    rotation_x_deg: 0,
    rotation_y_deg: 0,
    rotation_z_deg: 0,
    offset_x_cm: 0,
    offset_y_cm: 0,
    offset_z_cm: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

export const demoProducts: ProductWithModel[] = SEEDS.map((seed, index) => ({
  id: `prod-${seed.slug}`,
  restaurant_id: demoRestaurant.id,
  category_id: `cat-${seed.category}`,
  name: seed.name,
  slug: seed.slug,
  description: seed.description,
  ingredients: seed.ingredients,
  allergens: seed.allergens,
  price_cents: seed.price,
  compare_at_price_cents: seed.compareAt ?? null,
  image_url: seed.image,
  badges: seed.badges ?? [],
  is_available: true,
  is_featured: seed.featured ?? false,
  prep_time_minutes: seed.prep,
  calories: seed.calories ?? null,
  sort_order: index,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  product_models: buildModel(seed),
}));

const ADDONS_BY_CATEGORY: Record<string, { name: string; price: number; group?: string }[]> = {
  'cat-hamburgueres': [
    { name: 'Cheddar extra', price: 490 },
    { name: 'Bacon extra', price: 690 },
    { name: 'Ovo caipira', price: 390 },
    { name: 'Cebola caramelizada', price: 390 },
  ],
  'cat-pizzas': [
    { name: 'Borda de catupiry', price: 1290, group: 'Borda recheada' },
    { name: 'Borda de cheddar', price: 1290, group: 'Borda recheada' },
    { name: 'Azeitona preta', price: 490 },
  ],
  'cat-entradas': [
    { name: 'Molho barbecue da casa', price: 300, group: 'Acompanha' },
    { name: 'Maionese de alho', price: 300, group: 'Acompanha' },
  ],
};

function addonsFor(product: ProductWithModel): ProductAddon[] {
  const list = ADDONS_BY_CATEGORY[product.category_id ?? ''] ?? [];
  return list.map((addon, index) => ({
    id: `addon-${product.slug}-${index}`,
    restaurant_id: demoRestaurant.id,
    product_id: product.id,
    group_name: addon.group ?? 'Adicionais',
    name: addon.name,
    price_cents: addon.price,
    is_required: false,
    max_select: 2,
    sort_order: index,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  }));
}

export const demoTables: RestaurantTable[] = Array.from({ length: 12 }, (_, index) => {
  const code = String(index + 1).padStart(2, '0');
  return {
    id: `table-${code}`,
    restaurant_id: demoRestaurant.id,
    code,
    label: `Mesa ${code}`,
    seats: index < 8 ? 4 : 6,
    location: index < 6 ? 'Salão' : index < 10 ? 'Varanda' : 'Mezanino',
    status: 'available',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
});

export function demoProductDetail(slug: string): ProductDetail | null {
  const product = demoProducts.find((item) => item.slug === slug);
  if (!product) return null;

  const category = demoCategories.find((item) => item.id === product.category_id) ?? null;

  return {
    ...product,
    product_addons: addonsFor(product),
    categories: category ? { id: category.id, name: category.name, slug: category.slug } : null,
  };
}

export function demoTableByCode(code: string): RestaurantTable | null {
  return demoTables.find((table) => table.code === code) ?? null;
}
