import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { detectARCapabilities } from './capabilities';
import { applyPinch, clamp, scalePercentage, type PhysicalDimensions, type ScaleCalibration } from './scale';
import { loadGltf, ModelLoadError, prepareModel, type ModelPlacementConfig } from '@/features/models3d/modelLoader';

/**
 * Sessão de AR imersiva sobre WebXR.
 *
 * O ciclo de vida é explícito porque cada etapa pode falhar de um jeito
 * diferente e o usuário precisa de uma saída em todas elas:
 *
 *   idle → checking → requesting → loading-model → scanning → placed
 *                          ↘ error / unsupported / denied
 *
 * Rastreamento de superfície usa a XRHitTestSource nativa: nada de simular
 * "chão" com uma altura fixa. Se o aparelho não fornece hit-test, a sessão nem
 * chega a ser pedida e a interface cai para o visualizador 3D.
 */

export type ARSessionStatus =
  | 'idle'
  | 'checking'
  | 'requesting'
  | 'loading-model'
  | 'scanning'
  | 'placed'
  | 'error';

export type ARSessionError = {
  kind: 'unsupported' | 'permission' | 'model' | 'session' | 'unknown';
  message: string;
  hint?: string;
};

export type ARSessionEvent =
  | { type: 'opened' }
  | { type: 'ready' }
  | { type: 'placed' }
  | { type: 'failed'; reason: string }
  | { type: 'exited' };

type UseARSessionOptions = {
  modelUrl: string;
  dimensions: PhysicalDimensions;
  placement?: ModelPlacementConfig;
  onEvent?: (event: ARSessionEvent) => void;
};

type XRHitTestSource = {
  cancel(): void;
};

type XRSessionLike = XRSession & {
  requestHitTestSource?(options: { space: XRSpace }): Promise<XRHitTestSource>;
};

const RETICLE_RADIUS = 0.09;

