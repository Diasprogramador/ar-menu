/**
 * Texturas procedurais de comida.
 *
 * O que fazia os modelos parecerem massinha não era a geometria: era a
 * superfície. Uma cor chapada e uma normal lisa devolvem sempre o mesmo
 * brilho, e o olho lê isso como plástico. Casca de pão tem poro, carne tem
 * fibra e crosta, queijo tem brilho irregular.
 *
 * Cada receita aqui produz dois mapas emparelhados, gerados do mesmo campo de
 * altura para que combinem:
 *
 *   `map`        cor, com as variações que a comida realmente tem;
 *   `normalMap`  relevo, que é o que faz a luz variar pela superfície.
 *
 * O ruído é ladrilhável: a rede de inteiros fecha em `periodo`, então a textura
 * repete sem costura visível em qualquer geometria.
 *
 * A resolução é deliberadamente baixa — 160 px. Textura de ruído comprime mal
 * em PNG, e o exportador de glTF reconstrói o normal map uma vez por material,
 * o que impede a deduplicação. Como as texturas são repetidas várias vezes ao
 * longo da superfície, a perda de nitidez não aparece, mas o arquivo que o
 * cliente baixa no celular cai à metade.
 */
import * as THREE from 'three';

import { ImagemDePixels } from './canvas-node.mjs';

/* -------------------------------------------------------------------------
 * Ruído 2D ladrilhável
 * ---------------------------------------------------------------------- */

