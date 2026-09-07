import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { cartSubtotalCents, lineTotalCents, useCartStore } from './cartStore';
import { useMenu } from '@/features/menu/MenuContext';
import { createOrder } from '@/features/orders/orderService';
import { Button, EmptyState, Field, Input, SmartImage, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { useSeo } from '@/lib/seo';

/**
 * Carrinho e fechamento do pedido.
 *
 * O total mostrado aqui é uma estimativa fiel do que o servidor vai cobrar, mas
 * quem decide é a RPC `create_order`. Se o preço mudou entre a navegação e o
 * envio, o pedido sai com o preço atual — e é isso que o restaurante cobra.
 */
export default function CartPage() {
  const { restaurant, table, isOpen } = useMenu();
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const items = useCartStore((store) => store.items);
  const setQuantity = useCartStore((store) => store.setQuantity);
  const removeLine = useCartStore((store) => store.removeLine);
  const clear = useCartStore((store) => store.clear);
  const tableCode = useCartStore((store) => store.tableCode);

  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useSeo({
    title: `Seu pedido — ${restaurant.name}`,
    canonicalPath: `/r/${restaurant.slug}/carrinho`,
    noIndex: true,
  });

  const subtotal = useMemo(() => cartSubtotalCents(items), [items]);
  const activeTableCode = table?.code ?? tableCode;

  const handleSubmit = async () => {
    setFailure(null);
    setSubmitting(true);
    void track(restaurant.id, 'checkout_started', { metadata: { items: items.length } });

    try {
      const order = await createOrder({
        restaurantSlug: slug,
        items,
        tableCode: activeTableCode,
        customerName: customerName.trim() || undefined,
        notes: orderNotes.trim() || undefined,
      });

      clear();
      navigate(`/r/${slug}/pedido/${order.code}`, { replace: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Não foi possível enviar o pedido.';
      setFailure(message);
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <EmptyState
          title="Seu pedido está vazio"
          description="Escolha um prato no cardápio para começar."
          action={
            <Link
              to={`/r/${slug}`}
              className="flex h-11 items-center rounded-[8px] bg-ink px-5 text-[15px] font-medium text-paper"
            >
              Ver o cardápio
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-40 pt-4">
      <Link
        to={`/r/${slug}`}
        className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Continuar escolhendo
      </Link>

      <h1 className="mt-3 font-display text-[30px]">Seu pedido</h1>
      {activeTableCode && (
        <p className="mt-1 text-[14px] text-muted">
          Será entregue na <strong className="font-semibold text-ink">Mesa {activeTableCode}</strong>
        </p>
      )}

      <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
        {items.map((item) => (
          <li key={item.lineId} className="flex gap-3 py-4">
            <SmartImage
              src={item.imageUrl}
              alt={item.name}
              ratio="1/1"
              className="size-20 shrink-0 rounded-[8px]"
              fallbackLabel={item.name}
            />

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight">{item.name}</p>

              {item.addons.length > 0 && (
                <p className="mt-0.5 text-[13px] text-muted">
                  {item.addons.map((addon) => addon.name).join(' · ')}
                </p>
              )}
              {item.notes && <p className="mt-0.5 text-[13px] italic text-muted">“{item.notes}”</p>}

              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-9 items-center rounded-[6px] border border-hairline">
                  <button
                    type="button"
                    aria-label={`Diminuir ${item.name}`}
                    onClick={() => setQuantity(item.lineId, item.quantity - 1)}
                    className="flex size-9 items-center justify-center"
                  >
                    −
                  </button>
                  <span className="tabular w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${item.name}`}
                    onClick={() => setQuantity(item.lineId, item.quantity + 1)}
                    className="flex size-9 items-center justify-center"
                  >
                    +
                  </button>
                </div>

                <span className="tabular ml-auto text-[15px] font-semibold">
                  {formatMoney(lineTotalCents(item), restaurant.currency)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeLine(item.lineId)}
                className="mt-2 text-[13px] text-muted underline underline-offset-2 hover:text-danger"
              >
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-4">
        <Field label="Seu nome" hint="Ajuda o garçom a encontrar a mesa certa.">
          {(id) => (
            <Input
              id={id}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Como podemos te chamar?"
              maxLength={60}
              autoComplete="name"
            />
          )}
        </Field>

        <Field label="Observações do pedido">
          {(id) => (
            <Textarea
              id={id}
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder="Ex.: trazer as bebidas primeiro"
              maxLength={300}
            />
          )}
        </Field>
      </div>

      <dl className="mt-6 space-y-1.5 border-t border-hairline pt-4 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="tabular">{formatMoney(subtotal, restaurant.currency)}</dd>
        </div>
        <div className="flex justify-between font-display text-[20px]">
          <dt>Total</dt>
          <dd className="tabular">{formatMoney(subtotal, restaurant.currency)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[13px] text-muted">
        O pagamento é feito no caixa ou com o garçom. O pedido vai direto para a cozinha.
      </p>

      {failure && (
        <p className="mt-3 rounded-[8px] border border-danger/30 bg-[#F9E7E5] p-3 text-[14px] text-danger">
          {failure}
        </p>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper/97 px-4 pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl">
          <Button
            size="lg"
            fullWidth
            loading={submitting}
            disabled={!isOpen}
            onClick={() => void handleSubmit()}
          >
            {isOpen
              ? `Enviar pedido · ${formatMoney(subtotal, restaurant.currency)}`
              : 'Restaurante fechado'}
          </Button>
        </div>
      </div>
    </main>
  );
}
