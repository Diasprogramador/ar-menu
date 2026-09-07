import { createContext, useContext } from 'react';

import type { Category, ProductWithModel, Restaurant, RestaurantTable } from '@/types/database';

export type MenuContextValue = {
  restaurant: Restaurant;
  categories: Category[];
  products: ProductWithModel[];
  /** Mesa identificada pelo QR Code, quando houver. */
  table: RestaurantTable | null;
  isOpen: boolean;
  reload: () => void;
};

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenu(): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) throw new Error('useMenu precisa estar dentro de <MenuLayout>.');
  return context;
}
