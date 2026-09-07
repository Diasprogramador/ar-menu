/**
 * Os doze pratos do "Brasa & Mesa", modelados em código.
 *
 * Cada prato é construído nas dimensões reais que o cardápio anuncia, com
 * origem no centro da base — o modelo apoia em y = 0, que é o que faz o
 * posicionamento na superfície detectada funcionar sem cálculo extra.
 *
 * A regra que orienta o desenho: comida não tem superfície lisa nem cor
 * uniforme. Todo pedaço passa por `deformar` e ganha cor por vértice. Onde a
 * comida realmente tosta, escurece ou brilha, isso está no modelo — a borda
 * carbonizada do hambúrguer, as manchas de leopardo na borda da pizza, as
 * pontas mais escuras da batata.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { cm, deformar, disco, fbm, girar, granular, material, peca, pintar, sorteio } from './modelagem.mjs';

const TAU = Math.PI * 2;

const CORES = {
  paoTopo: '#C98A45',
  paoBase: '#BE7F3D',
  gergelim: '#F0DFB8',
  carne: '#59331F',
  queijo: '#E9A227',
  bacon: '#9E3520',
  alface: '#5E9438',
  tomate: '#C0392B',
  cebola: '#E3D2C2',
  massa: '#DFB877',
  borda: '#C99551',
  molho: '#A8331F',
  mucarela: '#F2E7CE',
  manjericao: '#3B7233',
  pepperoni: '#98241F',
  batata: '#DDA13A',
  papel: '#E6DFD1',
  empanado: '#CE9642',
  chocolate: '#3A1F14',
  baunilha: '#F3E9D2',
  morango: '#DE6C8E',
  calda: '#6B2814',
  vidro: '#D5E2E7',
  refri: '#391C0F',
  gelo: '#E8F3F7',
  louca: '#EFEAE1',
  costela: '#5A2A19',
  glace: '#77300F',
  folha: '#4E8B39',
  parmesao: '#EDD79B',
  crouton: '#D2AE72',
  tigela: '#333A3D',
  madeira: '#7A5230',
};

/* =========================================================================
 * Hambúrguer
 * ====================================================================== */

/** Pão de hambúrguer: perfil girado, casca irregular e topo mais tostado. */
function paoSuperior(raio, altura) {
  const perfil = [];
  const passos = 14;
  for (let i = 0; i <= passos; i += 1) {
    const t = i / passos;
    // Curva de cúpula achatada, com a "cintura" onde o pão encosta no recheio
    const r = raio * Math.sqrt(1 - t * t * 0.94) * (1 - 0.06 * Math.sin(t * Math.PI));
    perfil.push([r, t * altura]);
  }
  perfil.push([0, altura]);

  const g = girar(perfil, 56);
  deformar(g, { amplitude: cm(0.3), frequencia: 18, oitavas: 4, semente: 3 });
  pintar(g, (x, y, z) => {
    // O topo assa mais que a lateral: escurece com a altura
    const assado = 1 - (y / altura) * 0.22;
    const manchas = 0.94 + fbm(x * 70, y * 70, z * 70) * 0.16;
    return [assado * manchas * 1.02, assado * manchas * 0.97, assado * manchas * 0.9];
  });
  return g;
}

function paoInferior(raio, altura) {
  const g = girar(
    [
      [raio * 0.9, 0],
      [raio * 0.99, altura * 0.35],
      [raio, altura * 0.75],
      [raio * 0.985, altura],
      [0, altura],
    ],
    56,
  );
  deformar(g, { amplitude: cm(0.22), frequencia: 20, oitavas: 4, semente: 11 });
  pintar(g, (x, y, z) => {
    // A face cortada, no topo, é miolo claro; a lateral é casca
    const miolo = y > altura * 0.9 ? 1.14 : 1;
    return miolo * (0.93 + fbm(x * 64, y * 64, z * 64) * 0.14);
  });
  return g;
}

/** Hambúrguer: disco irregular com a borda carbonizada. */
function hamburguer(raio, altura) {
  const g = disco(raio, altura, { segmentos: 52, raioBase: raio * 0.97 });
  deformar(g, { amplitude: cm(0.3), frequencia: 16, oitavas: 4, semente: 7 });
  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z) / raio;
    // A crosta escura fica no anel externo e no topo, onde encostou na chapa
    const crosta = Math.max(0, distancia - 0.72) * 2.2;
    const chapa = y > altura * 0.7 ? 0.35 : 0;
    const escuro = Math.min(0.62, crosta + chapa);
    const grao = 0.9 + fbm(x * 90, y * 90, z * 90) * 0.2;
    return (1 - escuro) * grao;
  });
  return g;
}

