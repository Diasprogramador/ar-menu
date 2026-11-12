import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { findTablePoint, TablePoseTracker } from './xrTable';
import { tableDistance } from './tableDistance';
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
 * "chão" com uma altura fixa. Se o aparelho não fornece hit-test, a sessão não
 * pode iniciar e a interface escolhe outro modo disponível.
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

const RETICLE_RADIUS = 0.09;

export function useARSession({ modelUrl, dimensions, placement, onEvent }: UseARSessionOptions) {
  const [status, setStatus] = useState<ARSessionStatus>('idle');
  const [error, setError] = useState<ARSessionError | null>(null);
  const [progress, setProgress] = useState(0);
  const [calibration, setCalibration] = useState<ScaleCalibration | null>(null);
  const [scalePercent, setScalePercent] = useState(100);
  const [surfaceFound, setSurfaceFound] = useState(false);
  const [distance, setDistance] = useState<ReturnType<typeof tableDistance>>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  /** Tudo que precisa ser desmontado quando a sessão termina. */
  const runtime = useRef<{
    reticle: THREE.Mesh;
    model: THREE.Group;
    calibration: ScaleCalibration;
    tracker: TablePoseTracker;
    anchorSlot: { anchor?: XRAnchor } | null;
    placed: boolean;
    currentScale: number;
  } | null>(null);

  const activeRun = useRef<(() => void)[] | null>(null);
  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

  const teardown = useCallback(() => {
    const cleanup = activeRun.current;
    activeRun.current = null;
    runtime.current = null;
    for (const dispose of cleanup?.reverse() ?? []) {
      try { dispose(); } catch { /* Native resources may already be inactive. */ }
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
    setSurfaceFound(false);
    setDistance(null);
    emit.current?.({ type: 'exited' });
  }, [teardown]);

  /** Volta ao modo de varredura sem encerrar a sessão. */
  const reposition = useCallback(() => {
    const current = runtime.current;
    if (!current) return;
    current.anchorSlot?.anchor?.delete();
    current.anchorSlot = null;
    current.tracker.reset();
    current.placed = false;
    current.model.visible = false;
    current.reticle.visible = false;
    setSurfaceFound(false);
    setDistance(null);
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
    // Keep the session request in the launch button's transient activation.
    // The synchronous guard also covers two taps before React updates the button.
    if (activeRun.current) return;
    const cleanup: (() => void)[] = [];
    activeRun.current = cleanup;
    const isCurrent = () => activeRun.current === cleanup;
    setError(null);
    setDistance(null);
    setSurfaceFound(false);
    setScalePercent(100);
    setCalibration(null);
    setProgress(0);
    setStatus('requesting');
    emit.current?.({ type: 'opened' });

    const overlayRoot = overlayRef.current;
    let stage: 'request' | 'setup' | 'model' = 'request';
    try {
      if (!navigator.xr) throw new DOMException('WebXR indisponível', 'NotSupportedError');
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: overlayRoot ? ['anchors', 'dom-overlay'] : ['anchors'],
        ...(overlayRoot ? { domOverlay: { root: overlayRoot } } : {}),
      });
      if (!isCurrent()) {
        void session.end().catch(() => undefined);
        return;
      }

      let ended = false;
      const onEnd = () => {
        ended = true;
        stop();
      };
      session.addEventListener('end', onEnd);
      cleanup.push(() => {
        session.removeEventListener('end', onEnd);
        if (!ended) void session.end().catch(() => undefined);
      });

      stage = 'setup';
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      cleanup.push(() => {
        renderer.setAnimationLoop(null);
        renderer.domElement.remove();
        renderer.dispose();
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.78;
      renderer.xr.enabled = true;
      // Local is gravity-aligned and available in immersive sessions. A table
      // measurement uses relative height, so it does not need a calibrated floor.
      renderer.xr.setReferenceSpaceType('local');
      renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
      document.body.appendChild(renderer.domElement);
      await renderer.xr.setSession(session);
      if (!isCurrent()) return;
      const localSpace = renderer.xr.getReferenceSpace();
      if (!localSpace) throw new Error('Referencial XR indisponível');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      if (!isCurrent()) return;
      const hitTestSource = await session.requestHitTestSource?.({ space: viewerSpace, entityTypes: ['plane'] });
      if (!hitTestSource) throw new Error('Hit-test indisponível');
      if (!isCurrent()) {
        hitTestSource.cancel();
        return;
      }
      cleanup.push(() => hitTestSource.cancel());

      stage = 'model';
      setStatus('loading-model');
      const loaded = await loadGltf(modelUrl, {
        onProgress: (ratio) => { if (isCurrent()) setProgress(ratio); },
      });
      if (!isCurrent()) return;
      const prepared = prepareModel(loaded, dimensions, placement);
      setCalibration(prepared.calibration);
      stage = 'setup';
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      try {
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        cleanup.push(() => environment.dispose());
      } finally {
        room.dispose();
        pmrem.dispose();
      }
      scene.environmentIntensity = 0.38;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 0.4));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(0.5, 2, 1);
      scene.add(sun);

      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(RETICLE_RADIUS * 0.72, RETICLE_RADIUS, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff6b2c, transparent: true, opacity: 0.92 }),
      );
      cleanup.push(() => {
        reticle.geometry.dispose();
        reticle.material.dispose();
      });
      reticle.visible = false;
      const model = prepared.object;
      model.visible = false;
      scene.add(reticle, model);

      const tracker = new TablePoseTracker();
      const current: NonNullable<typeof runtime.current> = {
        reticle, model, tracker, anchorSlot: null,
        calibration: prepared.calibration,
        placed: false,
        currentScale: prepared.calibration.baseScale,
      };
      runtime.current = current;
      cleanup.push(() => current.anchorSlot?.anchor?.delete());

      const onSelect = (event: XRInputSourceEvent) => {
        const point = tracker.confirmed(performance.now());
        if (current.placed || !reticle.visible || !point || session.visibilityState !== 'visible') return;
        model.position.set(point.x, point.y, point.z);
        model.visible = true;
        reticle.visible = false;
        current.placed = true;
        setStatus('placed');
        emit.current?.({ type: 'placed' });

        // Keep the local placement if the runtime cannot supply an anchor.
        if (event.frame.createAnchor && typeof XRRigidTransform !== 'undefined') {
          const slot: { anchor?: XRAnchor } = {};
          current.anchorSlot = slot;
          void event.frame.createAnchor(new XRRigidTransform({ x: point.x, y: point.y, z: point.z }), localSpace)
            .then((anchor) => {
              if (isCurrent() && current.anchorSlot === slot) slot.anchor = anchor;
              else anchor.delete();
            }).catch(() => undefined);
        }
      };
      session.addEventListener('select', onSelect);
      cleanup.push(() => session.removeEventListener('select', onSelect));
      localSpace.addEventListener('reset', reposition);
      cleanup.push(() => localSpace.removeEventListener('reset', reposition));
      const onVisibility = () => {
        tracker.reset();
        reticle.visible = false;
        setSurfaceFound(false);
        setDistance(null);
      };
      session.addEventListener('visibilitychange', onVisibility);
      cleanup.push(() => session.removeEventListener('visibilitychange', onVisibility));

      // ----- gestos sobre o overlay -----
      if (overlayRoot) {
        const suppressControlSelection = (event: Event) => {
          if (event.target instanceof Element && event.target.closest('[data-ar-control]')) event.preventDefault();
        };
        overlayRoot.addEventListener('beforexrselect', suppressControlSelection);
        cleanup.push(() => overlayRoot.removeEventListener('beforexrselect', suppressControlSelection));
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

      let nextReading = 0;
      renderer.setAnimationLoop((time, frame) => {
        if (!isCurrent() || !frame) return;
        const viewer = session.visibilityState === 'visible' ? frame.getViewerPose(localSpace) : null;
        if (!current.placed) {
          const point = viewer ? findTablePoint(viewer, frame.getHitTestResults(hitTestSource), localSpace) : null;
          const confirmed = tracker.update(point, time);
          reticle.visible = Boolean(confirmed);
          if (confirmed) reticle.position.set(confirmed.x, confirmed.y, confirmed.z);
          setSurfaceFound(reticle.visible);
        } else {
          const anchor = current.anchorSlot?.anchor;
          const pose = anchor && frame.getPose(anchor.anchorSpace, localSpace);
          model.visible = Boolean(viewer && !viewer.emulatedPosition && (!anchor || (pose && !pose.emulatedPosition)));
          if (model.visible && pose) model.position.copy(pose.transform.position);
        }

        if (!viewer || viewer.emulatedPosition || !(current.placed ? model.visible : reticle.visible)) {
          setDistance(null);
          nextReading = 0;
        } else if (time >= nextReading) {
          setDistance(tableDistance(viewer.transform.position, current.placed ? model.position : reticle.position));
          nextReading = time + 200;
        }
        renderer.render(scene, camera);
      });
      setStatus('scanning');
      emit.current?.({ type: 'ready' });
    } catch (cause) {
      if (!isCurrent()) return;
      teardown();
      const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : undefined;
      let failure: ARSessionError;
      if (stage === 'model') {
        failure = { kind: 'model', message: cause instanceof ModelLoadError ? cause.message : 'Falha ao carregar o modelo 3D.' };
      } else if (stage === 'request' && (name === 'NotAllowedError' || name === 'SecurityError')) {
        failure = { kind: 'permission', message: 'O navegador não autorizou a realidade aumentada.' };
      } else if (stage === 'request' && name === 'NotSupportedError') {
        failure = { kind: 'unsupported', message: 'Este aparelho não oferece o rastreamento de superfície necessário.' };
      } else {
        failure = { kind: 'session', message: 'Não foi possível iniciar o rastreamento de superfície.' };
      }
      setError(failure);
      setStatus('error');
      emit.current?.({ type: 'failed', reason: failure.kind });
    }
  }, [modelUrl, dimensions, placement, reposition, stop, teardown]);

  return {
    status,
    error,
    progress,
    calibration,
    scalePercent,
    surfaceFound,
    distance,
    overlayRef,
    start,
    stop,
    reposition,
    resetScale,
    isActive: status === 'scanning' || status === 'placed',
  };
}
