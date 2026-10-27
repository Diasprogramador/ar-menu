import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';

import { MenuContext, type MenuContextValue } from './MenuContext';
import { getMenu, getTableByCode, isRestaurantOpen } from './menuService';
import { CartBar } from '@/features/cart/CartBar';
import { ErrorState } from '@/components/ui';
import { RouteFallback } from '@/components/RouteFallback';
import NotFoundPage from '@/components/NotFoundPage';
import { useCartStore } from '@/features/cart/cartStore';
import { registerQrScan, trackOnce } from '@/lib/analytics';
import type { MenuData, RestaurantTable } from '@/types/database';

/**
 * Casca do cardápio público.
 *
 * Carrega restaurante, categorias e produtos uma única vez por slug e distribui
 * pelo contexto. As telas filhas navegam sem tocar na rede de novo — o que
 * importa quando o cliente está no 4G do restaurante.
 *
 * Também é aqui que o contexto de mesa vindo do QR Code é resolvido e fixado no
 * carrinho, para sobreviver à navegação entre pratos.
 */
export function MenuLayout() {
  const { slug = '', tableCode } = useParams();
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const setCartContext = useCartStore((store) => store.setContext);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await getMenu(slug);
      if (!data) {
        setState('not-found');
        return;
      }
      setMenu(data);
      setState('ready');

      trackOnce(data.restaurant.id, 'menu_viewed');

      if (tableCode) {
        const found = await getTableByCode(data.restaurant.id, tableCode);
        setTable(found);
        setCartContext(slug, found?.code ?? null);
        void registerQrScan(data.restaurant.id, `/r/${slug}/mesa/${tableCode}`);
      } else {
        setCartContext(slug, null);
        void registerQrScan(data.restaurant.id, `/r/${slug}`);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar o cardápio.',
      );
      setState('error');
    }
  }, [slug, tableCode, setCartContext]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<MenuContextValue | null>(() => {
    if (!menu) return null;
    return {
      restaurant: menu.restaurant,
      categories: menu.categories,
      products: menu.products,
      table,
      isOpen: isRestaurantOpen(menu.restaurant),
      reload: () => void load(),
    };
  }, [menu, table, load]);

  if (state === 'loading') return <RouteFallback />;
  if (state === 'not-found') return <NotFoundPage />;

  if (state === 'error' || !value) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <ErrorState
          title="Cardápio indisponível"
          message={errorMessage || 'Tente novamente em instantes.'}
          onRetry={() => void load()}
        />
      </main>
    );
  }

  return (
    <MenuContext.Provider value={value}>
      <div className="menu-shell min-h-dvh bg-paper pb-28">
        {!value.isOpen && (
          <p className="bg-ink px-4 py-2 text-center text-[13px] text-paper">
            {value.restaurant.closed_message ??
              'Estamos fechados agora. Confira o cardápio enquanto isso.'}
          </p>
        )}

        {value.table && (
          <p className="flex items-center justify-center gap-2 border-b border-hairline bg-surface px-4 py-2 text-[13px] text-muted">
            <span className="size-1.5 rounded-full bg-positive" aria-hidden />
            Pedido para a <strong className="font-semibold text-ink">Mesa {value.table.code}</strong>
          </p>
        )}

        <Outlet />

        <footer className="mt-16 bg-ink px-4 py-10 text-center text-paper">
          <span className="mx-auto mb-4 block h-px w-10 ember-rule" aria-hidden />
          <p className="font-display text-xl">{value.restaurant.name}</p>
          {value.restaurant.address && (
            <p className="mx-auto mt-2 max-w-sm text-[13px] text-paper/55">{value.restaurant.address}</p>
          )}
          <p className="mt-5 text-[11px] uppercase tracking-[0.12em] text-paper/35">
            Cardápio com realidade aumentada por{' '}
            <Link to="/" className="underline underline-offset-2">
              AR Menu
            </Link>
          </p>
        </footer>

        <CartBar />
      </div>
    </MenuContext.Provider>
  );
}
