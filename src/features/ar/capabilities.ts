/**
 * Detecção de capacidades de AR.
 *
 * Um único serviço, consultado por todo o app. Nada de `if (isIOS)` espalhado
 * pelos componentes: navegador muda, lista de user agent envelhece, e o produto
 * passa a prometer o que o aparelho não entrega.
 *
 * Três caminhos possíveis, em ordem de qualidade:
 *
 *   1. WebXR immersive-ar  — Android/Chrome, Oculus, alguns navegadores desktop
 *                            com headset. Rastreia superfície de verdade
 *                            (hit-test) e desenha dentro da nossa cena.
 *   2. Quick Look          — iOS/Safari. O sistema abre o visualizador nativo a
 *                            partir de um arquivo USDZ. Exige que o produto
 *                            tenha `usdz_url` cadastrado.
 *   3. Visualizador 3D     — sempre disponível onde há WebGL. É o fallback, não
 *                            um consolo: mantém rotação, zoom limitado,
 *                            dimensões e o botão de adicionar ao pedido.
 */

export type ARMode = 'webxr' | 'quick-look' | 'viewer-3d' | 'none';

export type ARCapabilities = {
  /** WebXR com sessão immersive-ar e hit-test disponível. */
  immersiveAR: boolean;
  /** Safari no iOS/iPadOS com suporte a `<a rel="ar">` (AR Quick Look). */
  quickLook: boolean;
  /** WebGL disponível para o visualizador 3D. */
  webgl: boolean;
  /** A API de câmera existe (não significa que a permissão foi concedida). */
  camera: boolean;
  /** WebXR e getUserMedia exigem HTTPS ou localhost. */
  secureContext: boolean;
  /** Melhor modo possível neste aparelho, considerando o produto. */
  bestMode: ARMode;
  /** Motivo legível quando a AR imersiva não está disponível. */
  reason?: string;
};

type NavigatorWithXR = Navigator & {
  xr?: {
    isSessionSupported(mode: string): Promise<boolean>;
  };
};

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/**
 * Quick Look é detectado por feature, não por user agent: `relList.supports`
 * responde pela própria engine.
 */
function supportsQuickLook(): boolean {
  try {
    const anchor = document.createElement('a');
    if (!anchor.relList?.supports) return false;
    if (!anchor.relList.supports('ar')) return false;
    // A engine precisa ser WebKit para o handler nativo existir de fato
    return typeof (window as { webkit?: unknown }).webkit !== 'undefined' || /Safari/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

let cached: Promise<ARCapabilities> | null = null;

async function probe(): Promise<ARCapabilities> {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const webgl = hasWebGL();
  const camera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const quickLook = supportsQuickLook();

  let immersiveAR = false;
  let reason: string | undefined;

  if (!secureContext) {
    reason = 'A realidade aumentada exige uma conexão segura (HTTPS).';
  } else {
    const xr = (navigator as NavigatorWithXR).xr;
    if (!xr) {
      reason = quickLook
        ? 'Este iPhone usa o visualizador nativo da Apple para AR.'
        : 'Este navegador não expõe a API WebXR.';
    } else {
      try {
        immersiveAR = await xr.isSessionSupported('immersive-ar');
        if (!immersiveAR) reason = 'Este aparelho não oferece sessões de AR imersiva.';
      } catch (error) {
        reason = 'Não foi possível consultar o suporte a AR neste aparelho.';
        void error;
      }
    }
  }

  const bestMode: ARMode = immersiveAR
    ? 'webxr'
    : quickLook
      ? 'quick-look'
      : webgl
        ? 'viewer-3d'
        : 'none';

  return { immersiveAR, quickLook, webgl, camera, secureContext, bestMode, reason };
}

/** O resultado é estável durante a sessão, então consultamos o navegador uma vez. */
export function detectARCapabilities(): Promise<ARCapabilities> {
  cached ??= probe();
  return cached;
}

/** Apenas para testes: descarta o resultado memoizado. */
export function resetARCapabilitiesCache(): void {
  cached = null;
}

/**
 * Modo efetivo considerando o produto: Quick Look só vale se existir USDZ.
 * Sem isso, um iPhone abriria um link quebrado.
 */
export function resolveARMode(
  capabilities: ARCapabilities,
  product: { hasModel: boolean; hasUsdz: boolean; arEnabled: boolean },
): ARMode {
  if (!product.hasModel || !product.arEnabled) return 'none';
  if (capabilities.immersiveAR) return 'webxr';
  if (capabilities.quickLook && product.hasUsdz) return 'quick-look';
  if (capabilities.webgl) return 'viewer-3d';
  return 'none';
}

/** Estado da permissão de câmera, quando o navegador expõe a Permissions API. */
export async function getCameraPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}
