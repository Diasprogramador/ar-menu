import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { cartItemCount, cartSubtotalCents, useCartStore } from './cartStore';
import { useMenu } from '@/features/menu/MenuContext';
import { formatMoney } from '@/lib/format';
import { track } from '@/lib/analytics';

/**
 * Barra fixa do carrinho.
 *
 * Fica fora do fluxo de leitura e só aparece quando há item — uma barra vazia
 * ocupando o rodapé o tempo todo rouba espaço da parte que importa, que é a
 * foto do prato.
 */
export function CartBar() {
  const { restaurant } = useMenu();
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const items = useCartStore((store) => store.items);

  const count = cartItemCount(items);
  const subtotal = cartSubtotalCents(items);

  const onCartPage = location.pathname.endsWith('/carrinho');
  if (count === 0 || onCartPage) return null;

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-3 pt-3">
      <button
        type="button"
        onClick={() => {
          void track(restaurant.id, 'cart_viewed', { metadata: { items: count } });
          navigate(`/r/${slug}/carrinho`);
        }}
        className="mx-auto flex h-14 w-full max-w-md items-center gap-3 rounded-[10px] bg-ink px-4 text-paper shadow-[0_8px_28px_rgba(20,17,15,0.22)]"
      >
        <span className="tabular flex size-7 items-center justify-center rounded-full bg-paper/15 text-[13px] font-semibold">
          {count}
        </span>
        <span className="flex-1 text-left text-[15px] font-medium">Ver pedido</span>
        <span className="tabular text-[15px]">{formatMoney(subtotal, restaurant.currency)}</span>
      </button>
    </div>
  );
}