/** Fatia de queijo derretido: quadrado que amolece e escorre nas pontas. */
function queijoDerretido(raio, grupo, y) {
  const lado = raio * 1.42;
  const g = new THREE.PlaneGeometry(lado, lado, 22, 22);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    const distancia = Math.max(Math.abs(x), Math.abs(z)) / (lado / 2);
    // Fora do disco de carne o queijo despenca; dentro, ondula de leve
    const queda = distancia > 0.62 ? -Math.pow((distancia - 0.62) / 0.38, 1.7) * cm(2.2) : 0;
    posicoes.setY(i, queda + (fbm(x * 60, 0, z * 60) - 0.5) * cm(0.16));
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();
  granular(g, 0.14, 45);

  grupo.add(peca(g, material(CORES.queijo, { roughness: 0.3, receita: 'queijo', relevo: 1.14 }), { y }));
}

/** Tira de bacon: ondulada, com faixas alternadas de carne e gordura. */
function tiraDeBacon(comprimento, largura, semente) {
  const g = new THREE.PlaneGeometry(comprimento, largura, 30, 4);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    posicoes.setY(i, Math.sin(x * 46 + semente) * cm(0.22) + (fbm(x * 80, semente, 0) - 0.5) * cm(0.1));
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();

  pintar(g, (x, y, z) => {
    // Faixas de gordura: mais claras, quase brancas
    const faixa = Math.sin(z * 220 + x * 30) * 0.5 + 0.5;
    const gordura = faixa > 0.62 ? 1.5 : 1;
    return [gordura, gordura * (faixa > 0.62 ? 0.92 : 0.86), gordura * (faixa > 0.62 ? 0.84 : 0.8)];
  });
  return g;
}

/** Folha de alface: ruflada nas bordas, como a americana de verdade. */
function folhaDeAlface(raio, semente) {
  const g = new THREE.CircleGeometry(raio, 26, 0, TAU);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    const distancia = Math.hypot(x, z) / raio;
    const angulo = Math.atan2(z, x);
    // Onda na borda + inclinação para o centro: a folha "abraça" o recheio
    const rufo = Math.sin(angulo * 7 + semente) * distancia * distancia * cm(0.5);
    posicoes.setY(i, rufo - distancia * distancia * cm(0.25));
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();
  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z) / raio;
    // Nervura central mais clara, borda mais viva
    const claro = 1.22 - distancia * 0.28;
    return [claro * 0.92, claro, claro * 0.82];
  });
  return g;
}

function rodelaDeTomate(raio, altura) {
  const g = disco(raio, altura, { segmentos: 34 });
  deformar(g, { amplitude: cm(0.05), frequencia: 40, semente: 21 });
  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z) / raio;
    // Miolo mais claro e com semente; polpa externa mais saturada
    const miolo = distancia < 0.45 ? 1.3 : 1;
    return [miolo, miolo * 0.82, miolo * 0.78];
  });
  return g;
}

