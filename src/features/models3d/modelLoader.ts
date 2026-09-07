import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { calibrateScale, type BoundingBoxSize, type PhysicalDimensions, type ScaleCalibration } from '@/features/ar/scale';

/**
 * Carregamento, medição e preparo de modelos GLB/GLTF.
 *
 * Responsabilidades separadas de propósito:
 *   - `loadGltf`      busca e faz o parse, com cache LRU compartilhado;
 *   - `measureModel`  mede o bounding box em unidades de cena;
 *   - `prepareModel`  devolve um grupo com origem no centro da base, já
 *                     calibrado para as dimensões físicas do produto.
 *
 * A origem no centro da base é o que permite "apoiar" o prato na superfície
 * detectada pelo hit-test sem cálculo extra na hora do posicionamento.
 */

export class ModelLoadError extends Error {
  readonly kind: 'network' | 'invalid' | 'timeout';
  override readonly cause: unknown;

  constructor(message: string, kind: ModelLoadError['kind'], cause?: unknown) {
    super(message);
    this.name = 'ModelLoadError';
    this.kind = kind;
    this.cause = cause;
  }
}

type LoadedGltf = {
  scene: THREE.Group;
  size: BoundingBoxSize;
};

const MAX_CACHE_ENTRIES = 3;
const LOAD_TIMEOUT_MS = 25_000;

const cache = new Map<string, Promise<LoadedGltf>>();

let sharedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (sharedLoader) return sharedLoader;

  const loader = new GLTFLoader();

  // Compressão é opcional: modelos sem Draco/Meshopt carregam igual. Registrar
  // os decodificadores agora evita um erro silencioso quando o restaurante
  // sobe um modelo otimizado.
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);

  sharedLoader = loader;
  return loader;
}

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function evictOldest(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = cache.keys().next().value;
  if (!oldestKey) return;
  const entry = cache.get(oldestKey);
  cache.delete(oldestKey);
  void entry?.then((loaded) => disposeScene(loaded.scene)).catch(() => undefined);
}

export function measureModel(object: THREE.Object3D): BoundingBoxSize {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z };
}

/**
 * Baixa e faz o parse do modelo. O resultado fica em cache porque o mesmo
 * produto costuma ser aberto em 3D e depois em AR na mesma sessão.
 *
 * Sem cancelamento de propósito: a promise é compartilhada entre consumidores,
 * então abortá-la por causa de um que saiu da tela derrubaria os outros. Foi
 * exatamente isso que o remount duplo do StrictMode expôs — o segundo mount
 * pegava do cache a promise que o primeiro acabara de rejeitar. Quem desmonta
 * apenas ignora o resultado; o download em curso ainda alimenta o cache.
 */
export function loadGltf(
  url: string,
  options: { onProgress?: (ratio: number) => void } = {},
): Promise<LoadedGltf> {
  const cached = cache.get(url);
  if (cached) {
    // Reinsere para manter a ordem de uso (LRU)
    cache.delete(url);
    cache.set(url, cached);
    options.onProgress?.(1);
    return cached;
  }

  const promise = new Promise<LoadedGltf>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new ModelLoadError('O modelo 3D demorou demais para carregar.', 'timeout'));
    }, LOAD_TIMEOUT_MS);

    getLoader().load(
      url,
      (gltf) => {
        window.clearTimeout(timeout);

        const scene = gltf.scene ?? gltf.scenes?.[0];
        if (!scene) {
          reject(new ModelLoadError('O arquivo não contém uma cena 3D válida.', 'invalid'));
          return;
        }

        const size = measureModel(scene);
        if (!Number.isFinite(size.x) || size.x + size.y + size.z <= 0) {
          reject(new ModelLoadError('O modelo 3D está vazio ou corrompido.', 'invalid'));
          return;
        }

        resolve({ scene, size });
      },
      (event) => {
        if (event.total > 0) options.onProgress?.(event.loaded / event.total);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(
          new ModelLoadError(
            'Não foi possível baixar o modelo 3D deste prato.',
            'network',
            error,
          ),
        );
      },
    );
  });

  cache.set(url, promise);
  evictOldest();

  // Um erro não pode envenenar o cache: a próxima tentativa precisa refazer
  promise.catch(() => cache.delete(url));

  return promise;
}

export type PreparedModel = {
  /** Grupo pronto para adicionar à cena: origem no centro da base. */
  object: THREE.Group;
  calibration: ScaleCalibration;
  /** Tamanho medido no arquivo, em unidades de cena. */
  sourceSize: BoundingBoxSize;
};

export type ModelPlacementConfig = {
  scaleMultiplier?: number;
  rotation?: { x: number; y: number; z: number };
  /** Deslocamento fino em centímetros, aplicado depois da calibração. */
  offsetCm?: { x: number; y: number; z: number };
};

/**
 * Clona a cena carregada, aplica a calibração física e reposiciona a origem.
 *
 * Clonar é necessário porque o mesmo modelo em cache pode estar sendo exibido
 * no visualizador 3D e na sessão de AR ao mesmo tempo. O clone compartilha
 * geometria e material com o original — por isso quem descarta um clone não
 * deve dispor desses recursos; isso é papel de `clearModelCache`.
 */
export function prepareModel(
  loaded: LoadedGltf,
  dimensions: PhysicalDimensions,
  config: ModelPlacementConfig = {},
): PreparedModel {
  const calibration = calibrateScale(dimensions, loaded.size, config.scaleMultiplier ?? 1);

  const inner = loaded.scene.clone(true);
  inner.scale.setScalar(calibration.baseScale);

  if (config.rotation) {
    inner.rotation.set(
      THREE.MathUtils.degToRad(config.rotation.x),
      THREE.MathUtils.degToRad(config.rotation.y),
      THREE.MathUtils.degToRad(config.rotation.z),
    );
  }

  // Recentraliza depois da escala e da rotação: a caixa muda com ambas
  const box = new THREE.Box3().setFromObject(inner);
  const center = new THREE.Vector3();
  box.getCenter(center);
  inner.position.x -= center.x;
  inner.position.z -= center.z;
  inner.position.y -= box.min.y;

  if (config.offsetCm) {
    inner.position.x += config.offsetCm.x / 100;
    inner.position.y += config.offsetCm.y / 100;
    inner.position.z += config.offsetCm.z / 100;
  }

  const object = new THREE.Group();
  object.name = 'prepared-model';
  object.add(inner);

  return { object, calibration, sourceSize: loaded.size };
}

/** Libera GPU e memória. Chamar ao sair do fluxo de 3D/AR. */
export function clearModelCache(): void {
  for (const entry of cache.values()) {
    void entry.then((loaded) => disposeScene(loaded.scene)).catch(() => undefined);
  }
  cache.clear();
}

export type { LoadedGltf };
