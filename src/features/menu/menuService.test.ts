import { describe, expect, it } from 'vitest';

import { hasARExperience, isRestaurantOpen, searchProducts } from './menuService';
import type { ProductModel, ProductWithModel, Restaurant } from '@/types/database';

const restaurant = (overrides: Partial<Restaurant> = {}): Restaurant => ({
  id: 'r1',
  slug: 'brasa-e-mesa',
  name: 'Brasa & Mesa',
  description: null,
  logo_url: null,
  cover_url: null,
  address: null,
  phone: null,
  whatsapp: null,
  instagram: null,
  currency: 'BRL',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  accent_color: '#FF6B2C',
  opening_hours: {},
  is_open_override: null,
  closed_message: null,
  is_active: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const product = (overrides: Partial<ProductWithModel> = {}): ProductWithModel => ({
  id: 'p1',
  restaurant_id: 'r1',
  category_id: 'c1',
  name: 'Smash Bacon',
  slug: 'smash-bacon',
  description: 'Dois discos prensados na chapa com cheddar inglês.',
  ingredients: ['Blend 200 g', 'Cheddar inglês', 'Bacon'],
  allergens: [],
  price_cents: 4290,
  compare_at_price_cents: null,
  image_url: null,
  badges: [],
  is_available: true,
  is_featured: false,
  prep_time_minutes: null,
  calories: null,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  product_models: null,
  ...overrides,
});

const model = (overrides: Partial<ProductModel> = {}): ProductModel => ({
  id: 'm1',
  restaurant_id: 'r1',
  product_id: 'p1',
  model_url: '/demo-models/smash-bacon.glb',
  usdz_url: null,
  format: 'glb',
  file_size_bytes: null,
  ar_enabled: true,
  width_cm: 12.7,
  height_cm: 9.9,
  depth_cm: 12.2,
  diameter_cm: null,
  scale_multiplier: 1,
  rotation_x_deg: 0,
  rotation_y_deg: 0,
  rotation_z_deg: 0,
  offset_x_cm: 0,
  offset_y_cm: 0,
  offset_z_cm: 0,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('isRestaurantOpen', () => {
  // Quarta-feira, 20h
  const quartaNoite = new Date('2026-03-11T20:00:00');
  // Quarta-feira, 10h
  const quartaManha = new Date('2026-03-11T10:00:00');

  it('respeita o horário cadastrado', () => {
    const casa = restaurant({ opening_hours: { wed: [['18:00', '23:30']] } });

    expect(isRestaurantOpen(casa, quartaNoite)).toBe(true);
    expect(isRestaurantOpen(casa, quartaManha)).toBe(false);
  });

  it('trata faixa que atravessa a meia-noite', () => {
    const casa = restaurant({ opening_hours: { wed: [['18:00', '01:00']] } });

    expect(isRestaurantOpen(casa, new Date('2026-03-11T23:50:00'))).toBe(true);
    expect(isRestaurantOpen(casa, new Date('2026-03-11T00:30:00'))).toBe(true);
    expect(isRestaurantOpen(casa, new Date('2026-03-11T15:00:00'))).toBe(false);
  });

  it('considera fechado o dia sem faixa cadastrada', () => {
    expect(isRestaurantOpen(restaurant({ opening_hours: { mon: [] } }), quartaNoite)).toBe(false);
  });

  it('deixa o override manual vencer o horário', () => {
    const fechadoNaMarra = restaurant({
      opening_hours: { wed: [['18:00', '23:30']] },
      is_open_override: false,
    });
    const abertoNaMarra = restaurant({ opening_hours: { wed: [] }, is_open_override: true });

    expect(isRestaurantOpen(fechadoNaMarra, quartaNoite)).toBe(false);
    expect(isRestaurantOpen(abertoNaMarra, quartaNoite)).toBe(true);
  });
});

describe('searchProducts', () => {
  const catalogo = [
    product(),
    product({
      id: 'p2',
      name: 'Pizza Margherita',
      slug: 'pizza-margherita',
      description: 'Massa de fermentação natural assada no forno a lenha.',
      ingredients: ['Manjericão'],
    }),
    product({
      id: 'p3',
      name: 'Açaí na tigela',
      slug: 'acai',
      description: 'Polpa batida na hora com granola.',
      ingredients: [],
    }),
  ];

  it('ignora termos curtos demais para serem úteis', () => {
    expect(searchProducts(catalogo, 'a')).toEqual([]);
    expect(searchProducts(catalogo, ' ')).toEqual([]);
  });

  it('encontra por nome, sem diferenciar acento ou caixa', () => {
    expect(searchProducts(catalogo, 'MARGHERITA')).toHaveLength(1);
    expect(searchProducts(catalogo, 'acai')).toHaveLength(1);
    expect(searchProducts(catalogo, 'açaí')).toHaveLength(1);
  });

  it('encontra por ingrediente', () => {
    const resultados = searchProducts(catalogo, 'manjericao');
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.slug).toBe('pizza-margherita');
  });

  it('encontra por descrição', () => {
    expect(searchProducts(catalogo, 'chapa')).toHaveLength(1);
  });

  it('devolve lista vazia quando nada casa', () => {
    expect(searchProducts(catalogo, 'sushi')).toEqual([]);
  });
});

describe('hasARExperience', () => {
  it('exige modelo com AR ligada', () => {
    expect(hasARExperience(product({ product_models: model() }))).toBe(true);
  });

  it('recusa modelo com AR desligada', () => {
    expect(hasARExperience(product({ product_models: model({ ar_enabled: false }) }))).toBe(false);
  });

  it('recusa produto sem modelo', () => {
    expect(hasARExperience(product())).toBe(false);
  });

  it('recusa modelo sem arquivo', () => {
    expect(hasARExperience(product({ product_models: model({ model_url: '' }) }))).toBe(false);
  });
});
