import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carregamento de dados assíncronos com os quatro estados que toda tela precisa
 * tratar: carregando, pronto, vazio e erro.
 *
 * Não é um substituto de biblioteca de cache — é o mínimo para o painel não
 * repetir o mesmo `useEffect` com `try/catch` em dez arquivos, e para evitar o
 * clássico "setState depois do unmount".
 */
export type ResourceState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };

export function useResource<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): ResourceState<T> & { reload: () => void; setData: (updater: (current: T) => T) => void } {
  const [state, setState] = useState<ResourceState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((current) => ({ status: 'loading', data: current.data, error: null }));
    try {
      const data = await loader();
      if (mounted.current) setState({ status: 'ready', data, error: null });
    } catch (error) {
      if (!mounted.current) return;
      setState((current) => ({
        status: 'error',
        data: current.data,
        error: error instanceof Error ? error.message : 'Não foi possível carregar os dados.',
      }));
    }
    // O loader costuma ser recriado a cada render; as dependências reais são
    // declaradas por quem chama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  /** Atualização otimista, para a lista responder ao clique sem esperar a rede. */
  const setData = useCallback((updater: (current: T) => T) => {
    setState((current) =>
      current.data === null ? current : { status: 'ready', data: updater(current.data), error: null },
    );
  }, []);

  return { ...state, reload: () => void run(), setData };
}
