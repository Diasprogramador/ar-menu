import { useEffect, useState } from 'react';

import { PageHeader } from '../components/AdminPrimitives';
import {
  listOrders,
  NEXT_STATUS,
  ORDER_STATUS_LABEL,
  updateOrderStatus,
  type OrderWithItems,
} from '@/features/orders/orderService';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, EmptyState, ErrorState, Panel, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { formatMoney, formatRelativeTime } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';
import type { OrderStatus } from '@/types/database';

const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];

/**
 * Pedidos em tempo real.
 *
 * A cozinha não fica atualizando a página: a inscrição em Realtime recarrega a
 * lista quando um pedido novo chega. A subscrição respeita RLS, então só chegam
 * eventos do restaurante ativo.
 */
export default function AdminOrdersPage() {
  const { activeRestaurant } = useAuth();
  const [filter, setFilter] = useState<OrderStatus | 'all' | 'open'>('open');

  useSeo({ title: 'Pedidos — AR Menu', noIndex: true });

  const orders = useResource(
    () => listOrders(activeRestaurant!.id, { limit: 80 }),
    [activeRestaurant?.id],
  );

  const reload = orders.reload;

  useEffect(() => {
    if (!activeRestaurant) return;

    const channel = supabase
      .channel(`orders:${activeRestaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${activeRestaurant.id}`,
        },
        () => reload(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRestaurant, reload]);

  const advance = async (order: OrderWithItems) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await updateOrderStatus(order.id, next);
      orders.setData((current) =>
        current.map((item) => (item.id === order.id ? { ...item, status: next } : item)),
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível atualizar.', 'error');
      orders.reload();
    }
  };

  const cancel = async (order: OrderWithItems) => {
    if (!window.confirm(`Cancelar o pedido ${order.code}?`)) return;
    try {
      await updateOrderStatus(order.id, 'cancelled');
      orders.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível cancelar.', 'error');
    }
  };

  if (!activeRestaurant) return null;

  const all = orders.data ?? [];
  const visible = all.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'open') return OPEN_STATUSES.includes(order.status);
    return order.status === filter;
  });

  const openCount = all.filter((order) => OPEN_STATUSES.includes(order.status)).length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Pedidos"
        description={`${openCount} ${openCount === 1 ? 'pedido em aberto' : 'pedidos em aberto'} · atualiza sozinho`}
        actions={
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            aria-label="Filtrar pedidos"
            className="max-w-[190px]"
          >
            <option value="open">Em aberto</option>
            <option value="all">Todos</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />

      {orders.status === 'loading' && !orders.data && (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full rounded-[10px]" />
          ))}
        </div>
      )}

      {orders.status === 'error' && !orders.data && (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      )}

      {orders.data && visible.length === 0 && (
        <Panel>
          <EmptyState
            title="Nenhum pedido por aqui"
            description={
              filter === 'open'
                ? 'Tudo entregue. Os novos pedidos aparecem aqui automaticamente.'
                : 'Ajuste o filtro para ver outros pedidos.'
            }
          />
        </Panel>
      )}

      <div className="space-y-3">
        {visible.map((order) => {
          const next = NEXT_STATUS[order.status];
          return (
            <Panel key={order.id} className={cn('p-4', order.status === 'pending' && 'border-teal')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular font-mono text-[15px] font-semibold">{order.code}</span>
                {order.tables && <Badge tone="teal">Mesa {order.tables.code}</Badge>}
                <Badge
                  tone={
                    order.status === 'cancelled'
                      ? 'danger'
                      : order.status === 'delivered'
                        ? 'positive'
                        : 'warning'
                  }
                >
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
                <span className="text-[13px] text-muted">{formatRelativeTime(order.created_at)}</span>
                <span className="tabular ml-auto text-[16px] font-semibold">
                  {formatMoney(order.total_cents, activeRestaurant.currency)}
                </span>
              </div>

              {order.customer_name && (
                <p className="mt-1.5 text-[14px] text-muted">Cliente: {order.customer_name}</p>
              )}

              <ul className="mt-3 space-y-1">
                {order.order_items.map((item) => (
                  <li key={item.id} className="flex gap-2 text-[14px]">
                    <span className="tabular w-6 shrink-0 font-semibold text-muted">
                      {item.quantity}×
                    </span>
                    <div className="min-w-0">
                      <span>{item.product_name}</span>
                      {item.addons.length > 0 && (
                        <span className="text-muted"> · {item.addons.map((a) => a.name).join(', ')}</span>
                      )}
                      {item.notes && <p className="text-[13px] italic text-muted">“{item.notes}”</p>}
                    </div>
                  </li>
                ))}
              </ul>

              {order.notes && (
                <p className="mt-2 rounded-[6px] bg-surface p-2 text-[13px]">
                  <strong className="font-semibold">Observação:</strong> {order.notes}
                </p>
              )}

              {order.status !== 'cancelled' && order.status !== 'delivered' && (
                <div className="mt-3 flex gap-2">
                  {next && (
                    <Button size="sm" variant="teal" onClick={() => void advance(order)}>
                      {ORDER_STATUS_LABEL[next]}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => void cancel(order)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
