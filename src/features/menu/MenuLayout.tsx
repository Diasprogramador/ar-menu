import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useMatch, useParams } from 'react-router-dom';

import { MenuContext, type MenuContextValue } from './MenuContext';
import { getMenu, getTableByCode, isRestaurantOpen } from './menuService';
import './dining.css';
import { MenuIcon } from './components/MenuIcon';
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
  const productRoute = useMatch('/r/:slug/produto/:productSlug');
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
      <div className="menu-shell dining-shell min-h-dvh">
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

        <div className="dining-mast">
          <div className="dining-wrap">
            <Link to={`/r/${slug}`} className="dining-brand">
              {value.restaurant.logo_url && <img src={value.restaurant.logo_url} alt="" width="34" height="34" />}
              {value.restaurant.name}
            </Link>
            <Link className="dining-order" to={`/r/${slug}/carrinho`}><MenuIcon name="bag" /> Meu pedido</Link>
          </div>
        </div>
        <Outlet />

        <footer className="dining-footer">
          <div className="dining-wrap">
            <div><strong>{value.restaurant.name}</strong>
              {value.restaurant.address && <p>{value.restaurant.address}</p>}
            </div>
            <Link to="/">AR Menu</Link>
          </div>
        </footer>
        {!productRoute && <CartBar />}
      </div>
    </MenuContext.Provider>
  );
}
