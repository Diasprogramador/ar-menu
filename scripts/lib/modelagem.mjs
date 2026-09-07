/**
 * Ferramentas de modelagem procedural de comida.
 *
 * O que separa um prato de uma massinha de modelar não é polígono: é
 * irregularidade e variação de cor. Um pão de verdade não é um cilindro liso e
 * de cor única — a superfície ondula, a crosta escurece onde tostou, e o miolo
 * é mais claro que a casca.
 *
 * Este módulo dá as ferramentas que produzem isso:
 *
 *   `deformar`  desloca os vértices ao longo da normal usando ruído coerente,
 *               quebrando a silhueta perfeita da geometria primitiva;
 *   `pintar`    grava cor por vértice, que os dois exportadores preservam
 *               (COLOR_0 no glTF, primvars:displayColor no USD);
 *   `material`  monta o material PBR e acopla a textura procedural da receita
 *               escolhida — cor e relevo, gerados em `texturas.mjs`;
 *   `ruido`     ruído de valor determinístico — o mesmo modelo sai idêntico em
 *               toda execução, o que mantém o repositório reproduzível.
 *
 * A divisão de trabalho entre os três: a deformação resolve a silhueta, que se
 * lê de longe; a textura resolve a superfície, que se lê de perto; a cor por
 * vértice resolve o que é específico daquela peça — a borda carbonizada de um
 * hambúrguer não se repete como padrão, então não pode vir de textura.
 *
 * A cor por vértice é sempre um **multiplicador** em torno de 1,0, e nunca a
 * cor final. O tom base vive em `material.color`. Assim, se algum visualizador
 * descartar a cor por vértice, o prato fica liso — mas continua da cor certa,
 * em vez de branco.
 */
import * as THREE from 'three';

import { textura } from './texturas.mjs';

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
 * `amplitude` é em metros — as mesmas unidades da cena. Uma casca de pão pede
 * algo entre 1 e 3 mm; uma bola de sorvete, 4 mm.
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
  return pintar(geometry, (x, y, z) => 1 - intensidade / 2 + fbm(x * frequencia, y * frequencia, z * frequencia) * intensidade);
}

/* -------------------------------------------------------------------------
 * Materiais
 * ---------------------------------------------------------------------- */

/**
 * Material PBR com cor por vértice ligada.
 *
 * `roughness` é o parâmetro que mais muda a leitura do alimento: pão e carne
 * ficam acima de 0,8, queijo derretido perto de 0,35, vidro e gelo abaixo de
 * 0,1. Errar isso é o que faz tudo parecer o mesmo material fosco.
 */
export function material(
  cor,
  {
    roughness = 0.8,
    metalness = 0,
    transparent = false,
    opacity = 1,
    receita,
    repeticao = 1,
    relevo = 0.6,
    lado,
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cor),
    roughness,
    metalness,
    transparent,
    opacity,
    vertexColors: true,
    side: lado ?? (transparent ? THREE.DoubleSide : THREE.FrontSide),
  });

  if (receita) {
    // Sem clonar: materiais com a mesma receita e repetição apontam para a
    // mesma textura, e o arquivo exportado carrega a imagem uma vez só.
    const { map, normalMap } = textura(receita, { repeticao });
    m.map = map;
    m.normalMap = normalMap;
    m.normalScale = new THREE.Vector2(relevo, relevo);
  }

  return m;
}

/* -------------------------------------------------------------------------
 * Formas
 * ---------------------------------------------------------------------- */

export const cm = (v) => v / 100;

/**
 * Reescreve as UV por projeção em caixa, na escala do mundo.
 *
 * As UV que as geometrias primitivas trazem seguem a topologia, não o tamanho:
 * a lateral de um cilindro mapeia V ao longo da altura, então um hambúrguer de
 * 37 cm de circunferência e 1,9 cm de altura estica a textura vinte vezes. O
 * resultado é listra horizontal — foi exatamente assim que a carne ganhou cara
 * de tábua de madeira.
 *
 * Projetando cada vértice no plano do eixo dominante da sua normal, um ladrilho
 * passa a medir sempre `tileCm` centímetros, em qualquer peça. A projeção deixa
 * costura onde a normal troca de eixo, mas em superfície irregular e com
 * textura de ruído isso não se distingue.
 */
export function projetarUv(geometry, tileCm = 4.5) {
  geometry.computeVertexNormals();
  const posicoes = geometry.attributes.position;
  const normais = geometry.attributes.normal;
  const uv = new Float32Array(posicoes.count * 2);
  const escala = 1 / cm(tileCm);

  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const y = posicoes.getY(i);
    const z = posicoes.getZ(i);

    const nx = Math.abs(normais.getX(i));
    const ny = Math.abs(normais.getY(i));
    const nz = Math.abs(normais.getZ(i));

    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }

    uv[i * 2] = u * escala;
    uv[i * 2 + 1] = v * escala;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

const jaProjetadas = new WeakSet();

/**
 * Malha com a geometria já deformada e pintada, apoiada em `y`.
 *
 * Se o material tem textura, as UV da geometria são reprojetadas na escala do
 * mundo — uma vez por geometria, mesmo quando ela é reaproveitada em várias
 * peças.
 */
export function peca(geometry, mat, { y = 0, x = 0, z = 0, rotacao, tileCm } = {}) {
  if (mat.map && !jaProjetadas.has(geometry)) {
    projetarUv(geometry, tileCm ?? 4.5);
    jaProjetadas.add(geometry);
  }

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  if (rotacao) mesh.rotation.set(rotacao[0] ?? 0, rotacao[1] ?? 0, rotacao[2] ?? 0);
  return mesh;
}

/**
 * Perfil girado — a forma certa para pão, tigela, copo e bola de sorvete.
 *
 * `pontos` é o contorno no plano XY, de baixo para cima; a rotação em torno de
 * Y produz o sólido. Dá controle muito mais fino que empilhar cilindros, que é
 * exatamente o que fazia tudo parecer modelado com massinha.
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

/** Sequência determinística em [0, 1) — substitui Math.random sem perder reprodutibilidade. */
export function sorteio(semente) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}
