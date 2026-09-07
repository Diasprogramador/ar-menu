import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * Cliente único do Supabase.
 *
 * Usa apenas a chave `anon`: todo acesso é filtrado pelas políticas de RLS
 * definidas em supabase/migrations/*_rls_policies.sql. O navegador nunca
 * recebe uma chave capaz de ignorar essas políticas.
 */
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'anon-key-ausente',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ar-menu-auth',
    },
    global: {
      headers: { 'x-application-name': 'ar-menu' },
    },
    db: { schema: 'public' },
  },
);

/** Erro de domínio: mensagem já pronta para a interface. */
export class DataError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;
  }
}

/**
 * Traduz erros do PostgREST para mensagens que fazem sentido para quem está
 * na tela. Nunca repassa detalhes internos do banco para o usuário final.
 */
export function toDataError(error: unknown, fallback: string): DataError {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: string }).code);
    const message = String((error as { message?: string }).message ?? '');

    if (code === 'PGRST116') return new DataError('Registro não encontrado.', error);
    if (code === '23505') return new DataError('Já existe um registro com esse identificador.', error);
    if (code === '23503') return new DataError('Existe outro registro dependendo deste.', error);
    if (code === '42501') return new DataError('Você não tem permissão para esta ação.', error);
    // Erros levantados de propósito pelas nossas funções RPC já são legíveis
    if (code === 'P0001' || code === '22023' || code === 'P0002') {
      return new DataError(message || fallback, error);
    }
  }

  if (!navigator.onLine) {
    return new DataError('Sem conexão. Verifique a internet e tente de novo.', error);
  }

  return new DataError(fallback, error);
}
