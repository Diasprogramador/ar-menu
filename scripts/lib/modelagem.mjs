/**
 * Ferramentas de geometria procedural de comida.
 *
 * Este módulo cuida da **forma**; quem cuida da aparência é `acabamento.mjs`,
 * com a paleta, a tabela de brilhos e a ondulação de silhueta.
 *
 * O que sobrou aqui:
 *
 *   `ruido`/`fbm`  ruído de valor determinístico — o mesmo modelo sai idêntico
 *                  em toda execução, o que mantém o repositório reproduzível;
 *   `deformar`     desloca vértices ao longo da normal, usado só onde a
 *                  irregularidade é a identidade da comida (farinha de rosca,
 *                  crouton). Espalhado por tudo, era o que dava o aspecto de
 *                  massinha amassada;
 *   `pintar`       grava cor por vértice, que os dois exportadores preservam
 *                  (COLOR_0 no glTF, primvars:displayColor no USD);
 *   `girar`/`disco` sólidos de revolução, a base de quase todo prato.
 *
 * A cor por vértice é sempre um **multiplicador** em torno de 1,0, e nunca a
 * cor final. O tom base vive em `material.color`. Assim, se algum visualizador
 * descartar a cor por vértice, o prato fica liso — mas continua da cor certa,
 * em vez de branco.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* -------------------------------------------------------------------------
 * Ruído determinístico
 * ---------------------------------------------------------------------- */

function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const suavizar = (t) => t * t * (3 - 2 * t);

/** Ruído de valor 3D em [0, 1], contínuo e reprodutível. */
export function ruido(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = suavizar(x - xi);
  const yf = suavizar(y - yi);
  const zf = suavizar(z - zi);

  const mistura = (a, b, t) => a + (b - a) * t;

  const c000 = hash(xi, yi, zi);
  const c100 = hash(xi + 1, yi, zi);
  const c010 = hash(xi, yi + 1, zi);
  const c110 = hash(xi + 1, yi + 1, zi);
  const c001 = hash(xi, yi, zi + 1);
  const c101 = hash(xi + 1, yi, zi + 1);
  const c011 = hash(xi, yi + 1, zi + 1);
  const c111 = hash(xi + 1, yi + 1, zi + 1);

  return mistura(
    mistura(mistura(c000, c100, xf), mistura(c010, c110, xf), yf),
    mistura(mistura(c001, c101, xf), mistura(c011, c111, xf), yf),
    zf,
  );
}

/** Ruído fractal: várias oitavas, para superfície com detalhe grosso e fino. */
export function fbm(x, y, z, oitavas = 3) {
  let valor = 0;
  let amplitude = 0.5;
  let frequencia = 1;
  let total = 0;

  for (let i = 0; i < oitavas; i += 1) {
    valor += ruido(x * frequencia, y * frequencia, z * frequencia) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequencia *= 2.1;
  }
  return valor / total;
}

/* -------------------------------------------------------------------------
 * Deformação
 * ---------------------------------------------------------------------- */

/**
 * Empurra cada vértice ao longo da própria normal, na medida do ruído.
 *
 * `amplitude` é em metros — as mesmas unidades da cena.
 *
 * Use com parcimônia. Aplicado a uma superfície que deveria ser lisa, este é o
 * efeito que transforma comida em massinha de modelar: a aresta some, a
 * silhueta ondula sem motivo e a peça perde a leitura. Vale só quando o
 * irregular é a identidade do alimento — empanado, crouton, casca rachada.
 */
export function deformar(geometry, { amplitude = 0.002, frequencia = 40, oitavas = 3, semente = 0 } = {}) {
  geometry.computeVertexNormals();
  const posicoes = geometry.attributes.position;
  const normais = geometry.attributes.normal;

  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const y = posicoes.getY(i);
    const z = posicoes.getZ(i);

    const n = fbm(x * frequencia + semente, y * frequencia + semente, z * frequencia + semente, oitavas);
    const deslocamento = (n - 0.5) * 2 * amplitude;

    posicoes.setXYZ(
      i,
      x + normais.getX(i) * deslocamento,
      y + normais.getY(i) * deslocamento,
      z + normais.getZ(i) * deslocamento,
    );
  }

  posicoes.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* -------------------------------------------------------------------------
 * Cor por vértice
 * ---------------------------------------------------------------------- */

/**
 * Grava cor por vértice a partir de uma função da posição.
 *
 * A função recebe `(x, y, z, indice)` e devolve um multiplicador — número para
 * variação neutra de luminosidade, ou `[r, g, b]` para desviar o tom. Fica em
 * torno de 1,0: 0,6 escurece, 1,2 clareia.
 *
 * É por aqui que entram os sinais que identificam a comida — marca de chapa,
 * borda carbonizada, miolo claro do tomate. Prefira transição curta a degradê
 * longo: contorno definido lê como comida, degradê lê como sujeira.
 */
