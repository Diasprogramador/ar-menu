import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { applyPinch, clamp, scalePercentage, type PhysicalDimensions, type ScaleCalibration } from './scale';
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
 *   entrega   o prato apoiado numa superfície, no tamanho físico correto, que
 *             fica parado no lugar enquanto a pessoa gira o celular;
 *   não       rastreamento de translação. Andar em volta da mesa faz o prato
 *             derivar, porque sem SLAM não há como saber que o aparelho se
 *             deslocou. Girar no lugar funciona; caminhar, não.
 *
 * Por isso ele fica abaixo do WebXR e do Quick Look na ordem de preferência:
 * onde existe rastreamento de verdade, usamos rastreamento de verdade.
 *
 * A escala é real, e não estimada: sabendo o campo de visão da câmera e a
 * distância até o plano, o tamanho em pixels de um objeto de dimensão física
 * conhecida é determinado. A única incógnita é a altura do aparelho sobre a
 * mesa, que o cliente ajusta uma vez num controle deslizante.
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

/**
 * Campo de visão horizontal aproximado da câmera traseira.
 *
 * O navegador não expõe a distância focal, e os valores reais ficam entre 60°
 * e 70° na grande maioria dos aparelhos. O erro que sobra é absorvido pelo
 * ajuste de altura, que o cliente faz olhando para a própria mesa.
 */
const FOV_HORIZONTAL_GRAUS = 66;

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
  const [temGiroscopio, setTemGiroscopio] = useState(false);

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
    escalaRelativa: number;
    limpezas: (() => void)[];
    frameId: number;
  } | null>(null);

  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

  const teardown = useCallback(() => {
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

    const atual = runtime.current;
    if (!atual) return;
    atual.alturaMetros = limitado / 100;
    atual.modelo.position.y = -atual.alturaMetros;
    atual.marcador.position.y = -atual.alturaMetros;
  }, []);

  const start = useCallback(async () => {
    setError(null);
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

    // Modelo primeiro: pedir a câmera e só então descobrir que o arquivo não
    // carrega seria a pior ordem possível para o cliente.
    setStatus('loading-model');
    let preparado;
    try {
      const carregado = await loadGltf(modelUrl, { onProgress: setProgress });
      preparado = prepareModel(carregado, dimensions, placement);
      setCalibration(preparado.calibration);
    } catch (falha) {
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
    await video.play().catch(() => undefined);

    // ---- cena ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // O campo de visão vertical vem do horizontal e da proporção da tela: é o
    // que faz um prato de 12 cm ocupar na tela os pixels que ocuparia de fato.
    const proporcao = window.innerWidth / window.innerHeight;
    const fovHorizontal = THREE.MathUtils.degToRad(FOV_HORIZONTAL_GRAUS);
    const fovVertical = 2 * Math.atan(Math.tan(fovHorizontal / 2) / proporcao);
    const camera = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(fovVertical),
      proporcao,
      0.01,
      30,
    );

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.5));
    const sol = new THREE.DirectionalLight(0xfff1e0, 2.2);
    sol.position.set(0.7, 1.6, 0.9);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    scene.add(sol);

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
      escalaRelativa: 1,
      limpezas,
      frameId: 0,
    };

    // ---- orientação do aparelho ----
    // No iOS a permissão de sensor é pedida à parte, e só dentro de um gesto.
    type OrientacaoComPermissao = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };
    const OrientacaoEvento = window.DeviceOrientationEvent as OrientacaoComPermissao | undefined;

    if (OrientacaoEvento?.requestPermission) {
      try {
        await OrientacaoEvento.requestPermission();
      } catch {
        // Sem sensor o prato ainda aparece; apenas não acompanha o giro
      }
    }

    const aoGirar = (evento: DeviceOrientationEvent) => {
      const atual = runtime.current;
      if (!atual || evento.alpha === null || evento.beta === null || evento.gamma === null) return;

      setTemGiroscopio(true);
      const giroDaTela = THREE.MathUtils.degToRad(
        (screen.orientation?.angle ?? 0) as number,
      );
      aplicarOrientacao(
        atual.camera.quaternion,
        THREE.MathUtils.degToRad(evento.alpha),
        THREE.MathUtils.degToRad(evento.beta),
        THREE.MathUtils.degToRad(evento.gamma),
        giroDaTela,
      );
    };

    window.addEventListener('deviceorientation', aoGirar, true);
    limpezas.push(() => window.removeEventListener('deviceorientation', aoGirar, true));

    const aoRedimensionar = () => {
      const atual = runtime.current;
      if (!atual) return;
      const novaProporcao = window.innerWidth / window.innerHeight;
      atual.camera.aspect = novaProporcao;
      atual.camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(fovHorizontal / 2) / novaProporcao),
      );
      atual.camera.updateProjectionMatrix();
      atual.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', aoRedimensionar);
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
      ponteiro.x = (clientX / window.innerWidth) * 2 - 1;
      ponteiro.y = -(clientY / window.innerHeight) * 2 + 1;
      raio.setFromCamera(ponteiro, atual.camera);
      plano.constant = atual.alturaMetros;
      return raio.ray.intersectPlane(plano, alvo) ? alvo.clone() : null;
    };

    const superficie = renderer.domElement;
    const ponteiros = new Map<number, { x: number; y: number }>();
    let distanciaInicial = 0;
    let escalaInicial = 1;
    let arrastou = false;

    const distanciaEntre = () => {
      const [a, b] = [...ponteiros.values()];
      if (!a || !b) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const aoPressionar = (evento: PointerEvent) => {
      if (evento.target instanceof Element && evento.target.closest('[data-ar-control]')) return;
      ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
      arrastou = false;
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
        arrastou = true;
        const ponto = projetarNoPlano(evento.clientX, evento.clientY);
        if (ponto) atual.modelo.position.set(ponto.x, -atual.alturaMetros, ponto.z);
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
      distanciaInicial = 0;

      const atual = runtime.current;
      if (!atual || arrastou || !eraUnico) return;

      // Toque sem arrasto: posiciona ou reposiciona o prato
      const ponto = projetarNoPlano(evento.clientX, evento.clientY);
      if (!ponto) return;

      atual.modelo.position.set(ponto.x, -atual.alturaMetros, ponto.z);
      atual.modelo.visible = true;
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
    superficie.addEventListener('pointercancel', aoSoltar);
    limpezas.push(() => {
      superficie.removeEventListener('pointerdown', aoPressionar);
      superficie.removeEventListener('pointermove', aoMover);
      superficie.removeEventListener('pointerup', aoSoltar);
      superficie.removeEventListener('pointercancel', aoSoltar);
    });

    // ---- laço de render ----
    const desenhar = () => {
      const atual = runtime.current;
      if (!atual) return;
      atual.frameId = requestAnimationFrame(desenhar);

      if (!atual.colocado) {
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

      atual.renderer.render(atual.scene, atual.camera);
    };
    desenhar();

    setStatus('scanning');
    emit.current?.('ready');
  }, [modelUrl, dimensions, placement, alturaCm]);

  return {
    status,
    error,
    progress,
    calibration,
    scalePercent,
    alturaCm,
    temGiroscopio,
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
