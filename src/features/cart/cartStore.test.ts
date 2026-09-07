import { beforeEach, describe, expect, it } from 'vitest';

import {
  cartItemCount,
  cartSubtotalCents,
  lineTotalCents,
  useCartStore,
  validateAddonSelection,
  type CartItem,
} from './cartStore';
import type { ProductAddon } from '@/types/database';

const item = (overrides: Partial<CartItem> = {}): Omit<CartItem, 'lineId'> => ({
  productId: 'produto-1',
  name: 'Smash Bacon',
  imageUrl: null,
  unitPriceCents: 4290,
  quantity: 1,
  addons: [],
  notes: '',
  ...overrides,
});

/**
 * O carrinho lida com dinheiro. Mesmo sendo o servidor quem calcula o total
 * cobrado, um valor errado na tela é uma promessa quebrada com o cliente.
 */
describe('cálculo de valores', () => {
  it('soma os adicionais antes de multiplicar pela quantidade', () => {
    const total = lineTotalCents({
      unitPriceCents: 4290,
      quantity: 2,
      addons: [
        { id: 'a', name: 'Bacon extra', price_cents: 690 },
        { id: 'b', name: 'Cheddar extra', price_cents: 490 },
      ],
    });

    expect(total).toBe((4290 + 690 + 490) * 2);
  });

  it('trabalha só com inteiros, sem erro de ponto flutuante', () => {
    const total = lineTotalCents({ unitPriceCents: 10, quantity: 3, addons: [] });
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(30);
  });

  it('soma o subtotal de várias linhas', () => {
    const linhas: CartItem[] = [
      { ...item(), lineId: '1' },
      { ...item({ unitPriceCents: 2490, quantity: 2 }), lineId: '2' },
    ];

    expect(cartSubtotalCents(linhas)).toBe(4290 + 2490 * 2);
    expect(cartItemCount(linhas)).toBe(3);
  });

  it('devolve zero para carrinho vazio', () => {
    expect(cartSubtotalCents([])).toBe(0);
    expect(cartItemCount([])).toBe(0);
  });
});

describe('store do carrinho', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], restaurantSlug: null, tableCode: null });
  });

  it('agrupa o mesmo produto com os mesmos adicionais em uma linha só', () => {
    const { addItem } = useCartStore.getState();
    addItem(item());
    addItem(item());

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
  });

  it('mantém linhas separadas quando os adicionais diferem', () => {
    const { addItem } = useCartStore.getState();
    addItem(item());
    addItem(item({ addons: [{ id: 'a', name: 'Bacon extra', price_cents: 690 }] }));

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('mantém linhas separadas quando a observação difere', () => {
    const { addItem } = useCartStore.getState();
    addItem(item({ notes: 'sem cebola' }));
    addItem(item({ notes: 'bem passado' }));

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('remove a linha quando a quantidade chega a zero', () => {
    const { addItem } = useCartStore.getState();
    addItem(item());
    const lineId = useCartStore.getState().items[0]!.lineId;

    useCartStore.getState().setQuantity(lineId, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('limita a quantidade máxima por linha', () => {
    const { addItem } = useCartStore.getState();
    addItem(item());
    const lineId = useCartStore.getState().items[0]!.lineId;

    useCartStore.getState().setQuantity(lineId, 500);
    expect(useCartStore.getState().items[0]!.quantity).toBe(99);
  });

  it('esvazia o carrinho ao trocar de restaurante', () => {
    const store = useCartStore.getState();
    store.setContext('brasa-e-mesa', '07');
    store.addItem(item());
    expect(useCartStore.getState().items).toHaveLength(1);

    useCartStore.getState().setContext('outro-restaurante', null);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('preserva a mesa do QR Code ao navegar dentro do mesmo restaurante', () => {
    const store = useCartStore.getState();
    store.setContext('brasa-e-mesa', '07');
    useCartStore.getState().setContext('brasa-e-mesa', null);

    expect(useCartStore.getState().tableCode).toBe('07');
  });
});

describe('validateAddonSelection', () => {
  const addon = (overrides: Partial<ProductAddon>): ProductAddon => ({
    id: 'a1',
    restaurant_id: 'r1',
    product_id: 'p1',
    group_name: 'Adicionais',
    name: 'Bacon extra',
    price_cents: 690,
    is_required: false,
    max_select: 1,
    sort_order: 0,
    is_active: true,
    created_at: '',
    ...overrides,
  });

  it('aceita nenhuma escolha quando o grupo é opcional', () => {
    expect(validateAddonSelection([addon({})], []).valid).toBe(true);
  });

  it('exige escolha em grupo obrigatório', () => {
    const resultado = validateAddonSelection(
      [addon({ id: 'a1', group_name: 'Ponto da carne', is_required: true })],
      [],
    );

    expect(resultado.valid).toBe(false);
    expect(resultado.message).toMatch(/Ponto da carne/);
  });

  it('recusa mais escolhas do que o grupo permite', () => {
    const resultado = validateAddonSelection(
      [
        addon({ id: 'a1', max_select: 1 }),
        addon({ id: 'a2', name: 'Cheddar extra', max_select: 1 }),
      ],
      ['a1', 'a2'],
    );

    expect(resultado.valid).toBe(false);
    expect(resultado.message).toMatch(/no máximo 1/);
  });

  it('aceita múltiplas escolhas dentro do limite', () => {
    const resultado = validateAddonSelection(
      [
        addon({ id: 'a1', max_select: 2 }),
        addon({ id: 'a2', name: 'Cheddar extra', max_select: 2 }),
      ],
      ['a1', 'a2'],
    );

    expect(resultado.valid).toBe(true);
  });

  it('valida cada grupo separadamente', () => {
    const resultado = validateAddonSelection(
      [
        addon({ id: 'a1', group_name: 'Adicionais', max_select: 2 }),
        addon({ id: 'b1', group_name: 'Borda', is_required: true, max_select: 1 }),
      ],
      ['a1'],
    );

    expect(resultado.valid).toBe(false);
    expect(resultado.message).toMatch(/Borda/);
  });
});
