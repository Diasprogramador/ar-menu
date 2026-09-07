import { describe, expect, it } from 'vitest';

import { resolveARMode, type ARCapabilities } from './capabilities';

const capabilities = (overrides: Partial<ARCapabilities> = {}): ARCapabilities => ({
  immersiveAR: false,
  quickLook: false,
  webgl: true,
  camera: true,
  secureContext: true,
  bestMode: 'viewer-3d',
  ...overrides,
});

const produto = (overrides: Partial<Parameters<typeof resolveARMode>[1]> = {}) => ({
  hasModel: true,
  hasUsdz: false,
  arEnabled: true,
  ...overrides,
});

/**
 * A escolha do caminho de AR decide o que o cliente vê. Errar aqui significa
 * prometer câmera para um aparelho que não tem, ou esconder a AR de quem tem.
 */
describe('resolveARMode', () => {
  it('prefere WebXR quando o aparelho suporta sessão imersiva', () => {
    expect(resolveARMode(capabilities({ immersiveAR: true }), produto())).toBe('webxr');
  });

  it('usa Quick Look no iPhone somente quando existe arquivo USDZ', () => {
    expect(resolveARMode(capabilities({ quickLook: true }), produto({ hasUsdz: true }))).toBe(
      'quick-look',
    );
  });

  it('cai para o visualizador 3D no iPhone sem USDZ', () => {
    // Sem USDZ, o link rel="ar" abriria um arquivo que o iOS não entende
    expect(resolveARMode(capabilities({ quickLook: true }), produto({ hasUsdz: false }))).toBe(
      'viewer-3d',
    );
  });

  it('cai para o visualizador 3D quando não há AR imersiva', () => {
    expect(resolveARMode(capabilities(), produto())).toBe('viewer-3d');
  });

  it('não oferece nada quando o produto não tem modelo', () => {
    expect(resolveARMode(capabilities({ immersiveAR: true }), produto({ hasModel: false }))).toBe(
      'none',
    );
  });

  it('respeita a AR desligada pelo restaurante mesmo com modelo cadastrado', () => {
    expect(resolveARMode(capabilities({ immersiveAR: true }), produto({ arEnabled: false }))).toBe(
      'none',
    );
  });

  it('não oferece nada sem WebGL', () => {
    expect(resolveARMode(capabilities({ webgl: false }), produto())).toBe('none');
  });
});
