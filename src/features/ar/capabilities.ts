/**
 * Detecção de capacidades de AR.
 *
 * Um único serviço, consultado por todo o app. Nada de `if (isIOS)` espalhado
 * pelos componentes: navegador muda, lista de user agent envelhece, e o produto
 * passa a prometer o que o aparelho não entrega.
 *
 * Quatro caminhos, em ordem de qualidade:
 *
 *   1. WebXR immersive-ar  — Android/Chrome com os Serviços de RA do Google.
 *                            Rastreia superfície de verdade (hit-test).
 *   2. Quick Look          — iOS/Safari. O sistema abre o visualizador nativo a
 *                            partir de um arquivo USDZ, com rastreamento
 *                            completo. Exige `usdz_url` no produto.
 *   3. Câmera + giroscópio — universal: funciona em qualquer navegador com
 *                            HTTPS, câmera e WebGL, sem instalar nada. O prato
 *                            aparece na mesa em tamanho real e fica ancorado
 *                            enquanto a pessoa gira o aparelho. Não acompanha
 *                            deslocamento, porque sem SLAM não há como saber
 *                            que o aparelho andou.
 *   4. Visualizador 3D     — quando não há câmera ou a permissão foi negada.
 *                            Mantém rotação, zoom limitado, dimensões e o botão
 *                            de adicionar ao pedido.
 *
 * O caminho 3 existe porque uma parcela grande dos Android não tem os Serviços
 * de RA instalados, e o produto promete "escaneou o QR Code e vê na mesa" — sem
 * pedir instalação de nada.
 */

export type ARMode = 'webxr' | 'quick-look' | 'camera' | 'viewer-3d' | 'none';

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
 * iOS e iPadOS. Existe só como rede de segurança para o Quick Look.
 *
 * Detecção por user agent é frágil por princípio, e por isso não decide sozinha
 * nada aqui. Mas `relList.supports('ar')` já se comportou de forma inconsistente
 * entre versões do WebKit, e o custo de errar é alto: o cliente de iPhone perde
 * o único caminho de AR nativa que tem. Nesse caso específico, o falso negativo
 * é pior que o falso positivo — se o Quick Look não abrir, a tela continua
 * oferecendo o visualizador 3D.
 *
 * O iPadOS se declara Macintosh desde 2019; o número de pontos de toque é o que
 * o separa de um Mac de verdade.
 */
function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * Quick Look é detectado por feature primeiro: `relList.supports` responde pela
 * própria engine. O user agent entra apenas como segunda chance.
 */
function supportsQuickLook(): boolean {
  try {
    const anchor = document.createElement('a');
    const declaraSuporte = Boolean(anchor.relList?.supports?.('ar'));
    if (declaraSuporte) return true;
    return isAppleTouchDevice();
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
        : 'Este navegador não expõe a API WebXR; usamos a câmera diretamente.';
    } else {
      try {
        immersiveAR = await xr.isSessionSupported('immersive-ar');
        if (!immersiveAR) {
          reason =
            'Este aparelho não tem os Serviços de RA do Google; usamos a câmera diretamente.';
        }
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
      : camera && secureContext && webgl
        ? 'camera'
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
 * Modo efetivo considerando o produto.
 *
 * Quick Look só vale se existir USDZ: sem ele, um iPhone abriria um link que o
 * sistema não interpreta. E o caminho de câmera exige contexto seguro, porque
 * `getUserMedia` não funciona fora de HTTPS.
 */
export function resolveARMode(
  capabilities: ARCapabilities,
  product: { hasModel: boolean; hasUsdz: boolean; arEnabled: boolean },
): ARMode {
  if (!product.hasModel || !product.arEnabled) return 'none';
  if (capabilities.immersiveAR) return 'webxr';
  if (capabilities.quickLook && product.hasUsdz) return 'quick-look';
  if (capabilities.camera && capabilities.secureContext && capabilities.webgl) return 'camera';
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
