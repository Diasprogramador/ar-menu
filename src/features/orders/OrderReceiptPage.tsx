import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getOrderReceipt, ORDER_STATUS_LABEL } from './orderService';
import { useMenu } from '@/features/menu/MenuContext';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { env } from '@/lib/env';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import type { OrderReceipt } from '@/types/database';

/**
 * Comprovante do pedido.
 *
 * O acesso exige o par (código, identificador de sessão) verificado no banco:
 * saber o código de outra mesa não basta para ler o pedido dela.
 *
 * O status é reconsultado enquanto a aba estiver visível, para o cliente
 * acompanhar o preparo sem precisar recarregar.
 */
export default function OrderReceiptPage() {
  const { restaurant } = useMenu();
  const { slug = '', code = '' } = useParams();

  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useSeo({ title: `Pedido ${code} — ${restaurant.name}`, noIndex: true });

  const load = useCallback(async () => {
    try {
      const data = await getOrderReceipt(slug, code);
      if (!data) {
        setState('missing');
        return;
      }
      setReceipt(data);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [slug, code]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Só busca de novo com a aba na frente: poupa bateria e dados do cliente
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (state === 'loading') {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-4 h-40 w-full rounded-[10px]" />
      </main>
    );
  }

  if (state === 'missing') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <EmptyState
          title="Pedido não encontrado"
          description="O código pode estar errado, ou este pedido foi feito em outro aparelho."
          action={
            <Link to={`/r/${slug}`} className="text-[15px] underline underline-offset-4">
              Voltar ao cardápio
            </Link>
          }
        />
      </main>
    );
  }

  if (state === 'error' || !receipt) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <ErrorState message="Não foi possível consultar o pedido." onRetry={() => void load()} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="h-px w-12 ember-rule" />
      <h1 className="mt-4 font-display text-[30px]">Pedido enviado</h1>
      <p className="mt-1 text-[15px] text-muted">
        Cite o código <strong className="tabular font-mono font-semibold text-ink">{receipt.code}</strong>{' '}
        para o garçom.
      </p>

      <div className="mt-5 flex items-center gap-2">
        <Badge tone={receipt.status === 'delivered' ? 'positive' : 'teal'}>
          {ORDER_STATUS_LABEL[receipt.status]}
        </Badge>
        <span className="text-[13px] text-muted">{formatDateTime(receipt.created_at)}</span>
      </div>

      <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
        {receipt.items.map((item, index) => (
          <li key={`${item.product_name}-${index}`} className="flex gap-3 py-3.5">
            <span className="tabular w-7 shrink-0 text-[15px] font-semibold text-muted">
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">{item.product_name}</p>
              {item.addons.length > 0 && (
                <p className="mt-0.5 text-[13px] text-muted">
                  {item.addons.map((addon) => addon.name).join(' · ')}
                </p>
              )}
              {item.notes && <p className="mt-0.5 text-[13px] italic text-muted">“{item.notes}”</p>}
            </div>
            <span className="tabular text-[15px]">
              {formatMoney(item.line_total_cents, restaurant.currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-baseline justify-between font-display text-[22px]">
        <span>Total</span>
        <span className="tabular">{formatMoney(receipt.total_cents, restaurant.currency)}</span>
      </div>

      {receipt.notes && (
        <p className="mt-4 rounded-[8px] bg-surface p-3 text-[14px] text-muted">
          <strong className="font-semibold text-ink">Observações:</strong> {receipt.notes}
        </p>
      )}

      {!env.isConfigured && (
        <p className="mt-5 rounded-[8px] border border-hairline bg-surface p-3 text-[13px] text-muted">
          Esta é a vitrine de demonstração: o pedido ficou salvo neste aparelho e não foi enviado a
          nenhuma cozinha.
        </p>
      )}

      <Link
        to={`/r/${slug}`}
        className="mt-8 flex h-12 items-center justify-center rounded-[8px] border border-hairline text-[15px] font-medium"
      >
        Pedir mais alguma coisa
      </Link>
    </main>
  );
}