export function pintar(geometry, calcular) {
  const posicoes = geometry.attributes.position;
  const cores = new Float32Array(posicoes.count * 3);

  for (let i = 0; i < posicoes.count; i += 1) {
    const resultado = calcular(posicoes.getX(i), posicoes.getY(i), posicoes.getZ(i), i);
    const [r, g, b] = typeof resultado === 'number' ? [resultado, resultado, resultado] : resultado;
    cores[i * 3] = r;
    cores[i * 3 + 1] = g;
    cores[i * 3 + 2] = b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geometry;
}

/** Variação sutil e sem padrão visível — o mínimo para tirar o ar de plástico. */
export function granular(geometry, intensidade = 0.09, frequencia = 60) {
  return pintar(
    geometry,
    (x, y, z) => 1 - intensidade / 2 + fbm(x * frequencia, y * frequencia, z * frequencia) * intensidade,
  );
}

/* -------------------------------------------------------------------------
 * Formas
 * ---------------------------------------------------------------------- */

export const cm = (v) => v / 100;

/** Malha com a geometria já pronta, apoiada em `y`. */
export function peca(geometry, mat, { y = 0, x = 0, z = 0, rotacao } = {}) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  if (rotacao) mesh.rotation.set(rotacao[0] ?? 0, rotacao[1] ?? 0, rotacao[2] ?? 0);
  return mesh;
}

/**
 * Perfil girado — a forma certa para pão, tigela, copo e bola de sorvete.
 *
 * `pontos` é o contorno no plano XY, de baixo para cima; a rotação em torno de
 * Y produz o sólido. Dá controle muito mais fino que empilhar cilindros, e é o
 * que permite desenhar a cintura do pão e o ressalto da borda da carne em vez
 * de esperar que o ruído produza alguma coisa parecida.
 */
export function girar(pontos, segmentos = 48) {
  return new THREE.LatheGeometry(
    pontos.map(([px, py]) => new THREE.Vector2(Math.max(px, 0.0001), py)),
    segmentos,
  );
}

/** Disco com espessura, com a base apoiada na origem local. */
export function disco(raio, altura, { segmentos = 48, raioBase } = {}) {
  const g = new THREE.CylinderGeometry(raio, raioBase ?? raio, altura, segmentos, 3);
  g.translate(0, altura / 2, 0);
  return g;
}

/**
 * Transforma uma superfície aberta numa lâmina fina com as duas faces.
 *
 * Peças como fatia de queijo, folha de alface e tira de bacon nascem de um
 * plano, que só tem uma face. A saída fácil é `side: DoubleSide`, mas o USDZ
 * não suporta material de dupla face — no iPhone essas peças sumiriam quando
 * vistas por baixo, que é justamente o ângulo de quem olha um prato na mesa.
 *
 * Aqui a lâmina ganha verso de verdade: uma cópia deslocada para dentro pela
 * espessura, com as normais invertidas e o sentido dos triângulos trocado. Sai
 * uma casca sólida que funciona nos dois formatos — e que, de quebra, sombreia
 * melhor, porque passa a ter volume.
 */
export function duasFaces(geometry, espessura = 0.0004) {
  geometry.computeVertexNormals();

  const verso = geometry.clone();
  const posicoes = verso.attributes.position;
  const normais = verso.attributes.normal;

  for (let i = 0; i < posicoes.count; i += 1) {
    const nx = normais.getX(i);
    const ny = normais.getY(i);
    const nz = normais.getZ(i);
    posicoes.setXYZ(
      i,
      posicoes.getX(i) - nx * espessura,
      posicoes.getY(i) - ny * espessura,
      posicoes.getZ(i) - nz * espessura,
    );
    normais.setXYZ(i, -nx, -ny, -nz);
  }
  posicoes.needsUpdate = true;
  normais.needsUpdate = true;

  // Sem inverter o sentido dos triângulos, a face de trás continua sendo
  // descartada pelo culling e o verso não aparece.
  const indice = verso.getIndex();
  const lista = indice.array;
  for (let i = 0; i < lista.length; i += 3) {
    const trocado = lista[i];
    lista[i] = lista[i + 2];
    lista[i + 2] = trocado;
  }
  indice.needsUpdate = true;

  return mergeGeometries([geometry, verso]);
}

/** Sequência determinística em [0, 1) — substitui Math.random sem perder reprodutibilidade. */
export function sorteio(semente) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}
