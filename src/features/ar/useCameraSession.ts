import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { applyPinch, clamp, scalePercentage, type PhysicalDimensions, type ScaleCalibration } from './scale';
import { calculateManualOrbit } from './manualOrbit';
import { trackMarker } from './trackMarker';
import { cameraVerticalFov, DEFAULT_FOCAL_RATIO, heightFromReference, tableDistance } from './tableDistance';
import { loadGltf, ModelLoadError, prepareModel, type ModelPlacementConfig } from '@/features/models3d/modelLoader';

/**
 * Realidade aumentada universal: câmera real, sem WebXR e sem instalar nada.
 *
 * O WebXR resolve bem, mas exige, no Android, os Serviços de RA do Google
 * instalados — e uma parte grande dos aparelhos não os tem. Como o produto
 * promete "escaneou o QR Code e vê na mesa", não pode depender disso.
 *
 * Este caminho usa só o que qualquer navegador com HTTPS oferece:
 *
 *   `getUserMedia`         a imagem da câmera traseira, como fundo;
 *   `deviceorientation`    a atitude do aparelho, para ancorar o prato;
 *   WebGL                  a renderização do modelo por cima.
 *
 * O que ele entrega e o que não entrega, dito com clareza:
 *
 *   O QR métrico define um referencial sobre a mesa para estimar posição e
 *   rotação pela imagem. Sem o marcador, os sensores acompanham a orientação
 *   disponível e a altura vem da régua ou do ajuste manual.
 *
 * Por isso ele fica abaixo do WebXR e do Quick Look na ordem de preferência:
 * onde existe rastreamento de verdade, usamos rastreamento de verdade.
 *
 * O modo monocular estima a distância com uma referência de 10 cm sobre a mesa
 * ou com a altura informada pelo cliente. O campo de visão é aproximado.
 */

export type CameraSessionStatus =
  | 'idle'
  | 'loading-model'
  | 'requesting-camera'
  | 'scanning'
  | 'placed'
  | 'error';

export type CameraSessionError = {
  kind: 'permission' | 'camera' | 'model' | 'insecure' | 'unknown';
  message: string;
  hint?: string;
};

type UseCameraSessionOptions = {
  modelUrl: string;
  dimensions: PhysicalDimensions;
  placement?: ModelPlacementConfig;
  onEvent?: (evento: 'opened' | 'ready' | 'placed' | 'failed' | 'exited', motivo?: CameraSessionError['kind']) => void;
};

/** Altura típica do celular sobre a mesa quando alguém olha um prato. */
const ALTURA_PADRAO_CM = 38;
const ALTURA_MINIMA_CM = 15;
const ALTURA_MAXIMA_CM = 120;
const MARKER_GRACE_MS = 950;

const eixoZ = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const quatTela = new THREE.Quaternion();
// -90° em X: converte o referencial do sensor, que aponta para cima, no
// referencial da câmera, que aponta para o horizonte.
const quatSensor = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

function aplicarOrientacao(
  destino: THREE.Quaternion,
  alfa: number,
  beta: number,
  gama: number,
  giroDaTela: number,
): void {
  euler.set(beta, alfa, -gama, 'YXZ');
  destino.setFromEuler(euler);
  destino.multiply(quatSensor);
  destino.multiply(quatTela.setFromAxisAngle(eixoZ, -giroDaTela));
}

