import { env } from '@/lib/env';
import { getSessionId } from '@/lib/session';
import { supabase, toDataError } from '@/lib/supabase';
import type { CartItem } from '@/features/cart/cartStore';
import type { CreatedOrder, Order, OrderItem, OrderReceipt, OrderStatus } from '@/types/database';

/**
 * Criação e consulta de pedidos.
 *
 * O cliente envia apenas identificadores e quantidades. Preço, adicionais e
 * total são recalculados dentro da função `create_order` no banco, com os
 * produtos travados por `FOR UPDATE`. Um total enviado pelo navegador seria
 * apenas uma sugestão — e uma sugestão que se pode adulterar no DevTools.
 *
 * Sem as chaves do Supabase o pedido é registrado localmente, apenas para que a
 * vitrine pública consiga fechar o fluxo. Nesse modo não existe cozinha do outro
 * lado, e o comprovante diz isso.
 */

const LOCAL_ORDERS_KEY = 'ar-menu:demo-orders';

function localOrderCode(): string {
  const alfabeto = 'ACDEFGHJKLMNPQRTUVWXY34679';
  return Array.from({ length: 5 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join('');
}

function readLocalOrders(): Record<string, OrderReceipt> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) ?? '{}') as Record<string, OrderReceipt>;
  } catch {
    return {};
  }
}

function writeLocalOrder(receipt: OrderReceipt): void {
  try {
    const all = readLocalOrders();
    all[receipt.code] = receipt;
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(all));
  } catch {
    // Armazenamento bloqueado: o comprovante da tela atual ainda funciona
  }
}

export type CreateOrderInput = {
  restaurantSlug: string;
  items: CartItem[];
  tableCode?: string | null;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
};

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  if (input.items.length === 0) {
    throw new Error('Adicione pelo menos um item antes de finalizar.');
  }

  if (!env.isConfigured) {
    const items = input.items.map((item) => ({
      product_name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      addons: item.addons,
      notes: item.notes || null,
      line_total_cents:
        (item.unitPriceCents + item.addons.reduce((sum, addon) => sum + addon.price_cents, 0)) *
        item.quantity,
    }));
    const total = items.reduce((sum, item) => sum + item.line_total_cents, 0);
    const receipt: OrderReceipt = {
      id: `demo-${Date.now().toString(36)}`,
      code: localOrderCode(),
      status: 'confirmed',
      subtotal_cents: total,
      total_cents: total,
      customer_name: input.customerName ?? null,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      items,
    };
    writeLocalOrder(receipt);
    return {
      id: receipt.id,
      code: receipt.code,
      status: receipt.status,
      subtotal_cents: total,
      total_cents: total,
      table_code: input.tableCode ?? null,
      created_at: receipt.created_at,
    };
  }

  const payload = input.items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    notes: item.notes || null,
    addon_ids: item.addons.map((addon) => addon.id),
  }));

  const { data, error } = await supabase.rpc('create_order', {
    p_restaurant_slug: input.restaurantSlug,
    p_items: payload,
    p_table_code: input.tableCode ?? null,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_notes: input.notes ?? null,
    p_session_id: getSessionId(),
  });

  if (error) throw toDataError(error, 'Não foi possível enviar o pedido. Tente novamente.');
  if (!data) throw new Error('O pedido não foi criado. Tente novamente.');

  return data as CreatedOrder;
}

/** Consulta do comprovante pelo próprio cliente: exige código + sessão. */
export async function getOrderReceipt(
  restaurantSlug: string,
  code: string,
): Promise<OrderReceipt | null> {
  if (!env.isConfigured) return readLocalOrders()[code.toUpperCase()] ?? null;

  const { data, error } = await supabase.rpc('get_order_by_code', {
    p_restaurant_slug: restaurantSlug,
    p_code: code,
    p_session_id: getSessionId(),
  });

  if (error) throw toDataError(error, 'Não foi possível consultar este pedido.');
  return (data as OrderReceipt | null) ?? null;
}

/* -------------------------------------------------------------------------
 * Lado do restaurante
 * ---------------------------------------------------------------------- */

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  tables: { code: string; label: string | null } | null;
};

export async function listOrders(
  restaurantId: string,
  options: { status?: OrderStatus | 'all'; limit?: number } = {},
): Promise<OrderWithItems[]> {
  let query = supabase
    .from('orders')
    .select('*, order_items (*), tables (code, label)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 60);

  if (options.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) throw toDataError(error, 'Não foi possível carregar os pedidos.');
  return (data ?? []) as OrderWithItems[];
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) throw toDataError(error, 'Não foi possível atualizar o pedido.');
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

/** Próximo passo natural do fluxo de cozinha, para o botão de ação única. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};
