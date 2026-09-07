import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { loadGltf, ModelLoadError, prepareModel, type ModelPlacementConfig } from './modelLoader';
import type { PhysicalDimensions, ScaleCalibration } from '@/features/ar/scale';

/**
 * Visualizador 3D interativo.
 *
 * É o fallback quando a AR imersiva não existe, e também o preview usado pelo
 * restaurante ao cadastrar um modelo. Nos dois casos vale a mesma promessa:
 * girar, aproximar e afastar dentro de limites, sem destruir a noção de escala.
 *
 * Todo recurso de GPU criado aqui é liberado no cleanup — deixar um
 * `WebGLRenderer` vivo depois de sair da tela é vazamento clássico em SPA.
 */

type ModelViewer3DProps = {
  modelUrl: string;
  dimensions: PhysicalDimensions;
  placement?: ModelPlacementConfig;
  className?: string;
  /** Mostra o piso de referência com a marcação de 10 cm. Útil no admin. */
  showGrid?: boolean;
  autoRotate?: boolean;
  onCalibrated?: (calibration: ScaleCalibration) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
};

type ViewerState =
  | { status: 'loading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export function ModelViewer3D({
  modelUrl,
  dimensions,
  placement,
  className,
  showGrid = false,
  autoRotate = true,
  onCalibrated,
  onReady,
  onError,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>({ status: 'loading', progress: 0 });

  // Os callbacks entram por ref para que trocar a identidade da função no pai
  // não remonte a cena inteira. A atribuição fica num efeito: escrever em ref
  // durante o render quebra o modo concorrente do React.
  const callbacks = useRef({ onCalibrated, onReady, onError });
  useEffect(() => {
    callbacks.current = { onCalibrated, onReady, onError };
  }, [onCalibrated, onReady, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const abort = new AbortController();
    let disposed = false;
    let frameId = 0;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();

    // RoomEnvironment dá reflexo PBR crível sem baixar um HDRI
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.01,
      50,
    );

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(0.6, 1.4, 0.9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.05;
    key.shadow.camera.far = 6;
    key.shadow.bias = -0.0012;
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.85;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    setState({ status: 'loading', progress: 0 });

    loadGltf(modelUrl, {
      signal: abort.signal,
      onProgress: (ratio) => {
        if (!disposed) setState({ status: 'loading', progress: ratio });
      },
    })
      .then((loaded) => {
        if (disposed) return;

        const prepared = prepareModel(loaded, dimensions, placement);
        prepared.object.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        scene.add(prepared.object);

        const { finalSizeMeters } = prepared.calibration;
        const radius = Math.max(finalSizeMeters.x, finalSizeMeters.y, finalSizeMeters.z);

        if (showGrid) {
          // Grade com célula de 10 cm: dá referência de tamanho ao administrador
          const grid = new THREE.GridHelper(Math.max(radius * 6, 0.6), Math.max(6, Math.round(radius * 60)), 0xd8d3cb, 0xeae6e0);
          const gridMaterial = grid.material as THREE.Material;
          gridMaterial.transparent = true;
          gridMaterial.opacity = 0.65;
          scene.add(grid);
        }

        const shadowCatcher = new THREE.Mesh(
          new THREE.PlaneGeometry(radius * 8, radius * 8),
          new THREE.ShadowMaterial({ opacity: 0.16 }),
        );
        shadowCatcher.rotation.x = -Math.PI / 2;
        shadowCatcher.receiveShadow = true;
        scene.add(shadowCatcher);

        // Enquadramento e limites de zoom derivados do tamanho real do objeto:
        // é isso que impede o usuário de "furar" o modelo ou perdê-lo de vista.
        const distance = radius / Math.tan((camera.fov * Math.PI) / 360) + radius * 0.9;
        camera.position.set(distance * 0.55, finalSizeMeters.y * 0.85 + radius * 0.45, distance * 0.85);
        controls.target.set(0, finalSizeMeters.y * 0.45, 0);
        controls.minDistance = radius * 0.9;
        controls.maxDistance = distance * 2.2;
        controls.autoRotate = autoRotate && !prefersReducedMotion;
        controls.autoRotateSpeed = 0.9;
        controls.update();

        key.shadow.camera.far = distance * 4;
        key.position.set(radius * 1.4, radius * 3.2, radius * 2.1);

        callbacks.current.onCalibrated?.(prepared.calibration);
        setState({ status: 'ready' });
        callbacks.current.onReady?.();
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const message =
          error instanceof ModelLoadError
            ? error.message
            : 'Não foi possível carregar o modelo 3D deste prato.';
        setState({ status: 'error', message });
        callbacks.current.onError?.(error instanceof Error ? error : new Error(message));
      });

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      environment.texture.dispose();
      pmrem.dispose();

      // Geometria e material vêm do cache compartilhado e não são liberados
      // aqui; quem faz isso é `clearModelCache`. O que criamos só para esta
      // cena (plano de sombra, grade) some junto com a cena.
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [modelUrl, dimensions, placement, showGrid, autoRotate]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={containerRef} className="h-full w-full" aria-hidden={state.status !== 'ready'} />

      {state.status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/70 backdrop-blur-[2px]">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-hairline">
            <div
              className="ember-rule h-full transition-[width] duration-200"
              style={{ width: `${Math.max(8, Math.round(state.progress * 100))}%` }}
            />
          </div>
          <p className="text-sm text-muted">Carregando modelo 3D…</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-display text-lg">Modelo indisponível</p>
          <p className="max-w-xs text-sm text-muted">{state.message}</p>
        </div>
      )}
    </div>
  );
}