export function useCameraSession({
  modelUrl,
  dimensions,
  placement,
  onEvent,
}: UseCameraSessionOptions) {
  const [status, setStatus] = useState<CameraSessionStatus>('idle');
  const [error, setError] = useState<CameraSessionError | null>(null);
  const [progress, setProgress] = useState(0);
  const [calibration, setCalibration] = useState<ScaleCalibration | null>(null);
  const [scalePercent, setScalePercent] = useState(100);
  const [alturaCm, setAlturaCm] = useState(ALTURA_PADRAO_CM);
  const [distance, setDistance] = useState<ReturnType<typeof tableDistance>>(null);
  const [heightKnown, setHeightKnown] = useState(false);
  const [referenceHint, setReferenceHint] = useState<string | null>(null);
  const reference = useRef<{ first: THREE.Vector3 | null } | null>(null);
  const [tracking, setTracking] = useState<'manual' | 'sensor' | 'marker' | 'lost' | 'texture' | 'texture-lost'>('manual');
  const generation = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    modelo: THREE.Group;
    marcador: THREE.Mesh;
    calibration: ScaleCalibration;
    stream: MediaStream;
    alturaMetros: number;
    colocado: boolean;
    markerSeenAt: number;
    markerDisabled: boolean;
    surfaceSeenAt: number;
    surfaceDepth: number;
    vision?: ReturnType<typeof trackMarker>;
    escalaRelativa: number;
    limpezas: (() => void)[];
    frameId: number;
  } | null>(null);

  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

  const teardown = useCallback(() => {
    generation.current++;
    const atual = runtime.current;
    if (!atual) return;
    runtime.current = null;

    for (const limpar of atual.limpezas) {
      try {
        limpar();
      } catch {
        /* segue o desligamento mesmo se um listener já saiu */
      }
    }

    cancelAnimationFrame(atual.frameId);
    atual.scene.clear();
    atual.renderer.dispose();
    atual.renderer.forceContextLoss();
    atual.renderer.domElement.remove();

    // Encerrar as trilhas é o que apaga a luz da câmera no aparelho
    for (const trilha of atual.stream.getTracks()) trilha.stop();
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
    emit.current?.('exited');
  }, [teardown]);

  const reposicionar = useCallback(() => {
    const atual = runtime.current;
    if (!atual) return;
    atual.colocado = false;
    atual.surfaceSeenAt = 0;
    atual.vision?.setAnchor(null);
    reference.current = null;
    setReferenceHint(null);
    setDistance(null);
    atual.modelo.visible = false;
    atual.marcador.visible = true;
    setStatus('scanning');
  }, []);

  const resetarEscala = useCallback(() => {
    const atual = runtime.current;
    if (!atual) return;
    atual.escalaRelativa = 1;
    atual.modelo.scale.setScalar(1);
    setScalePercent(100);
  }, []);

  /** Reposiciona o plano do chão quando o cliente ajusta a altura. */
  const ajustarAltura = useCallback((valorCm: number) => {
    const limitado = clamp(valorCm, ALTURA_MINIMA_CM, ALTURA_MAXIMA_CM);
    setAlturaCm(limitado);
    setHeightKnown(true);

    const atual = runtime.current;
    if (!atual) return;
    const newHeight = limitado / 100;
    // Conserva o pixel escolhido ao recalibrar a profundidade sobre o raio.
    const ratio = newHeight / atual.alturaMetros;
    atual.modelo.position.multiplyScalar(ratio);
    atual.camera.position.multiplyScalar(ratio);
    atual.surfaceDepth *= ratio;
    atual.alturaMetros = newHeight;
    if (atual.colocado) setDistance(tableDistance(atual.camera.position, atual.modelo.position));
    atual.marcador.position.y = -atual.alturaMetros;
  }, []);

  const switchToManual = useCallback(() => {
    const current = runtime.current;
    if (!current) return;
    current.markerSeenAt = 0;
    current.markerDisabled = true;
    current.camera.position.set(0, 0, 0);
    current.camera.rotation.set(-Math.PI / 6, 0, 0);
    setHeightKnown(false);
    setTracking('manual');
    reposicionar();
  }, [reposicionar]);

  const calibrateReference = useCallback(() => {
    switchToManual();
    reference.current = { first: null };
    setReferenceHint('Mantenha o celular paralelo à mesa. Toque no zero de uma régua apoiada nela.');
  }, [switchToManual]);

  const start = useCallback(async () => {
    teardown();
    const ticket = generation.current;
    setTracking('manual');
    setHeightKnown(false);
    setScalePercent(100);
    setError(null);
    reference.current = null;
    setReferenceHint(null);
    setDistance(null);
    emit.current?.('opened');

    if (!window.isSecureContext) {
      setError({
        kind: 'insecure',
        message: 'A câmera só abre em conexão segura.',
        hint: 'Acesse o cardápio por um endereço https.',
      });
      setStatus('error');
      emit.current?.('failed', 'insecure');
      return;
    }

    // Safari requires the sensor permission call in the original tap handler.
    const orientation = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    }) | undefined;
    void orientation?.requestPermission?.().catch(() => undefined);
    // Modelo primeiro: pedir a câmera e só então descobrir que o arquivo não
    // carrega seria a pior ordem possível para o cliente.
    setStatus('loading-model');
    let preparado;
    try {
      const carregado = await loadGltf(modelUrl, { onProgress: setProgress });
      if (ticket !== generation.current) return;
      preparado = prepareModel(carregado, dimensions, placement);
      setCalibration(preparado.calibration);
    } catch (falha) {
      if (ticket !== generation.current) return;
      setError({
        kind: 'model',
        message:
          falha instanceof ModelLoadError
            ? falha.message
            : 'Não foi possível carregar o modelo 3D deste prato.',
        hint: 'Você ainda pode ver as fotos e as dimensões do prato.',
      });
      setStatus('error');
      emit.current?.('failed', 'model');
      return;
    }

    setStatus('requesting-camera');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (falha) {
      if (ticket !== generation.current) return;
      const negado =
        falha instanceof DOMException &&
        (falha.name === 'NotAllowedError' || falha.name === 'SecurityError');
      setError(
        negado
          ? {
              kind: 'permission',
              message: 'Precisamos da câmera para mostrar o prato na sua mesa.',
              hint: 'Toque no cadeado ao lado do endereço, libere a câmera e tente de novo.',
            }
          : {
              kind: 'camera',
              message: 'Não foi possível abrir a câmera deste aparelho.',
              hint: 'Feche outros aplicativos que estejam usando a câmera e tente novamente.',
            },
      );
      setStatus('error');
      emit.current?.('failed', negado ? 'permission' : 'camera');
      return;
    }

    if (ticket !== generation.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const video = videoRef.current;
    const host = canvasHostRef.current;
    if (!video || !host) {
      for (const trilha of stream.getTracks()) trilha.stop();
      setError({ kind: 'unknown', message: 'A tela da câmera não pôde ser montada.' });
      setStatus('error');
      emit.current?.('failed', 'unknown');
      return;
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    let renderer: THREE.WebGLRenderer;
    try {
      await video.play();
      if (ticket !== generation.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      stream.getTracks().forEach(track => track.stop());
      if (ticket !== generation.current) return;
      setError({ kind: 'camera', message: 'O navegador interrompeu a câmera. Tente abrir o cardápio diretamente no navegador.' });
      setStatus('error');
      emit.current?.('failed', 'camera');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // O campo de visão vertical vem do horizontal e da proporção da tela: é o
    // que faz um prato de 12 cm ocupar na tela os pixels que ocuparia de fato.
    const proporcao = window.innerWidth / window.innerHeight;
    let focalRatio = DEFAULT_FOCAL_RATIO;
    const fovVertical = () => cameraVerticalFov(video.videoWidth || window.innerWidth,
      video.videoHeight || window.innerHeight, window.innerWidth, window.innerHeight, focalRatio);
    const camera = new THREE.PerspectiveCamera(
      fovVertical(),
      proporcao,
      0.01,
      30,
    );
    // Posição inicial utilizável mesmo sem giroscópio: a câmera olha 30° para
    // baixo e o raio encontra o plano da mesa. Quando há sensor, a primeira
    // leitura substitui esta orientação antes do posicionamento.
    camera.rotation.x = -Math.PI / 6;


    // Mapa de ambiente: sem ele, `clearcoat` e `roughness` baixa não têm o que
    // refletir, e o prato chega na câmera fosco — que era metade do motivo de
    // a comida parecer massinha aqui, mesmo depois de os modelos melhorarem.
    // `RoomEnvironment` é gerado em memória: dá reflexo PBR crível sem baixar
    // um HDRI e sem custo de rede no meio da experiência.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const ambiente = pmrem.fromScene(room, 0.04);
    room.dispose();
    scene.environment = ambiente.texture;
    scene.environmentIntensity = 0.38;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 0.4));
    const sol = new THREE.DirectionalLight(0xfff1e0, 1.55);
    sol.position.set(0.7, 1.6, 0.9);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    scene.add(sol);
    scene.add(sol.target);
    sol.shadow.camera.left = sol.shadow.camera.bottom = -0.35;
    sol.shadow.camera.right = sol.shadow.camera.top = 0.35;
    sol.shadow.camera.updateProjectionMatrix();
    sol.shadow.normalBias = 0.0006;

    const alturaMetros = alturaCm / 100;

    // Retículo: mostra onde o prato vai encostar antes do toque
    const marcador = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.075, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff6b2c, transparent: true, opacity: 0.9 }),
    );
    marcador.position.y = -alturaMetros;
    scene.add(marcador);

    const modelo = preparado.object;
    modelo.visible = false;
    modelo.position.y = -alturaMetros;
    modelo.traverse((no) => {
      const malha = no as THREE.Mesh;
      if (malha.isMesh) malha.castShadow = true;
    });
    scene.add(modelo);

    // Plano invisível que recebe a sombra: é o que assenta o prato na mesa
    const sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = -alturaMetros;
    sombra.receiveShadow = true;
    scene.add(sombra);

    const limpezas: (() => void)[] = [];
    // O mapa de ambiente é uma textura de GPU: sem liberar, cada abertura da
    // câmera deixa uma para trás.
    limpezas.push(() => {
      ambiente.dispose();
      pmrem.dispose();
      marcador.geometry.dispose();
      marcador.material.dispose();
      sombra.geometry.dispose();
      sombra.material.dispose();
      sol.shadow.dispose();
      video.srcObject = null;
    });

    runtime.current = {
      renderer,
      scene,
      camera,
      modelo,
      marcador,
      calibration: preparado.calibration,
      stream,
      alturaMetros,
      colocado: false,
      markerSeenAt: 0,
      markerDisabled: false,
      surfaceSeenAt: 0,
      surfaceDepth: 0,
      escalaRelativa: 1,
      limpezas,
      frameId: 0,
    };

    let sensorEstablished = false;
    const measuredOrientation = new THREE.Quaternion();
    const yawCorrection = new THREE.Quaternion();
    const aoGirar = (evento: DeviceOrientationEvent) => {
      const atual = runtime.current;
      if (!atual || atual.markerSeenAt || reference.current || evento.beta === null || evento.gamma === null) return;

      const giroDaTela = THREE.MathUtils.degToRad(
        screen.orientation?.angle ?? (window as Window & {orientation?: number}).orientation ?? 0,
      );
      aplicarOrientacao(
        measuredOrientation,
        THREE.MathUtils.degToRad(evento.alpha ?? 0),
        THREE.MathUtils.degToRad(evento.beta),
        THREE.MathUtils.degToRad(evento.gamma),
        giroDaTela,
      );
      if (!sensorEstablished) {
        // The first compass sample may arrive after the customer has placed the dish.
        const heading = new THREE.Euler().setFromQuaternion(measuredOrientation, 'YXZ').y;
        yawCorrection.setFromAxisAngle(new THREE.Vector3(0,1,0), -heading);
        sensorEstablished = true;
      }
      atual.camera.quaternion.copy(yawCorrection).multiply(measuredOrientation);
      if (!atual.surfaceSeenAt) setTracking('sensor');
    };

    window.addEventListener('deviceorientation', aoGirar, true);
    limpezas.push(() => window.removeEventListener('deviceorientation', aoGirar, true));
    let lastAcquisition = 0;
    let lastMeasurement = 0;
    const vision = trackMarker(video, pose => {
      const current = runtime.current;
      if (!current || current.markerDisabled || reference.current) return;
      const now = performance.now();
      // Confirm a new acquisition with a second decode before switching frames.
      const fresh = now - lastAcquisition < 1400 && lastAcquisition > 0;
      lastAcquisition = now;
      if (!fresh) return;
      const first = !current.markerSeenAt;
      const relocalized = now - current.markerSeenAt > MARKER_GRACE_MS;
      current.markerSeenAt = now;
      if (focalRatio !== pose.focalRatio) {
        focalRatio = pose.focalRatio;
        current.camera.fov = fovVertical();
        current.camera.updateProjectionMatrix();
      }
      pose.position.y -= current.alturaMetros;
      const gain = first || relocalized ? 1 : 0.8;
      current.camera.position.lerp(pose.position, gain);
      current.camera.quaternion.slerp(pose.rotation, gain);
      if (first) {
        current.vision?.setAnchor(null);
        current.surfaceSeenAt = 0;
        current.modelo.position.set(0, -current.alturaMetros, 0);
        current.modelo.rotation.set(0, 0, 0);
      }
      current.modelo.visible = current.colocado;
      setTracking('marker');
      setHeightKnown(true);
      if (now - lastMeasurement > 240 || first) {
        const target = current.colocado ? current.modelo.position : new THREE.Vector3(0, -current.alturaMetros, 0);
        setDistance(tableDistance(current.camera.position, target));
        lastMeasurement = now;
      }
    }, (motion, width, height) => {
      const current = runtime.current;
      if (!current?.colocado || current.markerSeenAt || !current.surfaceDepth) return;
      const f = Math.max(width,height) * focalRatio;
      const depth = current.surfaceDepth / motion.scale;
      // Follow the observed table detail in the real frame. Use the sensor for
      // tilt when available and the relative image scale for short translations.
      const offset = new THREE.Vector3((motion.x-.5)*width/f, (.5-motion.y)*height/f, -1)
        .multiplyScalar(depth).applyQuaternion(current.camera.quaternion);
      const position = current.modelo.position.clone().sub(offset);
      if (position.y <= -current.alturaMetros+.04) return;
      current.camera.position.copy(position);
      current.surfaceSeenAt = performance.now();
      current.modelo.visible = true;
      setTracking('texture');
      if (current.surfaceSeenAt - lastMeasurement > 240) {
        setDistance(tableDistance(position,current.modelo.position));
        lastMeasurement = current.surfaceSeenAt;
      }
    }, brightness => {
      const exposure = .57 + brightness * .45;
      renderer.toneMappingExposure += .12 * (exposure - renderer.toneMappingExposure);
    });
    runtime.current.vision = vision;
    limpezas.push(vision.stop);

    const aoRedimensionar = () => {
      const atual = runtime.current;
      if (!atual) return;
      const novaProporcao = window.innerWidth / window.innerHeight;
      atual.camera.aspect = novaProporcao;
      atual.camera.fov = fovVertical();
      atual.camera.updateProjectionMatrix();
      atual.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', aoRedimensionar);
    video.addEventListener('resize', aoRedimensionar);
    limpezas.push(() => video.removeEventListener('resize', aoRedimensionar));
    limpezas.push(() => window.removeEventListener('resize', aoRedimensionar));

    // ---- toque ----
    const raio = new THREE.Raycaster();
    const ponteiro = new THREE.Vector2();
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), alturaMetros);
    const alvo = new THREE.Vector3();

    /** Onde o raio que sai da tela encontra o plano da mesa. */
    const projetarNoPlano = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const atual = runtime.current;
      if (!atual) return null;
      atual.camera.updateMatrixWorld();
      ponteiro.x = (clientX / window.innerWidth) * 2 - 1;
      ponteiro.y = -(clientY / window.innerHeight) * 2 + 1;
      raio.setFromCamera(ponteiro, atual.camera);
      plano.constant = atual.alturaMetros;
      return raio.ray.intersectPlane(plano, alvo) ? alvo.clone() : null;
    };

    // A camada HTML de instruções fica acima do canvas. Escutar o contêiner
    // comum permite receber esses toques por bubbling, preservando os controles.
    const superficie = host.parentElement ?? host;
    const ponteiros = new Map<number, { x: number; y: number }>();
    let distanciaInicial = 0;
    let escalaInicial = 1;
    let arrastou = false;
    let inicioX = 0;
    let inicioY = 0;
    let rotacaoInicialX = 0;
    let rotacaoInicialY = 0;

    const touchActionAnterior = superficie.style.touchAction;
    superficie.style.touchAction = 'none';

    const distanciaEntre = () => {
      const [a, b] = [...ponteiros.values()];
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const aoPressionar = (evento: PointerEvent) => {
      if (evento.target instanceof Element && evento.target.closest('[data-ar-control]')) return;
      ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
      arrastou = false;
      try {
        superficie.setPointerCapture?.(evento.pointerId);
      } catch {
        // Eventos sintetizados e alguns WebViews não registram o ponteiro no
        // subsistema nativo; os listeners no contêiner ainda funcionam.
      }
      const atual = runtime.current;
      if (ponteiros.size === 1 && atual?.colocado) {
        inicioX = evento.clientX;
        inicioY = evento.clientY;
        rotacaoInicialX = atual.modelo.rotation.x;
        rotacaoInicialY = atual.modelo.rotation.y;
      }
      if (ponteiros.size === 2) {
        distanciaInicial = distanciaEntre();
        escalaInicial = runtime.current?.escalaRelativa ?? 1;
      }
    };

    const aoMover = (evento: PointerEvent) => {
      if (!ponteiros.has(evento.pointerId)) return;
      ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
      const atual = runtime.current;
      if (!atual) return;

      if (ponteiros.size === 1 && atual.colocado) {
        const deltaX = evento.clientX - inicioX;
        const deltaY = evento.clientY - inicioY;
        if (Math.hypot(deltaX, deltaY) < 3) return;
        arrastou = true;
        const orbit = calculateManualOrbit({
          startYaw: rotacaoInicialY,
          startPitch: rotacaoInicialX,
          deltaX,
          deltaY,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
        atual.modelo.rotation.set(atual.markerSeenAt || atual.surfaceSeenAt ? 0 : orbit.pitch, orbit.yaw, 0);
      } else if (ponteiros.size === 2 && distanciaInicial > 0) {
        arrastou = true;
        const gesto = distanciaEntre() / distanciaInicial;
        const alvoAbsoluto = applyPinch(
          atual.calibration.baseScale * escalaInicial * gesto,
          1,
          atual.calibration,
        );
        const relativa = clamp(alvoAbsoluto / atual.calibration.baseScale, 0.5, 2);
        atual.escalaRelativa = relativa;
        atual.modelo.scale.setScalar(relativa);
        setScalePercent(scalePercentage(atual.calibration.baseScale * relativa, atual.calibration.baseScale));
      }
    };

    const aoSoltar = (evento: PointerEvent) => {
      const eraUnico = ponteiros.size === 1;
      ponteiros.delete(evento.pointerId);
      try {
        superficie.releasePointerCapture?.(evento.pointerId);
      } catch {
        /* o ponteiro pode já ter sido liberado pelo navegador */
      }
      distanciaInicial = 0;

      const atual = runtime.current;
      if (!atual || arrastou || !eraUnico) return;
      if (atual.markerSeenAt && performance.now() - atual.markerSeenAt > MARKER_GRACE_MS) return;

      // Toque sem arrasto: posiciona ou reposiciona o prato
      if (reference.current) {
        // Ambos os toques usam o mesmo ângulo conhecido, inclusive sem giroscópio.
        atual.camera.rotation.set(-Math.PI / 2, 0, 0);
      }
      const ponto = projetarNoPlano(evento.clientX, evento.clientY);
      if (!ponto) return;
      if (reference.current) {
        if (!reference.current.first) {
          reference.current.first = ponto;
          setReferenceHint('Sem mover o celular, toque na marca de 10 cm.');
        } else {
          const height = heightFromReference(reference.current.first, ponto, atual.alturaMetros * 100);
          if (height === null) {
            reference.current.first = null;
            setReferenceHint('Confira as marcas e toque novamente no zero da régua.');
          } else {
            ajustarAltura(height);
            reference.current = null;
            setReferenceHint('Altura estimada. Mantenha o celular nessa altura e toque onde deseja o prato.');
          }
        }
        return;
      }

      atual.modelo.position.set(ponto.x, -atual.alturaMetros, ponto.z);
      if (!atual.markerSeenAt && video.videoWidth > 0 && video.videoHeight > 0) {
        const rect = video.getBoundingClientRect();
        const cover = Math.max(rect.width/video.videoWidth, rect.height/video.videoHeight);
        const x = .5 + (evento.clientX-rect.left-rect.width/2)/(video.videoWidth*cover);
        const y = .5 + (evento.clientY-rect.top-rect.height/2)/(video.videoHeight*cover);
        atual.surfaceDepth = -atual.camera.worldToLocal(ponto.clone()).z;
        atual.surfaceSeenAt = 0;
        setTracking(sensorEstablished ? 'sensor' : 'manual');
        vision.setAnchor({x,y});
      }
      atual.modelo.visible = true;
      setReferenceHint(null);
      setDistance(tableDistance(atual.camera.position, ponto));
      atual.marcador.visible = false;
      if (!atual.colocado) {
        atual.colocado = true;
        setStatus('placed');
        emit.current?.('placed');
      }
    };

    superficie.addEventListener('pointerdown', aoPressionar);
    superficie.addEventListener('pointermove', aoMover);
    superficie.addEventListener('pointerup', aoSoltar);
    const aoCancelar = (evento: PointerEvent) => {
      ponteiros.delete(evento.pointerId);
      arrastou = true;
      distanciaInicial = 0;
    };
    superficie.addEventListener('pointercancel', aoCancelar);
    const aoRolar = (evento: WheelEvent) => {
      const atual = runtime.current;
      if (!atual?.colocado) return;
      evento.preventDefault();
      const relativa = clamp(atual.escalaRelativa * Math.exp(-evento.deltaY * 0.0015), 0.5, 2);
      atual.escalaRelativa = relativa;
      atual.modelo.scale.setScalar(relativa);
      setScalePercent(scalePercentage(atual.calibration.baseScale * relativa, atual.calibration.baseScale));
    };
    superficie.addEventListener('wheel', aoRolar, { passive: false });
    limpezas.push(() => {
      superficie.style.touchAction = touchActionAnterior;
      superficie.removeEventListener('pointerdown', aoPressionar);
      superficie.removeEventListener('pointermove', aoMover);
      superficie.removeEventListener('pointerup', aoSoltar);
      superficie.removeEventListener('pointercancel', aoCancelar);
      superficie.removeEventListener('wheel', aoRolar);
    });

    // ---- laço de render ----
    const desenhar = () => {
      const atual = runtime.current;
      if (!atual) return;
      atual.frameId = requestAnimationFrame(desenhar);
      const lost = atual.markerSeenAt > 0 && performance.now() - atual.markerSeenAt > MARKER_GRACE_MS;
      if (lost) {
        atual.modelo.visible = false;
        setTracking('lost');
        setDistance(null);
      } else if (atual.surfaceSeenAt && performance.now() - atual.surfaceSeenAt > 650) {
        atual.modelo.visible = false;
        setTracking('texture-lost');
        setDistance(null);
      }

      if (lost) {
        atual.marcador.visible = false;
      } else if (!atual.colocado) {
        // O retículo acompanha o centro da tela enquanto o cliente procura o lugar
        const centro = projetarNoPlano(window.innerWidth / 2, window.innerHeight / 2);
        if (centro) {
          atual.marcador.position.set(centro.x, -atual.alturaMetros, centro.z);
          atual.marcador.visible = true;
        } else {
          atual.marcador.visible = false;
        }
      }

      sol.position.set(
        atual.modelo.position.x + 0.4,
        -atual.alturaMetros + 1.2,
        atual.modelo.position.z + 0.5,
      );
      sombra.position.set(atual.modelo.position.x, -atual.alturaMetros, atual.modelo.position.z);
      sombra.visible = atual.modelo.visible;
      sol.target.position.copy(sombra.position);

      atual.renderer.render(atual.scene, atual.camera);
    };
    desenhar();

    setStatus('scanning');
    emit.current?.('ready');
  }, [modelUrl, dimensions, placement, alturaCm, ajustarAltura, teardown]);

  return {
    status,
    error,
    progress,
    calibration,
    scalePercent,
    alturaCm,
    heightKnown,
    tracking,
    switchToManual,
    distance,
    referenceHint,
    calibrateReference,
    videoRef,
    canvasHostRef,
    start,
    stop,
    reposicionar,
    resetarEscala,
    ajustarAltura,
    ativo: status === 'scanning' || status === 'placed',
    limites: { minCm: ALTURA_MINIMA_CM, maxCm: ALTURA_MAXIMA_CM },
  };
}