function hash2(x, y, semente) {
  const s = Math.sin(x * 127.1 + y * 311.7 + semente * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const suave = (t) => t * t * (3 - 2 * t);
const misturar = (a, b, t) => a + (b - a) * t;

/** Ruído de valor que fecha em `periodo` nas duas direções. */
function ruido2(x, y, periodo, semente) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = suave(x - xi);
  const yf = suave(y - yi);

  const envolver = (v, p) => ((v % p) + p) % p;

  const x0 = envolver(xi, periodo);
  const x1 = envolver(xi + 1, periodo);
  const y0 = envolver(yi, periodo);
  const y1 = envolver(yi + 1, periodo);

  return misturar(
    misturar(hash2(x0, y0, semente), hash2(x1, y0, semente), xf),
    misturar(hash2(x0, y1, semente), hash2(x1, y1, semente), xf),
    yf,
  );
}

/** Ruído fractal ladrilhável em [0, 1]. */
function fbm2(u, v, { periodo = 8, oitavas = 4, semente = 1 } = {}) {
  let valor = 0;
  let amplitude = 0.5;
  let total = 0;
  let p = periodo;

  for (let i = 0; i < oitavas; i += 1) {
    valor += ruido2(u * p, v * p, p, semente + i * 17) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    p *= 2;
  }
  return valor / total;
}

/* -------------------------------------------------------------------------
 * Receitas
 *
 * Cada receita devolve, para uma coordenada (u, v) em [0, 1):
 *   altura  — campo de relevo, em [0, 1]
 *   tom     — multiplicador de cor, em torno de 1
 * ---------------------------------------------------------------------- */

const RECEITAS = {
  /**
   * Casca de pão: bolhas arredondadas e manchas de forno.
   *
   * O ruído aqui é isotrópico de propósito. Uma versão anterior esticava o
   * ruído numa direção para simular fibra, e num cilindro isso virava listra
   * horizontal — o pão saía com cara de madeira.
   */
  pao: (u, v) => {
    const poro = fbm2(u, v, { periodo: 9, oitavas: 3, semente: 3 });
    const bolha = fbm2(u, v, { periodo: 3, oitavas: 2, semente: 11 });
    // Expoente < 1 arredonda os picos: poro de pão é bolha, não crista
    const altura = Math.pow(poro * 0.6 + bolha * 0.4, 0.7);
    const tom = 0.78 + bolha * 0.44 + (poro - 0.5) * 0.28;
    return { altura, tom: [tom, tom * 0.96, tom * 0.87] };
  },

  /** Miolo de pão: alvéolos maiores e cor mais clara. */
  miolo: (u, v) => {
    const alveolo = fbm2(u, v, { periodo: 14, oitavas: 3, semente: 29 });
    const altura = Math.pow(alveolo, 1.6);
    const tom = 1.02 + (alveolo - 0.5) * 0.52;
    return { altura, tom };
  },

  /**
   * Carne grelhada: superfície granulada com crosta escura em manchas.
   *
   * A carne tem fibra, mas ela é curta e sem direção dominante depois de
   * moída e prensada. Ruído isotrópico em duas escalas — grão fino sobre
   * manchas largas — lê como carne; ruído direcional lê como tábua.
   */
  carne: (u, v) => {
    const grao = fbm2(u, v, { periodo: 16, oitavas: 3, semente: 7 });
    const crosta = fbm2(u, v, { periodo: 4, oitavas: 2, semente: 41 });
    const altura = grao * 0.55 + crosta * 0.45;
    // Crosta bem escura e recortada, do jeito que a chapa marca
    const queimado = crosta > 0.5 ? 1 - (crosta - 0.5) * 1.7 : 1;
    const tom = Math.max(0.4, queimado) * (0.8 + grao * 0.48);
    return { altura, tom: [tom, tom * 0.92, tom * 0.86] };
  },

  /** Queijo derretido: superfície ondulada com poças douradas. */
  queijo: (u, v) => {
    const onda = fbm2(u, v, { periodo: 9, oitavas: 3, semente: 13 });
    const gratinado = fbm2(u, v, { periodo: 5, oitavas: 2, semente: 61 });
    const altura = onda;
    const dourado = gratinado > 0.58 ? 1 + (gratinado - 0.58) * 2.2 : 1;
    const tom = dourado * (0.82 + onda * 0.42);
    return { altura, tom: [tom, tom * 0.93, tom * 0.72] };
  },

  /** Massa de pizza: bolhas de fermentação e pintas de leopardo. */
  massa: (u, v) => {
    const bolha = fbm2(u, v, { periodo: 12, oitavas: 4, semente: 23 });
    const leopardo = fbm2(u, v, { periodo: 7, oitavas: 2, semente: 91 });
    const altura = bolha;
    const pinta = leopardo > 0.63 ? 1 - (leopardo - 0.63) * 2.8 : 1;
    const tom = Math.max(0.26, pinta) * (0.78 + bolha * 0.52);
    return { altura, tom: [tom, tom * 0.95, tom * 0.86] };
  },

  /** Empanado: granulação grossa e irregular da farinha de rosca. */
  empanado: (u, v) => {
    const grao = fbm2(u, v, { periodo: 30, oitavas: 4, semente: 5 });
    const altura = Math.pow(grao, 1.3);
    const tom = 0.66 + grao * 0.84;
    return { altura, tom: [tom, tom * 0.95, tom * 0.82] };
  },

  /** Batata frita: casca fina, pontos dourados. */
  batata: (u, v) => {
    const casca = fbm2(u, v, { periodo: 20, oitavas: 3, semente: 33 });
    const altura = casca * 0.6;
    const tom = 0.74 + casca * 0.68;
    return { altura, tom: [tom, tom * 0.94, tom * 0.76] };
  },

  /** Folha: nervuras finas correndo em uma direção. */
  folha: (u, v) => {
    const nervura = Math.abs(Math.sin(v * Math.PI * 9 + fbm2(u, v, { periodo: 6, semente: 3 }) * 3));
    const poro = fbm2(u, v, { periodo: 24, oitavas: 3, semente: 71 });
    const altura = nervura * 0.5 + poro * 0.5;
    const tom = 0.76 + nervura * 0.48 + poro * 0.24;
    return { altura, tom: [tom * 0.92, tom, tom * 0.84] };
  },

  /** Chocolate: superfície fosca com craquelado fino. */
  chocolate: (u, v) => {
    const craquele = fbm2(u, v, { periodo: 16, oitavas: 4, semente: 17 });
    const altura = craquele;
    const tom = 0.7 + craquele * 0.68;
    return { altura, tom };
  },

  /** Madeira: veio forte em uma direção, como tábua de servir. */
  madeira: (u, v) => {
    const anel = Math.sin((v * 9 + fbm2(u, v, { periodo: 4, semente: 9 }) * 3.4) * Math.PI);
    const fibra = fbm2(u * 6, v, { periodo: 22, oitavas: 3, semente: 51 });
    const altura = Math.abs(anel) * 0.6 + fibra * 0.4;
    const tom = 0.76 + Math.abs(anel) * 0.42 + fibra * 0.26;
    return { altura, tom: [tom, tom * 0.9, tom * 0.78] };
  },

  /** Louça e vidro: quase sem relevo, variação mínima. */
  liso: (u, v) => {
    const leve = fbm2(u, v, { periodo: 6, oitavas: 2, semente: 2 });
    return { altura: leve * 0.15, tom: 0.98 + leve * 0.05 };
  },

  /** Gelo: fraturas internas. */
  gelo: (u, v) => {
    const fratura = fbm2(u, v, { periodo: 10, oitavas: 3, semente: 88 });
    return { altura: fratura * 0.5, tom: 0.94 + fratura * 0.14 };
  },
};

/* -------------------------------------------------------------------------
 * Construção dos mapas
 * ---------------------------------------------------------------------- */

function paraDataTexture(rgba, tamanho, { srgb }) {
  const textura = new THREE.DataTexture(rgba, tamanho, tamanho, THREE.RGBAFormat);
  // Trocamos o objeto simples de imagem por uma instancia reconhecida pelos
  // dois exportadores; o conteudo e o mesmo.
  textura.image = new ImagemDePixels(rgba, tamanho, tamanho);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.magFilter = THREE.LinearFilter;
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  textura.generateMipmaps = true;
  textura.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textura.needsUpdate = true;
  return textura;
}

const cache = new Map();

/**
 * Gera o par cor + relevo de uma receita.
 *
 * O relevo sai do gradiente do mesmo campo de altura que modula a cor — é isso
 * que faz a sombra cair onde a mancha está, em vez de parecerem dois desenhos
 * sobrepostos.
 */
export function textura(nomeDaReceita, { tamanho = 160, forcaDoRelevo = 7, repeticao = 1 } = {}) {
  // A repeticao entra na chave porque ela vive na propria textura. Assim dois
  // materiais com a mesma receita e a mesma repeticao compartilham a instancia,
  // e o exportador embute a imagem uma vez so em vez de uma por material.
  const chave = `${nomeDaReceita}:${tamanho}:${forcaDoRelevo}:${repeticao}`;
  if (cache.has(chave)) return cache.get(chave);

  const receita = RECEITAS[nomeDaReceita];
  if (!receita) throw new Error(`Receita de textura desconhecida: ${nomeDaReceita}`);

  const alturas = new Float32Array(tamanho * tamanho);
  const cor = new Uint8Array(tamanho * tamanho * 4);

  for (let y = 0; y < tamanho; y += 1) {
    for (let x = 0; x < tamanho; x += 1) {
      const i = y * tamanho + x;
      const { altura, tom } = receita(x / tamanho, y / tamanho);
      alturas[i] = altura;

      const [r, g, b] = typeof tom === 'number' ? [tom, tom, tom] : tom;
      cor[i * 4] = Math.min(255, Math.max(0, Math.round(r * 255)));
      cor[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
      cor[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
      cor[i * 4 + 3] = 255;
    }
  }

  const normal = new Uint8Array(tamanho * tamanho * 4);
  const amostrar = (x, y) => alturas[((y + tamanho) % tamanho) * tamanho + ((x + tamanho) % tamanho)];

  for (let y = 0; y < tamanho; y += 1) {
    for (let x = 0; x < tamanho; x += 1) {
      const dx = (amostrar(x + 1, y) - amostrar(x - 1, y)) * forcaDoRelevo;
      const dy = (amostrar(x, y + 1) - amostrar(x, y - 1)) * forcaDoRelevo;

      // Normal de um campo de altura: (-dx, -dy, 1), normalizada
      const comprimento = Math.hypot(dx, dy, 1);
      const i = (y * tamanho + x) * 4;
      normal[i] = Math.round(((-dx / comprimento) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((-dy / comprimento) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((1 / comprimento) * 0.5 * 255 + 127.5);
      normal[i + 3] = 255;
    }
  }

  const par = {
    map: paraDataTexture(cor, tamanho, { srgb: true }),
    normalMap: paraDataTexture(normal, tamanho, { srgb: false }),
  };
  par.map.repeat.set(repeticao, repeticao);
  par.normalMap.repeat.set(repeticao, repeticao);

  cache.set(chave, par);
  return par;
}