export function construirHamburguer({ raio, camadas }) {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(4242);
  let y = 0;

  const alturaBase = cm(1.7);
  grupo.add(peca(paoInferior(raio * 0.97, alturaBase), material(CORES.paoBase, { roughness: 0.9, receita: 'pao', relevo: 1.61 }), { y }));
  y += alturaBase;

  for (const camada of camadas) {
    switch (camada) {
      case 'carne': {
        const altura = cm(1.9);
        grupo.add(peca(hamburguer(raio, altura), material(CORES.carne, { roughness: 0.66, receita: 'carne', relevo: 2.09 }), { y }));
        y += altura * 0.92;
        break;
      }
      case 'queijo':
        queijoDerretido(raio, grupo, y + cm(0.1));
        y += cm(0.35);
        break;
      case 'bacon': {
        for (let i = 0; i < 3; i += 1) {
          const g = tiraDeBacon(raio * 1.9, cm(2.1), i * 2.3);
          grupo.add(
            peca(g, material(CORES.bacon, { roughness: 0.42, receita: 'carne', relevo: 1.52 }), {
              y: y + cm(0.3),
              z: (i - 1) * cm(1.9),
              rotacao: [0, (aleatorio() - 0.5) * 0.4, 0],
            }),
          );
        }
        y += cm(0.7);
        break;
      }
      case 'alface': {
        for (let i = 0; i < 3; i += 1) {
          grupo.add(
            peca(folhaDeAlface(raio * 0.98, i * 2.1), material(CORES.alface, { roughness: 0.58, receita: 'folha', relevo: 1.33 }), {
              y: y + cm(0.25) + i * cm(0.12),
              rotacao: [0, (i / 3) * TAU, 0],
            }),
          );
        }
        y += cm(0.85);
        break;
      }
      case 'tomate': {
        const altura = cm(0.65);
        grupo.add(peca(rodelaDeTomate(raio * 0.88, altura), material(CORES.tomate, { roughness: 0.34, receita: 'liso', relevo: 0.76 }), { y }));
        y += altura;
        break;
      }
      case 'cebola': {
        const g = new THREE.TorusGeometry(raio * 0.66, cm(0.32), 10, 40);
        g.rotateX(Math.PI / 2);
        deformar(g, { amplitude: cm(0.06), frequencia: 45, semente: 33 });
        granular(g, 0.14, 55);
        grupo.add(peca(g, material(CORES.cebola, { roughness: 0.5, receita: 'liso', relevo: 0.95 }), { y: y + cm(0.34) }));
        y += cm(0.7);
        break;
      }
      default:
        break;
    }
  }

  const alturaTopo = raio * 0.78;
  grupo.add(peca(paoSuperior(raio, alturaTopo), material(CORES.paoTopo, { roughness: 0.88, receita: 'pao', relevo: 1.71 }), { y }));

  // Gergelim assentado na curvatura do pão, não flutuando sobre ela
  const gergelim = new THREE.SphereGeometry(cm(0.17), 8, 6);
  gergelim.scale(1.5, 0.62, 1);
  granular(gergelim, 0.1, 90);
  const matGergelim = material(CORES.gergelim, { roughness: 0.5 });

  for (let i = 0; i < 22; i += 1) {
    const angulo = i * 2.399;
    const t = Math.sqrt(aleatorio()) * 0.82;
    const r = raio * t;
    const alturaNoPonto = alturaTopo * Math.sqrt(Math.max(0, 1 - t * t * 0.94));
    grupo.add(
      peca(gergelim, matGergelim, {
        x: Math.cos(angulo) * r,
        z: Math.sin(angulo) * r,
        y: y + alturaNoPonto - cm(0.06),
        rotacao: [0, angulo, 0],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Pizza
 * ====================================================================== */

export function construirPizza({ raioCm, cobertura }) {
  const grupo = new THREE.Group();
  const raio = cm(raioCm);
  const aleatorio = sorteio(90210);

  // Massa: disco de borda irregular, como massa aberta à mão
  const massa = disco(raio, cm(0.7), { segmentos: 64 });
  deformar(massa, { amplitude: cm(0.09), frequencia: 14, semente: 5 });
  granular(massa, 0.12, 40);
  grupo.add(peca(massa, material(CORES.massa, { roughness: 0.9, receita: 'massa', relevo: 1.52 })));

  // Borda com bolhas e manchas de leopardo — a assinatura da massa fermentada
  const borda = new THREE.TorusGeometry(raio * 0.925, cm(1.25), 14, 72);
  borda.rotateX(Math.PI / 2);
  deformar(borda, { amplitude: cm(0.22), frequencia: 20, oitavas: 4, semente: 17 });
  pintar(borda, (x, y, z) => {
    const mancha = fbm(x * 55, y * 55, z * 55, 2);
    // Pontos bem escuros e esparsos, não um gradiente uniforme
    const leopardo = mancha > 0.62 ? 1 - (mancha - 0.62) * 1.9 : 1;
    const topo = y > 0 ? 1 - y * 1.6 : 1;
    return Math.max(0.42, leopardo * topo) * (0.96 + mancha * 0.12);
  });
  grupo.add(peca(borda, material(CORES.borda, { roughness: 0.87, receita: 'massa', relevo: 2.28 }), { y: cm(1.0) }));

  const molho = disco(raio * 0.9, cm(0.22), { segmentos: 56 });
  granular(molho, 0.16, 50);
  grupo.add(peca(molho, material(CORES.molho, { roughness: 0.45, receita: 'liso', relevo: 0.95 }), { y: cm(0.68) }));

  // Muçarela: camada irregular, com poças mais douradas onde gratinou
  const queijo = new THREE.CircleGeometry(raio * 0.885, 56);
  queijo.rotateX(-Math.PI / 2);
  const pos = queijo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, fbm(x * 70, 0, z * 70, 3) * cm(0.32));
  }
  pos.needsUpdate = true;
  queijo.computeVertexNormals();
  pintar(queijo, (x, y, z) => {
    const gratinado = fbm(x * 48, 0, z * 48, 2);
    const dourado = gratinado > 0.6 ? 1 + (gratinado - 0.6) * 1.4 : 1;
    return [dourado, dourado * 0.94, dourado * 0.78];
  });
  grupo.add(peca(queijo, material(CORES.mucarela, { roughness: 0.34, receita: 'queijo', relevo: 1.33 }), { y: cm(0.9) }));

  if (cobertura === 'margherita') {
    // Folha de manjericão com nervura, não uma esfera achatada
    const folha = new THREE.PlaneGeometry(cm(4.4), cm(2.6), 8, 4);
    folha.rotateX(-Math.PI / 2);
    const fp = folha.attributes.position;
    for (let i = 0; i < fp.count; i += 1) {
      const x = fp.getX(i) / cm(2.2);
      const z = fp.getZ(i) / cm(1.3);
      // Contorno de folha: estreita nas pontas, dobrada na nervura central
      fp.setX(i, fp.getX(i));
      fp.setZ(i, fp.getZ(i) * (1 - x * x) * 1.05);
      fp.setY(i, Math.abs(z) * cm(0.28) + (1 - x * x) * cm(0.06));
    }
    fp.needsUpdate = true;
    folha.computeVertexNormals();
    pintar(folha, (x, y, z) => (Math.abs(z) < cm(0.12) ? 1.28 : 0.95 + fbm(x * 90, 0, z * 90) * 0.16));
    const matFolha = material(CORES.manjericao, { roughness: 0.5, receita: 'folha', relevo: 1.14 });

    for (let i = 0; i < 9; i += 1) {
      const angulo = aleatorio() * TAU;
      const r = raio * (0.18 + aleatorio() * 0.58);
      grupo.add(
        peca(folha, matFolha, {
          x: Math.cos(angulo) * r,
          z: Math.sin(angulo) * r,
          y: cm(1.16),
          rotacao: [0, aleatorio() * TAU, 0],
        }),
      );
    }

    // Bolotas de búfala, achatadas pelo forno
    const bolota = new THREE.SphereGeometry(cm(1.7), 18, 12);
    bolota.scale(1, 0.42, 1);
    deformar(bolota, { amplitude: cm(0.12), frequencia: 30, semente: 61 });
    granular(bolota, 0.12, 60);
    const matBolota = material(CORES.mucarela, { roughness: 0.32, receita: 'queijo', relevo: 1.14 });
    for (let i = 0; i < 7; i += 1) {
      const angulo = i * 2.399 + 0.4;
      const r = raio * (0.2 + (i % 3) * 0.24);
      grupo.add(peca(bolota, matBolota, { x: Math.cos(angulo) * r, z: Math.sin(angulo) * r, y: cm(1.1) }));
    }
  } else {
    // Pepperoni encardido: a fatia encolhe e vira uma tigelinha no forno
    const fatia = girar(
      [
        [cm(2.05), 0],
        [cm(2.1), cm(0.18)],
        [cm(1.95), cm(0.42)],
        [cm(1.5), cm(0.34)],
        [0, cm(0.3)],
      ],
      26,
    );
    deformar(fatia, { amplitude: cm(0.04), frequencia: 60, semente: 9 });
    pintar(fatia, (x, y, z) => {
      const distancia = Math.hypot(x, z) / cm(2.1);
      const bordaEscura = distancia > 0.82 ? 0.68 : 1;
      const gordura = fbm(x * 130, y * 130, z * 130) > 0.66 ? 1.35 : 1;
      return bordaEscura * gordura;
    });
    const matFatia = material(CORES.pepperoni, { roughness: 0.38, receita: 'carne', relevo: 1.33 });

    for (let anel = 0; anel < 3; anel += 1) {
      const quantidade = 5 + anel * 4;
      for (let i = 0; i < quantidade; i += 1) {
        const angulo = (i / quantidade) * TAU + anel * 0.7;
        const r = raio * (0.2 + anel * 0.29);
        grupo.add(peca(fatia, matFatia, { x: Math.cos(angulo) * r, z: Math.sin(angulo) * r, y: cm(1.06) }));
      }
    }
  }

  return grupo;
}

/* =========================================================================
 * Batata frita
 * ====================================================================== */

export function construirBatata() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(777);

  // Cone de papel encerado, com dobras
  const cone = girar(
    [
      [cm(3.3), 0],
      [cm(3.6), cm(1.2)],
      [cm(4.6), cm(5.5)],
      [cm(5.3), cm(8.8)],
      [cm(5.35), cm(9.1)],
    ],
    7,
  );
  deformar(cone, { amplitude: cm(0.1), frequencia: 22, semente: 2 });
  granular(cone, 0.14, 30);
  const matPapel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CORES.papel),
    roughness: 0.92,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  grupo.add(peca(cone, matPapel));

  const fundo = disco(cm(3.3), cm(0.35), { segmentos: 7 });
  granular(fundo, 0.1, 30);
  grupo.add(peca(fundo, material(CORES.papel, { roughness: 0.94, receita: 'liso', relevo: 0.76 })));

  const matBatata = material(CORES.batata, { roughness: 0.58, receita: 'batata', relevo: 1.52 });

  for (let i = 0; i < 22; i += 1) {
    const comprimento = cm(6.5 + aleatorio() * 3.5);
    const lado = cm(0.7 + aleatorio() * 0.22);

    const g = new RoundedBoxGeometry(lado, comprimento, lado, 1, lado * 0.3);
    deformar(g, { amplitude: cm(0.035), frequencia: 34, semente: i * 3 });
    pintar(g, (x, y) => {
      // As pontas tostam mais que o meio
      const ponta = Math.abs(y) / (comprimento / 2);
      const tostado = 1 - Math.pow(ponta, 3) * 0.42;
      return [tostado, tostado * 0.95, tostado * 0.82];
    });

    const angulo = i * 2.399;
    const raio = cm(0.5 + (i % 6) * 0.62);
    grupo.add(
      peca(g, matBatata, {
        x: Math.cos(angulo) * raio,
        z: Math.sin(angulo) * raio,
        y: cm(6.4) + comprimento / 2 - cm(1.6),
        rotacao: [(aleatorio() - 0.5) * 0.34, angulo, (aleatorio() - 0.5) * 0.34],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Anéis de cebola
 * ====================================================================== */

export function construirAneis() {
  const grupo = new THREE.Group();
  const matEmpanado = material(CORES.empanado, { roughness: 0.85, receita: 'empanado', relevo: 2.5 });

  const pilha = [
    { y: cm(1.1), raio: cm(4.4), inclinacao: 0.05, semente: 1 },
    { y: cm(2.8), raio: cm(4.0), inclinacao: 0.16, semente: 2 },
    { y: cm(4.5), raio: cm(4.3), inclinacao: -0.12, semente: 3 },
    { y: cm(6.2), raio: cm(3.8), inclinacao: 0.2, semente: 4 },
  ];

  for (const [indice, anel] of pilha.entries()) {
    const g = new THREE.TorusGeometry(anel.raio, cm(1.15), 14, 40);
    g.rotateX(Math.PI / 2);
    // Amplitude alta: farinha de rosca é grosseira e irregular
    deformar(g, { amplitude: cm(0.16), frequencia: 34, oitavas: 4, semente: anel.semente * 13 });
    pintar(g, (x, y, z) => {
      const crocante = fbm(x * 100, y * 100, z * 100, 3);
      return 0.86 + crocante * 0.34;
    });

    grupo.add(
      peca(g, matEmpanado, {
        y: anel.y,
        rotacao: [anel.inclinacao, indice * 0.6, anel.inclinacao * 0.6],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Sobremesas
 * ====================================================================== */

function pratoDeLouca(raio) {
  const g = girar(
    [
      [raio * 0.42, 0],
      [raio * 0.5, cm(0.12)],
      [raio * 0.86, cm(0.42)],
      [raio, cm(0.95)],
      [raio, cm(1.05)],
      [raio * 0.94, cm(0.9)],
      [raio * 0.8, cm(0.5)],
      [0, cm(0.42)],
    ],
    48,
  );
  granular(g, 0.05, 30);
  return g;
}

/** Bola de sorvete com a superfície granulada de quem acabou de sair da colher. */
function bolaDeSorvete(raio, cor, semente) {
  const g = new THREE.SphereGeometry(raio, 26, 20);
  g.scale(1, 0.92, 1);
  deformar(g, { amplitude: raio * 0.09, frequencia: 26, oitavas: 3, semente });
  granular(g, 0.13, 55);
  return peca(g, material(cor, { roughness: 0.5, receita: 'miolo', relevo: 2.09 }), { y: raio * 0.86 });
}

export function construirBrownie() {
  const grupo = new THREE.Group();
  grupo.add(peca(pratoDeLouca(cm(9)), material(CORES.louca, { roughness: 0.22, receita: 'liso', relevo: 0.47 })));

  // Bolo com o topo rachado, como brownie assado de verdade
  const bolo = new RoundedBoxGeometry(cm(7), cm(3.6), cm(6.2), 4, cm(0.28));
  deformar(bolo, { amplitude: cm(0.11), frequencia: 26, oitavas: 4, semente: 44 });
  pintar(bolo, (x, y, z) => {
    const topo = y > cm(1.2);
    const fissura = fbm(x * 45, 0, z * 45, 2);
    // A crosta do topo é bem mais clara que o miolo
    if (topo) return fissura > 0.52 ? 1.42 : 1.12;
    return 0.9 + fissura * 0.2;
  });
  grupo.add(peca(bolo, material(CORES.chocolate, { roughness: 0.7, receita: 'chocolate', relevo: 1.9 }), { x: cm(-1.4), y: cm(2.25) }));

  const sorvete = bolaDeSorvete(cm(2.5), CORES.baunilha, 12);
  sorvete.position.set(cm(4.2), cm(2.6), cm(0.4));
  grupo.add(sorvete);

  // Calda escorrendo pela lateral do bolo
  const matCalda = material(CORES.calda, { roughness: 0.18, receita: 'liso', relevo: 0.76 });
  const aleatorio = sorteio(31);
  for (let i = 0; i < 7; i += 1) {
    const comprimento = cm(1.2 + aleatorio() * 2.4);
    const g = new THREE.CapsuleGeometry(cm(0.34), comprimento, 4, 10);
    deformar(g, { amplitude: cm(0.05), frequencia: 40, semente: i * 7 });
    granular(g, 0.1, 60);
    grupo.add(
      peca(g, matCalda, {
        x: cm(-4.6) + i * cm(1.1),
        z: cm(-2.6) + aleatorio() * cm(5),
        y: cm(3.6) - comprimento / 2,
      }),
    );
  }

  return grupo;
}

export function construirPetitGateau() {
  const grupo = new THREE.Group();
  grupo.add(peca(pratoDeLouca(cm(7.5)), material(CORES.louca, { roughness: 0.22, receita: 'liso', relevo: 0.47 })));

  const bolo = girar(
    [
      [cm(2.7), 0],
      [cm(2.85), cm(0.6)],
      [cm(3.05), cm(2.6)],
      [cm(3.1), cm(3.4)],
      [cm(2.9), cm(3.6)],
      [0, cm(3.5)],
    ],
    36,
  );
  deformar(bolo, { amplitude: cm(0.08), frequencia: 28, semente: 55 });
  pintar(bolo, (x, y) => (y > cm(3.2) ? 1.2 : 0.94 + fbm(x * 60, y * 60, 0) * 0.16));
  grupo.add(peca(bolo, material(CORES.chocolate, { roughness: 0.66, receita: 'chocolate', relevo: 1.71 }), { y: cm(0.42) }));

  const sorvete = bolaDeSorvete(cm(2.2), CORES.baunilha, 88);
  sorvete.position.set(cm(4.0), cm(2.2), 0);
  grupo.add(sorvete);

  const matFruta = material(CORES.morango, { roughness: 0.34, receita: 'liso', relevo: 0.95 });
  const aleatorio = sorteio(5150);
  for (let i = 0; i < 4; i += 1) {
    const g = new THREE.SphereGeometry(cm(0.85), 14, 10);
    deformar(g, { amplitude: cm(0.07), frequencia: 40, semente: i * 11 });
    granular(g, 0.12, 70);
    const angulo = i * 1.9;
    grupo.add(
      peca(g, matFruta, {
        x: Math.cos(angulo) * cm(1.4) - cm(0.4),
        z: Math.sin(angulo) * cm(1.4),
        y: cm(4.3) + aleatorio() * cm(0.3),
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Bebidas
 * ====================================================================== */

function copo(perfilExterno, espessura = cm(0.22)) {
  const interno = perfilExterno.map(([r, y]) => [Math.max(r - espessura, 0.0005), y]);
  const g = girar([...perfilExterno, ...interno.reverse()], 48);
  granular(g, 0.03, 20);
  return g;
}

export function construirMilkshake() {
  const grupo = new THREE.Group();
  const altura = cm(13.5);

  const perfil = [
    [cm(2.9), 0],
    [cm(3.0), cm(0.5)],
    [cm(3.3), cm(2.2)],
    [cm(3.9), cm(7)],
    [cm(4.2), altura],
  ];

  const matVidro = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CORES.vidro),
    roughness: 0.06,
    metalness: 0.02,
    transparent: true,
    opacity: 0.28,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  grupo.add(peca(copo(perfil), matVidro));

  // Base maciça: o copo de milkshake tem fundo pesado
  const base = disco(cm(2.9), cm(0.9), { segmentos: 48 });
  granular(base, 0.04, 25);
  grupo.add(peca(base, matVidro));

  const bebida = girar(
    [
      [cm(2.7), cm(0.9)],
      [cm(3.1), cm(2.4)],
      [cm(3.72), cm(7)],
      [cm(3.98), altura * 0.9],
      [0, altura * 0.9],
    ],
    44,
  );
  granular(bebida, 0.09, 40);
  grupo.add(peca(bebida, material(CORES.morango, { roughness: 0.42, receita: 'liso', relevo: 0.76 })));

  // Chantilly em espiral, feito com um tubo — a forma que sai do bico
  const caminho = [];
  const voltas = 3.2;
  const passos = 120;
  for (let i = 0; i <= passos; i += 1) {
    const t = i / passos;
    const angulo = t * TAU * voltas;
    const raio = cm(3.3) * (1 - t * 0.86);
    caminho.push(new THREE.Vector3(Math.cos(angulo) * raio, altura * 0.9 + t * cm(4.6), Math.sin(angulo) * raio));
  }
  const espiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(caminho), 130, cm(0.95), 12, false);
  deformar(espiral, { amplitude: cm(0.05), frequencia: 50, semente: 71 });
  granular(espiral, 0.09, 60);
  grupo.add(peca(espiral, material(CORES.baunilha, { roughness: 0.55, receita: 'miolo', relevo: 1.33 })));

  const cereja = new THREE.SphereGeometry(cm(0.95), 16, 12);
  granular(cereja, 0.1, 70);
  grupo.add(peca(cereja, material('#B3202C', { roughness: 0.3 }), { y: altura * 0.9 + cm(5.4) }));

  const canudo = new THREE.CylinderGeometry(cm(0.42), cm(0.42), cm(9.5), 14);
  granular(canudo, 0.06, 40);
  grupo.add(peca(canudo, material('#D8433C', { roughness: 0.35 }), { x: cm(1.5), y: altura + cm(2.4), z: cm(0.7), rotacao: [0, 0, 0.3] }));

  return grupo;
}

export function construirRefrigerante() {
  const grupo = new THREE.Group();
  const altura = cm(14);

  const perfil = [
    [cm(2.85), 0],
    [cm(2.95), cm(0.6)],
    [cm(3.4), cm(4)],
    [cm(3.85), altura],
  ];

  const matVidro = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CORES.vidro),
    roughness: 0.05,
    transparent: true,
    opacity: 0.24,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  grupo.add(peca(copo(perfil, cm(0.2)), matVidro));

  const base = disco(cm(2.85), cm(0.7), { segmentos: 48 });
  granular(base, 0.04, 25);
  grupo.add(peca(base, matVidro));

  const liquido = girar(
    [
      [cm(2.68), cm(0.7)],
      [cm(3.24), cm(4)],
      [cm(3.66), altura * 0.86],
      [0, altura * 0.86],
    ],
    44,
  );
  granular(liquido, 0.07, 40);
  grupo.add(
    peca(
      liquido,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(CORES.refri),
        roughness: 0.16,
        transparent: true,
        opacity: 0.92,
        vertexColors: true,
      }),
    ),
  );

  const matGelo = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CORES.gelo),
    roughness: 0.08,
    transparent: true,
    opacity: 0.55,
    vertexColors: true,
  });
  const aleatorio = sorteio(2024);
  for (let i = 0; i < 6; i += 1) {
    const lado = cm(1.7 + aleatorio() * 0.4);
    const g = new RoundedBoxGeometry(lado, lado, lado, 1, lado * 0.22);
    deformar(g, { amplitude: cm(0.05), frequencia: 30, semente: i * 17 });
    granular(g, 0.07, 50);
    const angulo = i * 1.9;
    grupo.add(
      peca(g, matGelo, {
        x: Math.cos(angulo) * cm(1.4),
        z: Math.sin(angulo) * cm(1.4),
        y: cm(4) + (i % 4) * cm(2.2),
        rotacao: [angulo, angulo * 0.7, angulo * 0.4],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Pratos principais
 * ====================================================================== */

export function construirCostela() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(1212);

  const tabua = new RoundedBoxGeometry(cm(24), cm(1.6), cm(17), 3, cm(0.25));
  pintar(tabua, (x, y, z) => {
    // Veio da madeira: listras finas ao longo do comprimento
    const veio = Math.sin(z * 90 + fbm(x * 12, 0, z * 12) * 6) * 0.5 + 0.5;
    return 0.9 + veio * 0.22;
  });
  grupo.add(peca(tabua, material(CORES.madeira, { roughness: 0.62, receita: 'madeira', relevo: 1.33 }), { y: cm(0.8) }));

  for (let i = 0; i < 4; i += 1) {
    // Costela: perfil girado e depois esticado ao longo de X, que e o
    // comprimento da peca. As quatro ficam lado a lado em Z, sobre a tabua.
    const comprimento = cm(16.5);
    const g = girar(
      [
        [cm(1.55), 0],
        [cm(1.72), cm(0.9)],
        [cm(1.66), cm(2.3)],
        [cm(1.3), cm(3.1)],
        [0, cm(3.25)],
      ],
      18,
    );
    g.rotateZ(Math.PI / 2);
    g.scale(comprimento / cm(3.4), 1, 1);
    // O perfil girado nasce apoiado numa das pontas; centralizar evita que a
    // costela ultrapasse a tabua de um lado so.
    g.computeBoundingBox();
    g.translate(-(g.boundingBox.min.x + g.boundingBox.max.x) / 2, 0, 0);
    deformar(g, { amplitude: cm(0.12), frequencia: 22, oitavas: 4, semente: i * 23 });
    pintar(g, (x, y, z) => {
      const glaceado = fbm(x * 34, y * 34, z * 34, 3);
      // Glace brilhante com pontos carbonizados
      const carbonizado = glaceado > 0.68 ? 0.55 : 1;
      return carbonizado * (0.88 + glaceado * 0.3);
    });

    grupo.add(
      peca(g, material(CORES.costela, { roughness: 0.32, receita: 'carne', relevo: 2.28 }), {
        y: cm(1.6) + cm(1.7),
        z: cm(-5.4) + i * cm(3.6),
        x: (aleatorio() - 0.5) * cm(1.4),
        rotacao: [0, (aleatorio() - 0.5) * 0.06, 0],
      }),
    );
  }

  return grupo;
}

export function construirSalada() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(606);

  const tigela = girar(
    [
      [cm(4.2), 0],
      [cm(4.6), cm(0.4)],
      [cm(7.6), cm(2.6)],
      [cm(10.2), cm(5.6)],
      [cm(10.5), cm(6)],
      [cm(10.1), cm(5.7)],
      [cm(7.3), cm(2.8)],
      [cm(4.1), cm(0.5)],
    ],
    48,
  );
  granular(tigela, 0.06, 25);
  grupo.add(
    peca(
      tigela,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(CORES.tigela),
        roughness: 0.34,
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    ),
  );

  // Folhas de romana: compridas, dobradas ao meio, com nervura clara
  const matFolha = material(CORES.folha, { roughness: 0.52, receita: 'folha', relevo: 1.33 });
  for (let i = 0; i < 13; i += 1) {
    const comprimento = cm(5 + aleatorio() * 3.5);
    const largura = cm(2.2 + aleatorio() * 1.4);
    const g = new THREE.PlaneGeometry(comprimento, largura, 8, 4);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const x = pos.getX(v) / (comprimento / 2);
      const z = pos.getZ(v) / (largura / 2);
      pos.setZ(v, pos.getZ(v) * (1 - x * x * 0.55));
      // Dobra em V ao longo da nervura + ondulação na borda
      pos.setY(v, Math.abs(z) * largura * 0.34 + Math.sin(x * 5 + i) * cm(0.22));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    pintar(g, (x, y, z) => {
      const nervura = Math.abs(z) < cm(0.22) ? 1.45 : 1;
      return [nervura * 0.94, nervura, nervura * 0.86];
    });

    const angulo = i * 2.399;
    const raio = cm(1 + (i % 5) * 1.5);
    grupo.add(
      peca(g, matFolha, {
        x: Math.cos(angulo) * raio,
        z: Math.sin(angulo) * raio,
        y: cm(3.4) + (i % 4) * cm(0.75),
        rotacao: [(aleatorio() - 0.5) * 0.5, angulo, (aleatorio() - 0.5) * 0.5],
      }),
    );
  }

  const matCrouton = material(CORES.crouton, { roughness: 0.82, receita: 'empanado', relevo: 2.09 });
  for (let i = 0; i < 8; i += 1) {
    const lado = cm(1.4 + aleatorio() * 0.5);
    const g = new RoundedBoxGeometry(lado, lado, lado, 1, lado * 0.12);
    deformar(g, { amplitude: cm(0.06), frequencia: 40, semente: i * 9 });
    pintar(g, (x, y, z) => 0.86 + fbm(x * 80, y * 80, z * 80, 2) * 0.36);
    const angulo = i * 1.7;
    grupo.add(
      peca(g, matCrouton, {
        x: Math.cos(angulo) * cm(3.6),
        z: Math.sin(angulo) * cm(3.6),
        y: cm(5.4) + aleatorio() * cm(0.6),
        rotacao: [angulo, angulo * 0.6, angulo * 0.3],
      }),
    );
  }

  // Lascas de parmesão: finas e curvadas, não plaquinhas retas
  const matParmesao = material(CORES.parmesao, { roughness: 0.5, receita: 'empanado', relevo: 1.14 });
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.PlaneGeometry(cm(1.9), cm(1.2), 6, 3);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const x = pos.getX(v) / cm(0.95);
      pos.setY(v, x * x * cm(0.18));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    granular(g, 0.1, 80);

    const angulo = i * 2.1;
    grupo.add(
      peca(g, matParmesao, {
        x: Math.cos(angulo) * cm(4.4),
        z: Math.sin(angulo) * cm(4.4),
        y: cm(5.9),
        rotacao: [(aleatorio() - 0.5) * 0.6, angulo, (aleatorio() - 0.5) * 0.6],
      }),
    );
  }

  return grupo;
}
