import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { ProductAddon } from '@/types/database';

/**
 * Carrinho do cliente.
 *
 * Estado local, por restaurante, persistido no `localStorage` para sobreviver a
 * um recarregamento acidental no meio do pedido.
 *
 * Os totais calculados aqui são de apresentação. O valor que vale é o que a RPC
 * `create_order` recalcula no banco a partir do preço atual do produto — o
 * navegador nunca é fonte de verdade financeira.
 */

export type CartAddon = {
  id: string;
  name: string;
  price_cents: number;
};

export type CartItem = {
  /** Identidade da linha: mesmo produto com adicionais diferentes são linhas distintas. */
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  addons: CartAddon[];
  notes: string;
};

type CartState = {
  restaurantSlug: string | null;
  tableCode: string | null;
  items: CartItem[];

  setContext: (restaurantSlug: string, tableCode: string | null) => void;
  addItem: (item: Omit<CartItem, 'lineId'>) => void;
  removeLine: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clear: () => void;
};

function lineKey(productId: string, addons: CartAddon[], notes: string): string {
  const addonKey = addons
    .map((addon) => addon.id)
    .sort()
    .join(',');
  return `${productId}|${addonKey}|${notes.trim().toLowerCase()}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      restaurantSlug: null,
      tableCode: null,
      items: [],

      /**
       * Trocar de restaurante zera o carrinho: misturar pratos de duas casas
       * geraria um pedido que nenhum dos dois consegue atender.
       */
      setContext: (restaurantSlug, tableCode) => {
        const previous = get().restaurantSlug;
        set({
          restaurantSlug,
          // O contexto de mesa vindo do QR Code nunca é apagado por navegação
          tableCode: tableCode ?? (previous === restaurantSlug ? get().tableCode : null),
          items: previous && previous !== restaurantSlug ? [] : get().items,
        });
      },

      addItem: (item) => {
        const key = lineKey(item.productId, item.addons, item.notes);
        const items = [...get().items];
        const existing = items.findIndex(
          (line) => lineKey(line.productId, line.addons, line.notes) === key,
        );

        if (existing >= 0) {
          const current = items[existing]!;
          items[existing] = {
            ...current,
            quantity: Math.min(99, current.quantity + item.quantity),
          };
        } else {
          items.push({ ...item, lineId: `${key}|${Date.now().toString(36)}` });
        }

        set({ items });
      },

      removeLine: (lineId) => set({ items: get().items.filter((line) => line.lineId !== lineId) }),

      setQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((line) => line.lineId !== lineId) });
          return;
        }
        set({
          items: get().items.map((line) =>
            line.lineId === lineId ? { ...line, quantity: Math.min(99, quantity) } : line,
          ),
        });
      },

      updateNotes: (lineId, notes) =>
        set({
          items: get().items.map((line) => (line.lineId === lineId ? { ...line, notes } : line)),
        }),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'ar-menu:cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        restaurantSlug: state.restaurantSlug,
        tableCode: state.tableCode,
        items: state.items,
      }),
    },
  ),
);

/* -------------------------------------------------------------------------
 * Cálculo puro — testável sem React
 * ---------------------------------------------------------------------- */

export function lineTotalCents(item: Pick<CartItem, 'unitPriceCents' | 'addons' | 'quantity'>): number {
  const addonsCents = item.addons.reduce((sum, addon) => sum + addon.price_cents, 0);
  return (item.unitPriceCents + addonsCents) * item.quantity;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Regras de seleção dos adicionais, verificadas antes de aceitar o item.
 * O banco revalida na criação do pedido; aqui é para dar feedback imediato.
 */
export function validateAddonSelection(
  addons: ProductAddon[],
  selectedIds: string[],
): { valid: boolean; message?: string } {
  const groups = new Map<string, ProductAddon[]>();
  for (const addon of addons) {
    const list = groups.get(addon.group_name) ?? [];
    list.push(addon);
    groups.set(addon.group_name, list);
  }

  for (const [groupName, groupAddons] of groups) {
    const chosen = groupAddons.filter((addon) => selectedIds.includes(addon.id));
    const required = groupAddons.some((addon) => addon.is_required);

    if (required && chosen.length === 0) {
      return { valid: false, message: `Escolha uma opção em "${groupName}".` };
    }

    const maxSelect = Math.max(...groupAddons.map((addon) => addon.max_select));
    if (chosen.length > maxSelect) {
      return {
        valid: false,
        message: `Em "${groupName}" você pode escolher no máximo ${maxSelect} ${maxSelect === 1 ? 'opção' : 'opções'}.`,
      };
    }
  }

  return { valid: true };
}
