import '@testing-library/jest-dom/vitest';

/**
 * jsdom não implementa `matchMedia`, e vários componentes consultam
 * `prefers-reduced-motion` antes de animar. Sem este stub, montar qualquer
 * visualizador quebra o teste por um motivo que nada tem a ver com o que se
 * está testando.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