export function useARSession({ modelUrl, dimensions, placement, onEvent }: UseARSessionOptions) {
  const [status, setStatus] = useState<ARSessionStatus>('idle');
  const [error, setError] = useState<ARSessionError | null>(null);
  const [progress, setProgress] = useState(0);
  const [calibration, setCalibration] = useState<ScaleCalibration | null>(null);
  const [scalePercent, setScalePercent] = useState(100);
  const [surfaceFound, setSurfaceFound] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  /** Tudo que precisa ser desmontado quando a sessão termina. */
  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    reticle: THREE.Mesh;
    model: THREE.Group;
    calibration: ScaleCalibration;
    session: XRSessionLike;
    hitTestSource: XRHitTestSource | null;
    placed: boolean;
    currentScale: number;
    cleanup: (() => void)[];
  } | null>(null);

  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

  const teardown = useCallback(() => {
    const current = runtime.current;
    if (!current) return;
    runtime.current = null;

    for (const fn of current.cleanup) {
      try {
        fn();
      } catch {
        /* segue o desligamento mesmo se um listener já saiu */
      }
    }

    current.hitTestSource?.cancel();
    current.renderer.setAnimationLoop(null);
    current.scene.clear();
    current.renderer.dispose();
    current.renderer.domElement.remove();

    // A sessão XR mantém a câmera ligada; encerrá-la é o que desliga o hardware
    if (current.session.end) {
      void current.session.end().catch(() => undefined);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
    setSurfaceFound(false);
    emit.current?.({ type: 'exited' });
  }, [teardown]);

  /** Volta ao modo de varredura sem encerrar a sessão. */
  const reposition = useCallback(() => {
    const current = runtime.current;
    if (!current) return;
    current.placed = false;
    current.model.visible = false;
    current.reticle.visible = false;
    setStatus('scanning');
  }, []);

  const resetScale = useCallback(() => {
    const current = runtime.current;
    if (!current) return;
    current.currentScale = current.calibration.baseScale;
    current.model.scale.setScalar(1);
    setScalePercent(100);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('checking');
    emit.current?.({ type: 'opened' });

    const capabilities = await detectARCapabilities();
    if (!capabilities.immersiveAR) {
      const failure: ARSessionError = {
        kind: 'unsupported',
        message: 'Este aparelho não suporta a realidade aumentada imersiva.',
        ...(capabilities.reason ? { hint: capabilities.reason } : {}),
      };
      setError(failure);
      setStatus('error');
      emit.current?.({ type: 'failed', reason: failure.kind });
      return;
    }

    // Modelo primeiro: pedir a câmera e só então descobrir que o arquivo não
    // carrega seria a pior ordem possível para o usuário.
    setStatus('loading-model');
    let prepared;
    try {
      const loaded = await loadGltf(modelUrl, { onProgress: setProgress });
      prepared = prepareModel(loaded, dimensions, placement);
      setCalibration(prepared.calibration);
    } catch (loadError) {
      const failure: ARSessionError = {
        kind: 'model',
        message:
          loadError instanceof ModelLoadError
            ? loadError.message
            : 'Não foi possível carregar o modelo 3D deste prato.',
        hint: 'Você ainda pode ver as fotos e as dimensões do prato.',
      };
      setError(failure);
      setStatus('error');
      emit.current?.({ type: 'failed', reason: 'model' });
      return;
    }

    setStatus('requesting');

    const overlayRoot = overlayRef.current;
    let session: XRSessionLike;
    try {
      session = (await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: overlayRoot ? ['dom-overlay', 'light-estimation'] : ['light-estimation'],
        ...(overlayRoot ? { domOverlay: { root: overlayRoot } } : {}),
      })) as XRSessionLike;
    } catch (sessionError) {
      const denied =
        sessionError instanceof DOMException &&
        (sessionError.name === 'NotAllowedError' || sessionError.name === 'SecurityError');
      const failure: ARSessionError = denied
        ? {
            kind: 'permission',
            message: 'Precisamos da câmera para posicionar o prato na sua mesa.',
            hint: 'Toque no cadeado ao lado do endereço, libere a câmera e tente de novo.',
          }
        : {
            kind: 'session',
            message: 'Não foi possível iniciar a realidade aumentada agora.',
            hint: 'Feche outros aplicativos que estejam usando a câmera e tente novamente.',
          };
      setError(failure);
      setStatus('error');
      emit.current?.({ type: 'failed', reason: failure.kind });
      return;
    }

    // ----- cena -----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.xr.enabled = true;
    renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);


    // Mapa de ambiente: sem ele, `clearcoat` e `roughness` baixa não têm o que
    // refletir, e o prato chega na câmera fosco — que era metade do motivo de
    // a comida parecer massinha aqui, mesmo depois de os modelos melhorarem.
    // `RoomEnvironment` é gerado em memória: dá reflexo PBR crível sem baixar
    // um HDRI e sem custo de rede no meio da experiência.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = ambiente.texture;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.5, 2, 1);
    scene.add(sun);

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(RETICLE_RADIUS * 0.72, RETICLE_RADIUS, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff6b2c, transparent: true, opacity: 0.92 }),
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const model = prepared.object;
    model.visible = false;
    scene.add(model);

    await renderer.xr.setSession(session as unknown as XRSession);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    const localSpace = renderer.xr.getReferenceSpace();

    // `requestHitTestSource` só existe quando a feature foi concedida na sessão
    let hitTestSource: XRHitTestSource | null = null;
    const requestHitTestSource: ((options: { space: XRSpace }) => Promise<XRHitTestSource>) | undefined =
      session.requestHitTestSource?.bind(session);
    if (requestHitTestSource) {
      hitTestSource = await requestHitTestSource({ space: viewerSpace }).catch(() => null);
    }

    if (!hitTestSource) {
      setError({
        kind: 'session',
        message: 'Este aparelho não conseguiu detectar superfícies.',
        hint: 'Você pode ver o prato em 3D com as dimensões reais.',
      });
      setStatus('error');
      emit.current?.({ type: 'failed', reason: 'hit-test' });
      void session.end().catch(() => undefined);
      renderer.dispose();
      renderer.domElement.remove();
      return;
    }

    const cleanup: (() => void)[] = [];
    // O mapa de ambiente é uma textura de GPU: sem liberar, cada sessão de AR
    // deixa uma para trás.
    cleanup.push(() => {
      ambiente.dispose();
      pmrem.dispose();
    });

    runtime.current = {
      renderer,
      scene,
      camera,
      reticle,
      model,
      calibration: prepared.calibration,
      session,
      hitTestSource,
      placed: false,
      currentScale: prepared.calibration.baseScale,
      cleanup,
    };

    // ----- posicionamento -----
    const onSelect = () => {
      const current = runtime.current;
      if (!current || current.placed || !current.reticle.visible) return;

      current.model.position.setFromMatrixPosition(current.reticle.matrix);
      // Mantém o prato em pé: só herdamos a rotação em Y da superfície
      const surfaceRotation = new THREE.Quaternion().setFromRotationMatrix(current.reticle.matrix);
      const euler = new THREE.Euler().setFromQuaternion(surfaceRotation, 'YXZ');
      current.model.rotation.set(0, euler.y, 0);

      current.model.visible = true;
      current.reticle.visible = false;
      current.placed = true;
      setStatus('placed');
      emit.current?.({ type: 'placed' });
    };
    session.addEventListener('select', onSelect);
    cleanup.push(() => session.removeEventListener('select', onSelect));

    const onSessionEnd = () => {
      teardown();
      setStatus('idle');
      setSurfaceFound(false);
      emit.current?.({ type: 'exited' });
    };
    session.addEventListener('end', onSessionEnd);
    cleanup.push(() => session.removeEventListener('end', onSessionEnd));

    // ----- gestos sobre o overlay -----
    if (overlayRoot) {
      const pointers = new Map<number, { x: number; y: number }>();
      let pinchStartDistance = 0;
      let pinchStartScale = 1;
      let rotateStartX = 0;
      let rotateStartY = 0;

      const distanceBetween = () => {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return 0;
        return Math.hypot(a.x - b.x, a.y - b.y);
      };

      /** Toques nos controles não devem girar nem escalar o prato. */
      const isOnControl = (event: PointerEvent) =>
        event.target instanceof Element && event.target.closest('[data-ar-control]') !== null;

      const onPointerDown = (event: PointerEvent) => {
        if (isOnControl(event)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const current = runtime.current;
        if (!current?.placed) return;

        if (pointers.size === 1) {
          rotateStartX = event.clientX;
          rotateStartY = current.model.rotation.y;
        } else if (pointers.size === 2) {
          pinchStartDistance = distanceBetween();
          pinchStartScale = current.model.scale.x;
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        const current = runtime.current;
        if (!current?.placed) return;

        if (pointers.size === 1) {
          // Arrastar com um dedo gira o prato no eixo vertical
          current.model.rotation.y = rotateStartY + (event.clientX - rotateStartX) * 0.01;
        } else if (pointers.size === 2 && pinchStartDistance > 0) {
          const gesture = distanceBetween() / pinchStartDistance;
          const target = applyPinch(
            current.calibration.baseScale * pinchStartScale * gesture,
            1,
            current.calibration,
          );
          // model.scale é relativo à escala base já embutida no grupo preparado
          const relative = clamp(target / current.calibration.baseScale, 0.5, 2);
          current.model.scale.setScalar(relative);
          current.currentScale = current.calibration.baseScale * relative;
          setScalePercent(scalePercentage(current.currentScale, current.calibration.baseScale));
        }
      };

      const onPointerUp = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        pinchStartDistance = 0;
      };

      overlayRoot.addEventListener('pointerdown', onPointerDown);
      overlayRoot.addEventListener('pointermove', onPointerMove);
      overlayRoot.addEventListener('pointerup', onPointerUp);
      overlayRoot.addEventListener('pointercancel', onPointerUp);
      cleanup.push(() => {
        overlayRoot.removeEventListener('pointerdown', onPointerDown);
        overlayRoot.removeEventListener('pointermove', onPointerMove);
        overlayRoot.removeEventListener('pointerup', onPointerUp);
        overlayRoot.removeEventListener('pointercancel', onPointerUp);
      });
    }

    // ----- loop de render -----
    renderer.setAnimationLoop((_time, frame) => {
      const current = runtime.current;
      if (!current || !frame) return;

      if (!current.placed && localSpace && current.hitTestSource) {
        const results = frame.getHitTestResults(current.hitTestSource as unknown as globalThis.XRHitTestSource);
        const hit = results[0];
        if (hit) {
          const pose = hit.getPose(localSpace);
          if (pose) {
            current.reticle.visible = true;
            current.reticle.matrix.fromArray(pose.transform.matrix);
            setSurfaceFound(true);
          }
        } else {
          current.reticle.visible = false;
          setSurfaceFound(false);
        }
      }

      renderer.render(current.scene, current.camera);
    });

    setStatus('scanning');
    emit.current?.({ type: 'ready' });
  }, [modelUrl, dimensions, placement, teardown]);

  return {
    status,
    error,
    progress,
    calibration,
    scalePercent,
    surfaceFound,
    overlayRef,
    start,
    stop,
    reposition,
    resetScale,
    isActive: status === 'scanning' || status === 'placed',
  };
}
