import { env } from './env';
import { getSessionId } from './session';
import { supabase } from './supabase';
import type { AnalyticsEventName } from '@/types/database';

/**
 * Camada única de analytics.
 *
 * A escrita passa pela RPC `track_event`, que valida o nome do evento contra
 * uma lista branca no banco e confirma que o produto pertence ao restaurante.
 * O cliente não escreve direto na tabela.
 *
 * Falha de rede aqui nunca interrompe o fluxo do usuário: medir é secundário
 * em relação a pedir.
 */

type TrackOptions = {
  productId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Eventos disparados uma única vez por sessão + alvo. */
const alreadySent = new Set<string>();

export async function track(
  restaurantId: string | undefined | null,
  event: AnalyticsEventName,
  options: TrackOptions = {},
): Promise<void> {
  if (!restaurantId || !env.isConfigured) return;

  try {
    await supabase.rpc('track_event', {
      p_restaurant_id: restaurantId,
      p_event_name: event,
      p_product_id: options.productId ?? null,
      p_session_id: getSessionId(),
      p_metadata: options.metadata ?? {},
    });
  } catch {
    // silêncio proposital: telemetria não pode derrubar a experiência
  }
}

/**
 * Versão idempotente por sessão. Evita inflar "product_viewed" quando o React
 * remonta o componente ou o usuário volta para a mesma tela.
 */
export function trackOnce(
  restaurantId: string | undefined | null,
  event: AnalyticsEventName,
  options: TrackOptions = {},
): void {
  if (!restaurantId) return;
  const key = `${event}:${options.productId ?? 'none'}`;
  if (alreadySent.has(key)) return;
  alreadySent.add(key);
  void track(restaurantId, event, options);
}

/** Contabiliza a leitura de um QR Code no painel. */
export async function registerQrScan(restaurantId: string, targetPath: string): Promise<void> {
  if (!env.isConfigured) return;

  try {
    await supabase.rpc('register_qr_scan', {
      p_restaurant_id: restaurantId,
      p_target_path: targetPath,
    });
  } catch {
    /* idem */
  }
}
