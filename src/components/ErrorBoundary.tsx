import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Última barreira antes da tela branca.
 *
 * Um erro de render em qualquer lugar da árvore derruba o React inteiro; sem
 * isto, o cliente do restaurante ficaria olhando para o nada com o celular na
 * mão. Aqui ele ao menos consegue recarregar ou voltar ao cardápio.
 */
type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Em produção este é o ponto de integração com um serviço de observabilidade
    console.error('[ar-menu] erro não tratado', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-px w-12 ember-rule" />
        <h1 className="font-display text-2xl">Algo quebrou por aqui</h1>
        <p className="max-w-sm text-sm text-muted">
          A página não conseguiu carregar. Recarregue para tentar de novo — seu carrinho continua
          salvo.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-[8px] bg-ink px-5 text-[15px] font-medium text-paper"
          >
            Recarregar
          </button>
          <a
            href="/"
            className="flex h-11 items-center rounded-[8px] border border-hairline px-5 text-[15px]"
          >
            Ir para o início
          </a>
        </div>
      </div>
    );
  }
}
