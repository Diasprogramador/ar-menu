/**
 * Identificador anônimo de sessão do cliente do restaurante.
 *
 * Serve para dois usos: ligar os eventos de um mesmo visitante no funil e
 * permitir que ele consulte o próprio pedido depois. Não carrega nenhum dado
 * pessoal, não é enviado a terceiros e vive só no `sessionStorage` — fechou a
 * aba, acabou.
 */
const STORAGE_KEY = 'ar-menu:session';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cached: string | null = null;

export function getSessionId(): string {
  if (cached) return cached;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const fresh = randomId();
    sessionStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // Navegação privada ou armazenamento bloqueado: o funil perde a ligação
    // entre eventos, mas nada quebra.
    cached ??= randomId();
    return cached;
  }
}
